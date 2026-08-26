import { Temporal } from "@js-temporal/polyfill";

const NANOS_PER_MINUTE = 60_000_000_000;
const OFFSET_IDENTIFIER = /^[+-]\d{2}(?::?\d{2})?$/;

export class InvalidIanaTimeZoneError extends Error {
  constructor(readonly input: string) {
    super(`Invalid IANA time zone: ${input}`);
    this.name = "InvalidIanaTimeZoneError";
  }
}

export type LocalTimeResolution =
  | Readonly<{
      kind: "NONEXISTENT";
      localDate: string;
      localTime: string;
      timeZone: string;
      instantUtc: null;
      offset: null;
      utcOffsetMinutes: null;
      alternativeInstantUtc: null;
    }>
  | Readonly<{
      kind: "UNIQUE" | "AMBIGUOUS_FIRST";
      localDate: string;
      localTime: string;
      timeZone: string;
      instantUtc: string;
      offset: string;
      utcOffsetMinutes: number;
      alternativeInstantUtc: string | null;
    }>;

export type ConfirmationTimeSnapshot = Readonly<{
  scheduledStartAtUtc: string;
  timezoneSnapshot: string;
  localDateSnapshot: string;
  localTimeSnapshot: string;
  utcOffsetMinutesSnapshot: number;
}>;

export function validateIanaTimeZone(input: string): string {
  const value = input.trim();
  if (!value || OFFSET_IDENTIFIER.test(value)) {
    throw new InvalidIanaTimeZoneError(input);
  }
  try {
    const canonical = new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
    Temporal.Instant.from("2000-01-01T00:00:00Z").toZonedDateTimeISO(canonical);
    return canonical;
  } catch (error) {
    if (error instanceof RangeError) {
      throw new InvalidIanaTimeZoneError(input);
    }
    throw error;
  }
}

function localDateTime(localDate: string, localTime: string) {
  return Temporal.PlainDate.from(localDate).toPlainDateTime(
    Temporal.PlainTime.from(localTime),
  );
}

function matchesInput(
  candidate: Temporal.ZonedDateTime,
  input: Temporal.PlainDateTime,
) {
  return Temporal.PlainDateTime.compare(candidate.toPlainDateTime(), input) === 0;
}

function offsetMinutes(candidate: Temporal.ZonedDateTime) {
  if (candidate.offsetNanoseconds % NANOS_PER_MINUTE !== 0) {
    throw new RangeError(
      "The data model stores offset minutes and cannot represent a sub-minute offset",
    );
  }
  return candidate.offsetNanoseconds / NANOS_PER_MINUTE;
}

export function resolveLocalDateTime(
  localDate: string,
  localTime: string,
  timeZoneInput: string,
): LocalTimeResolution {
  const timeZone = validateIanaTimeZone(timeZoneInput);
  const input = localDateTime(localDate, localTime);
  const normalizedDate = input.toPlainDate().toString();
  const normalizedTime = input.toPlainTime().toString({ smallestUnit: "second" });
  const earlier = input.toZonedDateTime(timeZone, {
    disambiguation: "earlier",
  });
  const later = input.toZonedDateTime(timeZone, {
    disambiguation: "later",
  });
  const earlierMatches = matchesInput(earlier, input);
  const laterMatches = matchesInput(later, input);

  if (!earlierMatches && !laterMatches) {
    return Object.freeze({
      kind: "NONEXISTENT",
      localDate: normalizedDate,
      localTime: normalizedTime,
      timeZone,
      instantUtc: null,
      offset: null,
      utcOffsetMinutes: null,
      alternativeInstantUtc: null,
    });
  }

  if (!earlierMatches || !laterMatches) {
    throw new RangeError("Unexpected one-sided Temporal timezone round-trip");
  }

  const earlierInstant = earlier.toInstant();
  const laterInstant = later.toInstant();
  const ambiguous = Temporal.Instant.compare(earlierInstant, laterInstant) !== 0;
  const chosen = ambiguous && Temporal.Instant.compare(laterInstant, earlierInstant) < 0
    ? later
    : earlier;
  const alternative = ambiguous && chosen === earlier ? later : ambiguous ? earlier : null;

  return Object.freeze({
    kind: ambiguous ? "AMBIGUOUS_FIRST" : "UNIQUE",
    localDate: normalizedDate,
    localTime: normalizedTime,
    timeZone,
    instantUtc: chosen.toInstant().toString(),
    offset: chosen.offset,
    utcOffsetMinutes: offsetMinutes(chosen),
    alternativeInstantUtc: alternative?.toInstant().toString() ?? null,
  });
}

