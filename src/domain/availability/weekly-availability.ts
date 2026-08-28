export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WeeklyInterval = Readonly<{
  id: string;
  weekday: IsoWeekday;
  startLocalTime: string;
  endLocalTime: string;
}>;

export type WeeklyWorkingWindow = WeeklyInterval &
  Readonly<{
    businessId: string;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type WeeklyBreak = WeeklyInterval &
  Readonly<{
    businessId: string;
  }>;

export type WeeklyAvailabilityState = Readonly<{
  workingWindows: readonly WeeklyWorkingWindow[];
  breaks: readonly WeeklyBreak[];
}>;

export type WeeklyRangeDraft = Readonly<{
  weekday: number;
  startLocalTime: string;
  endLocalTime: string;
}>;

export type WeeklyDayReplacement = Readonly<{
  weekday: number;
  workingWindow: Readonly<{
    id: string;
    startLocalTime: string;
    endLocalTime: string;
  }>;
  weeklyBreak: Readonly<{
    id: string;
    startLocalTime: string;
    endLocalTime: string;
  }> | null;
}>;

export type WeeklyAvailabilityMutation =
  | Readonly<{
      kind: "create-working-window";
      id: string;
      range: WeeklyRangeDraft;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "update-working-window";
      id: string;
      range: WeeklyRangeDraft;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "delete-working-window";
      id: string;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "create-break";
      id: string;
      range: WeeklyRangeDraft;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "update-break";
      id: string;
      range: WeeklyRangeDraft;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "delete-break";
      id: string;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "replace-days";
      replacements: readonly WeeklyDayReplacement[];
      confirmReplaceExisting: boolean;
      expectedAvailabilityVersion: number;
    }>;

export type WeeklyAvailabilityRuleCode =
  | "WEEKLY_RANGE_INVALID"
  | "WEEKLY_ITEM_NOT_FOUND"
  | "WORKING_WINDOW_OVERLAP"
  | "WEEKLY_BREAK_OVERLAP"
  | "WEEKLY_BREAK_OUTSIDE_WORKING_WINDOW"
  | "WEEKLY_REPLACEMENT_CONFIRMATION_REQUIRED";

export class WeeklyAvailabilityRuleError extends Error {
  constructor(readonly code: WeeklyAvailabilityRuleCode) {
    super(code);
    this.name = "WeeklyAvailabilityRuleError";
  }
}

function localTimeToSeconds(value: string): number | null {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.exec(value);
  if (!match) return null;

  const [hours, minutes, seconds = "0"] = value.split(":");
  return Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds);
}

function assertRange(interval: Pick<WeeklyInterval, "weekday" | "startLocalTime" | "endLocalTime">): void {
  const start = localTimeToSeconds(interval.startLocalTime);
  const end = localTimeToSeconds(interval.endLocalTime);

  if (
    !Number.isInteger(interval.weekday) ||
    interval.weekday < 1 ||
    interval.weekday > 7 ||
    start === null ||
    end === null ||
    start >= end
  ) {
    throw new WeeklyAvailabilityRuleError("WEEKLY_RANGE_INVALID");
  }
}

export function weeklyIntervalsOverlap(
  left: Pick<WeeklyInterval, "weekday" | "startLocalTime" | "endLocalTime">,
  right: Pick<WeeklyInterval, "weekday" | "startLocalTime" | "endLocalTime">,
): boolean {
  if (left.weekday !== right.weekday) return false;

  const leftStart = localTimeToSeconds(left.startLocalTime);
  const leftEnd = localTimeToSeconds(left.endLocalTime);
  const rightStart = localTimeToSeconds(right.startLocalTime);
  const rightEnd = localTimeToSeconds(right.endLocalTime);

  if (
    leftStart === null ||
    leftEnd === null ||
    rightStart === null ||
    rightEnd === null
  ) {
    throw new WeeklyAvailabilityRuleError("WEEKLY_RANGE_INVALID");
  }

  return leftStart < rightEnd && rightStart < leftEnd;
}

function assertNoOverlap(
  intervals: readonly WeeklyInterval[],
  code: "WORKING_WINDOW_OVERLAP" | "WEEKLY_BREAK_OVERLAP",
): void {
  for (let index = 0; index < intervals.length; index += 1) {
    const current = intervals[index];
    if (!current) continue;
    assertRange(current);

    for (let comparison = index + 1; comparison < intervals.length; comparison += 1) {
      const candidate = intervals[comparison];
      if (candidate && weeklyIntervalsOverlap(current, candidate)) {
        throw new WeeklyAvailabilityRuleError(code);
      }
    }
  }
}

