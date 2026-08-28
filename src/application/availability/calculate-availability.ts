import type { DateAvailabilityException } from "@/domain/availability/date-availability";
import type { BlockedPeriod } from "@/domain/availability/blocked-period";
import {
  isValidLocalDate,
  localTimeToSeconds,
  secondsToLocalTime,
  subtractLocalIntervals,
  type LocalTimeInterval,
} from "@/domain/availability/local-interval";
import type {
  WeeklyBreak,
  WeeklyWorkingWindow,
} from "@/domain/availability/weekly-availability";
import {
  assertIanaTimeZone,
  elapsedEnd,
  isoWeekdayForLocalDate,
  resolveLocalDateTime,
  Temporal,
} from "@/infrastructure/time/temporal";
import { ApplicationError } from "@/shared/errors/application-error";

export type AvailabilityCandidate = Readonly<{
  startLocalTime: string;
  startAtUtc: string;
  endAtUtc: string;
  offset: string;
  resolution: "UNIQUE" | "AMBIGUOUS_FIRST";
}>;

export type RejectedAvailabilityCandidate = Readonly<{
  startLocalTime: string;
  reason:
    | "NONEXISTENT_LOCAL_TIME"
    | "OUTSIDE_EFFECTIVE_WINDOW"
    | "BLOCKED_PERIOD_CONFLICT"
    | "SCHEDULE_OCCUPANCY_CONFLICT";
}>;

export type OccupiedScheduleInterval = Readonly<{
  startAtUtc: string;
  endAtUtc: string;
}>;

export type CandidateAvailabilityResult = Readonly<{
  localDate: string;
  timezone: string;
  source: "WEEKLY" | "CLOSED" | "REPLACE";
  durationMinutes: number;
  cadenceApplied: false;
  effectiveWindows: readonly LocalTimeInterval[];
  availableCandidates: readonly AvailabilityCandidate[];
  rejectedCandidates: readonly RejectedAvailabilityCandidate[];
}>;

export function calculateAvailabilityForCandidates(input: Readonly<{
  localDate: string;
  timezone: string;
  serviceDurationMinutes: number;
  candidateLocalTimes: readonly string[];
  weeklyWorkingWindows: readonly WeeklyWorkingWindow[];
  weeklyBreaks: readonly WeeklyBreak[];
  dateException: DateAvailabilityException | null;
  blockedPeriods: readonly BlockedPeriod[];
  scheduleOccupancies?: readonly OccupiedScheduleInterval[];
}>): CandidateAvailabilityResult {
  if (
    !isValidLocalDate(input.localDate) ||
    !Number.isSafeInteger(input.serviceDurationMinutes) ||
    input.serviceDurationMinutes <= 0
  ) {
    throw new ApplicationError(
      "AVAILABILITY_CALCULATION_INPUT_INVALID",
      "Revise a data e a duração do serviço.",
      400,
    );
  }

  let timezone: string;
  try {
    timezone = assertIanaTimeZone(input.timezone);
  } catch {
    throw new ApplicationError(
      "BUSINESS_TIMEZONE_INVALID",
      "O timezone do negócio é inválido.",
      503,
    );
  }

  const weekday = isoWeekdayForLocalDate(input.localDate);
  const weeklyWindows = input.weeklyWorkingWindows
    .filter((window) => window.weekday === weekday)
    .map(toLocalInterval);
  const weeklyBreaks = input.weeklyBreaks
    .filter((weeklyBreak) => weeklyBreak.weekday === weekday)
    .map(toLocalInterval);

  let source: CandidateAvailabilityResult["source"] = "WEEKLY";
  let effectiveWindows = subtractLocalIntervals(weeklyWindows, weeklyBreaks);
  if (input.dateException?.localDate === input.localDate) {
    source = input.dateException.mode;
    effectiveWindows =
      input.dateException.mode === "CLOSED"
        ? []
        : input.dateException.workingWindows.map(toLocalInterval);
  }

  const availableCandidates: AvailabilityCandidate[] = [];
  const rejectedCandidates: RejectedAvailabilityCandidate[] = [];
  for (const candidateLocalTime of [...new Set(input.candidateLocalTimes)]) {
    if (localTimeToSeconds(candidateLocalTime) === null) {
      throw new ApplicationError(
        "AVAILABILITY_CALCULATION_INPUT_INVALID",
        "Revise os horários candidatos.",
        400,
      );
    }

    const resolution = resolveLocalDateTime(
      input.localDate,
      candidateLocalTime,
      timezone,
    );
    if (resolution.kind === "NONEXISTENT") {
      rejectedCandidates.push({
        startLocalTime: candidateLocalTime,
        reason: "NONEXISTENT_LOCAL_TIME",
      });
      continue;
    }

    const end = elapsedEnd(
      resolution.instantUtc,
      input.serviceDurationMinutes,
      timezone,
    );
    const fits = effectiveWindows.some((window) =>
      candidateFitsWindow(
        input.localDate,
        candidateLocalTime,
        end.endLocalDate,
        end.endLocalTime,
        window,
      ),
    );
    if (!fits) {
      rejectedCandidates.push({
        startLocalTime: candidateLocalTime,
        reason: "OUTSIDE_EFFECTIVE_WINDOW",
      });
      continue;
    }

    if (
      input.blockedPeriods.some(
        (blockedPeriod) =>
          blockedPeriod.active &&
          utcIntervalsOverlap(
            resolution.instantUtc,
            end.endInstantUtc,
            blockedPeriod.startAtUtc,
            blockedPeriod.endAtUtc,
          ),
      )
    ) {
      rejectedCandidates.push({
        startLocalTime: candidateLocalTime,
        reason: "BLOCKED_PERIOD_CONFLICT",
      });
      continue;
    }

    if (
      input.scheduleOccupancies?.some((occupancy) =>
        utcIntervalsOverlap(
          resolution.instantUtc,
          end.endInstantUtc,
          occupancy.startAtUtc,
          occupancy.endAtUtc,
        ),
      )
    ) {
      rejectedCandidates.push({
        startLocalTime: candidateLocalTime,
        reason: "SCHEDULE_OCCUPANCY_CONFLICT",
      });
      continue;
    }

    availableCandidates.push({
      startLocalTime: candidateLocalTime,
      startAtUtc: resolution.instantUtc,
      endAtUtc: end.endInstantUtc,
      offset: resolution.offset,
      resolution: resolution.kind,
    });
  }

  availableCandidates.sort((left, right) =>
    Temporal.Instant.compare(
      Temporal.Instant.from(left.startAtUtc),
      Temporal.Instant.from(right.startAtUtc),
    ),
  );

  return {
    localDate: input.localDate,
    timezone,
    source,
    durationMinutes: input.serviceDurationMinutes,
    cadenceApplied: false,
    effectiveWindows,
    availableCandidates,
    rejectedCandidates,
  };
}

