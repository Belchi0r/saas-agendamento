import type { DateAvailabilityException } from "@/domain/availability/date-availability";
import type { BlockedPeriod } from "@/domain/availability/blocked-period";
import {
  isValidLocalDate,
  localTimeToSeconds,
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
    | "BLOCKED_PERIOD_CONFLICT";
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
