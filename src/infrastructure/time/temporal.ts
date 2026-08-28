import { Temporal } from "@js-temporal/polyfill";

export { Temporal };

const OFFSET_IDENTIFIER = /^[+-]\d{2}(?::?\d{2})?$/;
const NANOS_PER_MINUTE = 60_000_000_000;

export function assertIanaTimeZone(timeZone: string): string {
  const value = timeZone.trim();
  if (!value || OFFSET_IDENTIFIER.test(value)) {
    throw new Error("Invalid IANA timezone.");
  }

  try {
    const canonical = new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
    Temporal.Instant.from("2000-01-01T00:00:00Z").toZonedDateTimeISO(canonical);
    return canonical;
  } catch {
    throw new Error("Invalid IANA timezone.");
  }
}

export function systemIndependentNow(): Temporal.Instant {
  return Temporal.Now.instant();
}

export type LocalDateTimeResolution =
  | Readonly<{
      kind: "NONEXISTENT";
      instantUtc: null;
      offset: null;
      alternativeInstantUtc: null;
    }>
  | Readonly<{
      kind: "UNIQUE" | "AMBIGUOUS_FIRST";
      instantUtc: string;
      offset: string;
      alternativeInstantUtc: string | null;
    }>;

function samePlainDateTime(
  zoned: Temporal.ZonedDateTime,
  plain: Temporal.PlainDateTime,
): boolean {
  return Temporal.PlainDateTime.compare(zoned.toPlainDateTime(), plain) === 0;
}

/** Implements the accepted gap/fold policy without Temporal's compatible shift. */
export function resolveLocalDateTime(
  localDate: string,
  localTime: string,
  timeZoneInput: string,
): LocalDateTimeResolution {
  const timeZone = assertIanaTimeZone(timeZoneInput);
  const plain = Temporal.PlainDate.from(localDate).toPlainDateTime(
    Temporal.PlainTime.from(localTime),
  );
  const earlier = plain.toZonedDateTime(timeZone, {
    disambiguation: "earlier",
  });
  const later = plain.toZonedDateTime(timeZone, { disambiguation: "later" });

  if (!samePlainDateTime(earlier, plain) && !samePlainDateTime(later, plain)) {
    return {
      kind: "NONEXISTENT",
      instantUtc: null,
      offset: null,
      alternativeInstantUtc: null,
    };
  }
  if (!samePlainDateTime(earlier, plain) || !samePlainDateTime(later, plain)) {
    throw new RangeError("Unexpected one-sided Temporal timezone round-trip.");
  }

  const earlierInstant = earlier.toInstant();
  const laterInstant = later.toInstant();
  const ambiguous = Temporal.Instant.compare(earlierInstant, laterInstant) !== 0;
  const chosen =
    ambiguous && Temporal.Instant.compare(laterInstant, earlierInstant) < 0
      ? later
      : earlier;
  const alternative =
    ambiguous && chosen === earlier ? later : ambiguous ? earlier : null;
  if (chosen.offsetNanoseconds % NANOS_PER_MINUTE !== 0) {
    throw new RangeError("Offset cannot be represented in whole minutes.");
  }

  return {
    kind: ambiguous ? "AMBIGUOUS_FIRST" : "UNIQUE",
    instantUtc: chosen.toInstant().toString(),
    offset: chosen.offset,
    alternativeInstantUtc: alternative?.toInstant().toString() ?? null,
  };
}

export function isoWeekdayForLocalDate(localDate: string): number {
  return Temporal.PlainDate.from(localDate).dayOfWeek;
}

export function elapsedEnd(
  startInstantUtc: string,
  durationMinutes: number,
  timeZoneInput: string,
): Readonly<{
  endInstantUtc: string;
  endLocalDate: string;
  endLocalTime: string;
}> {
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
    throw new RangeError("Duration must be a positive integer.");
  }
  const timeZone = assertIanaTimeZone(timeZoneInput);
  const end = Temporal.Instant.from(startInstantUtc).add({
    minutes: durationMinutes,
  });
  const local = end.toZonedDateTimeISO(timeZone);
  return {
    endInstantUtc: end.toString(),
    endLocalDate: local.toPlainDate().toString(),
    endLocalTime: local
      .toPlainTime()
      .toString({ smallestUnit: "minute" }),
  };
}

export function offsetToMinutes(offset: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) throw new RangeError("Invalid UTC offset.");
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}