export type PublicAvailabilityResult = Omit<CandidateAvailabilityResult, "cadenceApplied"> &
  Readonly<{ cadenceApplied: true; slotStepMinutes: number }>;

export function enumeratePublicAvailability(input: Readonly<{
  localDate: string;
  timezone: string;
  serviceDurationMinutes: number;
  slotStepMinutes: number;
  minimumLeadMinutes: number;
  bookingHorizonDays: number;
  nowUtc: string;
  weeklyWorkingWindows: readonly WeeklyWorkingWindow[];
  weeklyBreaks: readonly WeeklyBreak[];
  dateException: DateAvailabilityException | null;
  blockedPeriods: readonly BlockedPeriod[];
  scheduleOccupancies: readonly OccupiedScheduleInterval[];
}>): PublicAvailabilityResult {
  if (input.slotStepMinutes !== 15 || !Number.isSafeInteger(input.minimumLeadMinutes) || input.minimumLeadMinutes < 0 || !Number.isSafeInteger(input.bookingHorizonDays) || input.bookingHorizonDays <= 0) {
    throw new ApplicationError("BOOKING_POLICY_INVALID", "A agenda pública ainda não está configurada.", 503);
  }
  const timezone = assertIanaTimeZone(input.timezone);
  const now = Temporal.Instant.from(input.nowUtc);
  const today = now.toZonedDateTimeISO(timezone).toPlainDate();
  const requestedDate = Temporal.PlainDate.from(input.localDate);
  const horizonEnd = today.add({ days: input.bookingHorizonDays });
  if (Temporal.PlainDate.compare(requestedDate, today) < 0 || Temporal.PlainDate.compare(requestedDate, horizonEnd) > 0) {
    throw new ApplicationError("BOOKING_DATE_OUTSIDE_HORIZON", "Escolha uma data dentro do período disponível.", 400);
  }
  const basis = calculateAvailabilityForCandidates({ ...input, candidateLocalTimes: [] });
  const stepSeconds = input.slotStepMinutes * 60;
  const candidates = basis.effectiveWindows.flatMap((window) => {
    const values: string[] = [];
    for (let current = localTimeToSeconds(window.startLocalTime)!; current < localTimeToSeconds(window.endLocalTime)!; current += stepSeconds) values.push(secondsToLocalTime(current));
    return values;
  });
  const calculated = calculateAvailabilityForCandidates({ ...input, candidateLocalTimes: candidates });
  const earliest = now.add({ minutes: input.minimumLeadMinutes });
  return {
    ...calculated,
    cadenceApplied: true,
    slotStepMinutes: input.slotStepMinutes,
    availableCandidates: calculated.availableCandidates.filter((candidate) =>
      Temporal.Instant.compare(Temporal.Instant.from(candidate.startAtUtc), earliest) >= 0),
  };
}

function utcIntervalsOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
): boolean {
  return (
    Temporal.Instant.compare(
      Temporal.Instant.from(leftStart),
      Temporal.Instant.from(rightEnd),
    ) < 0 &&
    Temporal.Instant.compare(
      Temporal.Instant.from(rightStart),
      Temporal.Instant.from(leftEnd),
    ) < 0
  );
}

function toLocalInterval(
  interval: Readonly<{ startLocalTime: string; endLocalTime: string }>,
): LocalTimeInterval {
  return {
    startLocalTime: interval.startLocalTime,
    endLocalTime: interval.endLocalTime,
  };
}

function candidateFitsWindow(
  startLocalDate: string,
  startLocalTime: string,
  endLocalDate: string,
  endLocalTime: string,
  window: LocalTimeInterval,
): boolean {
  if (endLocalDate !== startLocalDate) return false;
  const start = localTimeToSeconds(startLocalTime)!;
  const end = localTimeToSeconds(endLocalTime)!;
  const windowStart = localTimeToSeconds(window.startLocalTime)!;
  const windowEnd = localTimeToSeconds(window.endLocalTime)!;
  return start >= windowStart && end <= windowEnd;
}
