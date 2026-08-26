export type LocalTimeInterval = Readonly<{
  startLocalTime: string;
  endLocalTime: string;
}>;

export function localTimeToSeconds(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    return null;
  }

  const [hours, minutes, seconds = "0"] = value.split(":");
  return Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds);
}

export function secondsToLocalTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 86_400) {
    throw new RangeError("Invalid local wall-clock second.");
  }

  const hours = Math.floor(value / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((value % 3_600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (value % 60).toString().padStart(2, "0");
  return seconds === "00" ? `${hours}:${minutes}` : `${hours}:${minutes}:${seconds}`;
}

export function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (days[month - 1] ?? 0);
}

export function assertLocalInterval(interval: LocalTimeInterval): void {
  const start = localTimeToSeconds(interval.startLocalTime);
  const end = localTimeToSeconds(interval.endLocalTime);
  if (start === null || end === null || start >= end) {
    throw new RangeError("Local interval requires a valid start before end.");
  }
}

export function localIntervalsOverlap(
  left: LocalTimeInterval,
  right: LocalTimeInterval,
): boolean {
  assertLocalInterval(left);
  assertLocalInterval(right);
  return (
    localTimeToSeconds(left.startLocalTime)! <
      localTimeToSeconds(right.endLocalTime)! &&
    localTimeToSeconds(right.startLocalTime)! <
      localTimeToSeconds(left.endLocalTime)!
  );
}

/** Subtracts half-open local intervals and keeps adjacent boundaries valid. */
export function subtractLocalIntervals(
  sources: readonly LocalTimeInterval[],
  exclusions: readonly LocalTimeInterval[],
): LocalTimeInterval[] {
  let remaining = sources.map((item) => {
    assertLocalInterval(item);
    return {
      start: localTimeToSeconds(item.startLocalTime)!,
      end: localTimeToSeconds(item.endLocalTime)!,
    };
  });

  for (const exclusion of exclusions) {
    assertLocalInterval(exclusion);
    const exclusionStart = localTimeToSeconds(exclusion.startLocalTime)!;
    const exclusionEnd = localTimeToSeconds(exclusion.endLocalTime)!;
    remaining = remaining.flatMap((item) => {
      if (exclusionStart >= item.end || exclusionEnd <= item.start) return [item];

      const parts: Array<{ start: number; end: number }> = [];
      if (item.start < exclusionStart) {
        parts.push({ start: item.start, end: Math.min(item.end, exclusionStart) });
      }
      if (exclusionEnd < item.end) {
        parts.push({ start: Math.max(item.start, exclusionEnd), end: item.end });
      }
      return parts;
    });
  }

  return remaining
    .filter((item) => item.start < item.end)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((item) => ({
      startLocalTime: secondsToLocalTime(item.start),
      endLocalTime: secondsToLocalTime(item.end),
    }));
}
