import {
  assertLocalInterval,
  isValidLocalDate,
  localIntervalsOverlap,
  type LocalTimeInterval,
} from "./local-interval";

export type DateAvailabilityMode = "CLOSED" | "REPLACE";

export type ExceptionWorkingWindow = LocalTimeInterval &
  Readonly<{
    id: string;
    dateExceptionId: string;
  }>;

export type DateAvailabilityException = Readonly<{
  id: string;
  businessId: string;
  localDate: string;
  mode: DateAvailabilityMode;
  privateNote: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  workingWindows: readonly ExceptionWorkingWindow[];
}>;

export type ExceptionWindowDraft = LocalTimeInterval;

export type DateAvailabilityExceptionDraft = Readonly<{
  localDate: string;
  mode: DateAvailabilityMode;
  privateNote: string | null;
  workingWindows: readonly ExceptionWindowDraft[];
}>;

export type DateAvailabilityMutation =
  | Readonly<{
      kind: "create";
      id: string;
      draft: DateAvailabilityExceptionDraft;
      windowIds: readonly string[];
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "update";
      id: string;
      draft: DateAvailabilityExceptionDraft;
      windowIds: readonly string[];
      expectedVersion: number;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "delete";
      id: string;
      expectedVersion: number;
      expectedAvailabilityVersion: number;
    }>;

export type DateAvailabilityRuleCode =
  | "DATE_EXCEPTION_INVALID"
  | "DATE_EXCEPTION_ITEM_NOT_FOUND"
  | "DATE_EXCEPTION_WINDOW_OVERLAP";

export class DateAvailabilityRuleError extends Error {
  constructor(readonly code: DateAvailabilityRuleCode) {
    super(code);
    this.name = "DateAvailabilityRuleError";
  }
}

export function assertDateAvailabilityExceptionDraft(
  draft: DateAvailabilityExceptionDraft,
): void {
  if (
    !isValidLocalDate(draft.localDate) ||
    (draft.mode !== "CLOSED" && draft.mode !== "REPLACE") ||
    (draft.privateNote !== null && draft.privateNote.trim() === "") ||
    (draft.mode === "CLOSED" && draft.workingWindows.length !== 0) ||
    (draft.mode === "REPLACE" && draft.workingWindows.length === 0)
  ) {
    throw new DateAvailabilityRuleError("DATE_EXCEPTION_INVALID");
  }

  for (let index = 0; index < draft.workingWindows.length; index += 1) {
    const current = draft.workingWindows[index];
    if (!current) continue;

    try {
      assertLocalInterval(current);
    } catch {
      throw new DateAvailabilityRuleError("DATE_EXCEPTION_INVALID");
    }

    for (let otherIndex = index + 1; otherIndex < draft.workingWindows.length; otherIndex += 1) {
      const other = draft.workingWindows[otherIndex];
      if (other && localIntervalsOverlap(current, other)) {
        throw new DateAvailabilityRuleError("DATE_EXCEPTION_WINDOW_OVERLAP");
      }
    }
  }
}

export function assertDateAvailabilityMutation(
  current: readonly DateAvailabilityException[],
  mutation: DateAvailabilityMutation,
): void {
  if (mutation.kind === "delete") {
    if (!current.some((item) => item.id === mutation.id)) {
      throw new DateAvailabilityRuleError("DATE_EXCEPTION_ITEM_NOT_FOUND");
    }
    return;
  }

  assertDateAvailabilityExceptionDraft(mutation.draft);
  if (
    mutation.kind === "update" &&
    !current.some((item) => item.id === mutation.id)
  ) {
    throw new DateAvailabilityRuleError("DATE_EXCEPTION_ITEM_NOT_FOUND");
  }
}