export function requireSlotInstant(
  resolution: LocalTimeResolution,
): Exclude<LocalTimeResolution, { kind: "NONEXISTENT" }> {
  if (resolution.kind === "NONEXISTENT") {
    throw new RangeError("NONEXISTENT_LOCAL_TIME_DOES_NOT_GENERATE_SLOT");
  }
  return resolution;
}

export function createConfirmationSnapshot(
  resolution: Exclude<LocalTimeResolution, { kind: "NONEXISTENT" }>,
): ConfirmationTimeSnapshot {
  return Object.freeze({
    scheduledStartAtUtc: resolution.instantUtc,
    timezoneSnapshot: resolution.timeZone,
    localDateSnapshot: resolution.localDate,
    localTimeSnapshot: resolution.localTime,
    utcOffsetMinutesSnapshot: resolution.utcOffsetMinutes,
  });
}

function offsetStringFromMinutes(minutes: number) {
  if (!Number.isInteger(minutes) || Math.abs(minutes) > 24 * 60) {
    throw new RangeError("Invalid offset minutes snapshot");
  }
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60).toString().padStart(2, "0");
  const remainingMinutes = (absolute % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${remainingMinutes}`;
}

export function reconstructInstantFromSnapshot(
  snapshot: ConfirmationTimeSnapshot,
) {
  const offset = offsetStringFromMinutes(snapshot.utcOffsetMinutesSnapshot);
  return Temporal.Instant.from(
    `${snapshot.localDateSnapshot}T${snapshot.localTimeSnapshot}${offset}`,
  ).toString();
}

export function snapshotPresentation(snapshot: ConfirmationTimeSnapshot) {
  const offset = offsetStringFromMinutes(snapshot.utcOffsetMinutesSnapshot);
  return `${snapshot.localDateSnapshot} ${snapshot.localTimeSnapshot} ${offset} [${snapshot.timezoneSnapshot}]`;
}

export function endAfterElapsedMinutes(
  startInstantUtc: string,
  durationMinutes: number,
  timeZoneInput: string,
) {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new RangeError("Duration must be a positive integer number of minutes");
  }
  const timeZone = validateIanaTimeZone(timeZoneInput);
  const start = Temporal.Instant.from(startInstantUtc);
  const end = start.add({ minutes: durationMinutes });
  return Object.freeze({
    startInstantUtc: start.toString(),
    endInstantUtc: end.toString(),
    elapsedMinutes: start.until(end, { largestUnit: "minute" }).total("minute"),
    endLocal: end.toZonedDateTimeISO(timeZone).toString(),
  });
}

export type UtcInterval = Readonly<{
  startUtc: string;
  endUtc: string;
}>;

export function utcInterval(startUtc: string, endUtc: string): UtcInterval {
  const start = Temporal.Instant.from(startUtc);
  const end = Temporal.Instant.from(endUtc);
  if (Temporal.Instant.compare(start, end) >= 0) {
    throw new RangeError("Half-open interval requires start < end");
  }
  return Object.freeze({ startUtc: start.toString(), endUtc: end.toString() });
}

export function halfOpenIntervalsOverlap(a: UtcInterval, b: UtcInterval) {
  const aStart = Temporal.Instant.from(a.startUtc);
  const aEnd = Temporal.Instant.from(a.endUtc);
  const bStart = Temporal.Instant.from(b.startUtc);
  const bEnd = Temporal.Instant.from(b.endUtc);
  return Temporal.Instant.compare(aStart, bEnd) < 0
    && Temporal.Instant.compare(bStart, aEnd) < 0;
}

export { Temporal };