export function assertWeeklyAvailabilityState(
  state: Readonly<{
    workingWindows: readonly WeeklyInterval[];
    breaks: readonly WeeklyInterval[];
  }>,
): void {
  assertNoOverlap(state.workingWindows, "WORKING_WINDOW_OVERLAP");
  assertNoOverlap(state.breaks, "WEEKLY_BREAK_OVERLAP");

  for (const weeklyBreak of state.breaks) {
    const intersectsWorkingTime = state.workingWindows.some((window) =>
      weeklyIntervalsOverlap(weeklyBreak, window),
    );

    if (!intersectsWorkingTime) {
      throw new WeeklyAvailabilityRuleError(
        "WEEKLY_BREAK_OUTSIDE_WORKING_WINDOW",
      );
    }
  }
}

export function assertWeeklyAvailabilityMutation(
  state: Pick<WeeklyAvailabilityState, "workingWindows" | "breaks">,
  mutation: WeeklyAvailabilityMutation,
): void {
  let workingWindows: WeeklyInterval[] = state.workingWindows.map((item) => ({
    id: item.id,
    weekday: item.weekday,
    startLocalTime: item.startLocalTime,
    endLocalTime: item.endLocalTime,
  }));
  let breaks: WeeklyInterval[] = state.breaks.map((item) => ({
    id: item.id,
    weekday: item.weekday,
    startLocalTime: item.startLocalTime,
    endLocalTime: item.endLocalTime,
  }));

  const rangeFor = (id: string, range: WeeklyRangeDraft): WeeklyInterval => {
    assertWeeklyRangeDraft(range);
    return {
      id,
      weekday: range.weekday,
      startLocalTime: range.startLocalTime,
      endLocalTime: range.endLocalTime,
    };
  };

  const replace = (
    intervals: WeeklyInterval[],
    id: string,
    range: WeeklyRangeDraft,
  ): WeeklyInterval[] => {
    if (!intervals.some((item) => item.id === id)) {
      throw new WeeklyAvailabilityRuleError("WEEKLY_ITEM_NOT_FOUND");
    }

    return intervals.map((item) =>
      item.id === id ? rangeFor(id, range) : item,
    );
  };

  const remove = (intervals: WeeklyInterval[], id: string): WeeklyInterval[] => {
    if (!intervals.some((item) => item.id === id)) {
      throw new WeeklyAvailabilityRuleError("WEEKLY_ITEM_NOT_FOUND");
    }

    return intervals.filter((item) => item.id !== id);
  };

  switch (mutation.kind) {
    case "create-working-window":
      workingWindows.push(rangeFor(mutation.id, mutation.range));
      break;
    case "update-working-window":
      workingWindows = replace(workingWindows, mutation.id, mutation.range);
      break;
    case "delete-working-window":
      workingWindows = remove(workingWindows, mutation.id);
      break;
    case "create-break":
      breaks.push(rangeFor(mutation.id, mutation.range));
      break;
    case "update-break":
      breaks = replace(breaks, mutation.id, mutation.range);
      break;
    case "delete-break":
      breaks = remove(breaks, mutation.id);
      break;
    case "replace-days": {
      const weekdays = mutation.replacements.map((item) => item.weekday);
      if (
        weekdays.length === 0 ||
        new Set(weekdays).size !== weekdays.length
      ) {
        throw new WeeklyAvailabilityRuleError("WEEKLY_RANGE_INVALID");
      }

      const hasExistingConfiguration = workingWindows.some((item) =>
        weekdays.includes(item.weekday),
      ) || breaks.some((item) => weekdays.includes(item.weekday));
      if (hasExistingConfiguration && !mutation.confirmReplaceExisting) {
        throw new WeeklyAvailabilityRuleError(
          "WEEKLY_REPLACEMENT_CONFIRMATION_REQUIRED",
        );
      }

      workingWindows = workingWindows.filter(
        (item) => !weekdays.includes(item.weekday),
      );
      breaks = breaks.filter((item) => !weekdays.includes(item.weekday));
      for (const replacement of mutation.replacements) {
        workingWindows.push(rangeFor(replacement.workingWindow.id, {
          weekday: replacement.weekday,
          startLocalTime: replacement.workingWindow.startLocalTime,
          endLocalTime: replacement.workingWindow.endLocalTime,
        }));
        if (replacement.weeklyBreak) {
          breaks.push(rangeFor(replacement.weeklyBreak.id, {
            weekday: replacement.weekday,
            startLocalTime: replacement.weeklyBreak.startLocalTime,
            endLocalTime: replacement.weeklyBreak.endLocalTime,
          }));
        }
      }
      break;
    }
  }

  assertWeeklyAvailabilityState({ workingWindows, breaks });
}

export function assertWeeklyRangeDraft(input: WeeklyRangeDraft): asserts input is Readonly<{
  weekday: IsoWeekday;
  startLocalTime: string;
  endLocalTime: string;
}> {
  assertRange({ id: "draft", ...input } as WeeklyInterval);
}
