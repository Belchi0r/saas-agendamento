import {
  assertLocalInterval,
  isValidLocalDate,
  type LocalTimeInterval,
} from "./local-interval";

export type BlockedPeriod = Readonly<{
  id: string;
  businessId: string;
  startAtUtc: string;
  endAtUtc: string;
  timezoneSnapshot: string;
  privateReason: string | null;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type BlockedPeriodDraft = LocalTimeInterval &
  Readonly<{
    localDate: string;
    privateReason: string | null;
  }>;

export type ResolvedBlockedPeriodDraft = Readonly<{
  startAtUtc: string;
  endAtUtc: string;
  timezoneSnapshot: string;
  privateReason: string | null;
}>;

export type BlockedPeriodMutation =
  | Readonly<{
      kind: "create";
      id: string;
      occupancyId: string;
      draft: ResolvedBlockedPeriodDraft;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "update";
      id: string;
      draft: ResolvedBlockedPeriodDraft;
      expectedVersion: number;
      expectedAvailabilityVersion: number;
    }>
  | Readonly<{
      kind: "deactivate";
      id: string;
      expectedVersion: number;
      expectedAvailabilityVersion: number;
    }>;

export class BlockedPeriodRuleError extends Error {
  constructor(
    readonly code: "BLOCKED_PERIOD_INVALID" | "BLOCKED_PERIOD_NOT_FOUND",
  ) {
    super(code);
    this.name = "BlockedPeriodRuleError";
  }
}

export function assertBlockedPeriodDraft(draft: BlockedPeriodDraft): void {
  if (
    !isValidLocalDate(draft.localDate) ||
    (draft.privateReason !== null && draft.privateReason.trim() === "")
  ) {
    throw new BlockedPeriodRuleError("BLOCKED_PERIOD_INVALID");
  }

  try {
    assertLocalInterval(draft);
  } catch {
    throw new BlockedPeriodRuleError("BLOCKED_PERIOD_INVALID");
  }
}
