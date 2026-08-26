import { randomUUID } from "node:crypto";

import type {
  BlockedPeriodRepository,
  BlockedPeriodSnapshot,
} from "@/application/availability/blocked-period-repository";
import {
  assertBlockedPeriodDraft,
  BlockedPeriodRuleError,
  type BlockedPeriodDraft,
  type ResolvedBlockedPeriodDraft,
} from "@/domain/availability/blocked-period";
import {
  assertIanaTimeZone,
  resolveLocalDateTime,
  Temporal,
} from "@/infrastructure/time/temporal";
import { ApplicationError } from "@/shared/errors/application-error";

export type BlockedPeriodCommand = BlockedPeriodDraft &
  Readonly<{ expectedAvailabilityVersion: number }>;
export type UpdateBlockedPeriodCommand = BlockedPeriodCommand &
  Readonly<{ expectedVersion: number }>;

function validateVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ApplicationError(
      "AVAILABILITY_VERSION_INVALID",
      "A versão da disponibilidade é inválida.",
      400,
    );
  }
}

function resolveDraft(
  input: BlockedPeriodDraft,
  timezoneInput: string | null,
): ResolvedBlockedPeriodDraft {
  try {
    assertBlockedPeriodDraft(input);
  } catch (error) {
    if (error instanceof BlockedPeriodRuleError) {
      throw new ApplicationError(
        error.code,
        "Revise a data e o intervalo do bloqueio.",
        400,
      );
    }
    throw error;
  }

  if (!timezoneInput) {
    throw new ApplicationError(
      "BUSINESS_TIMEZONE_REQUIRED",
      "Configure o timezone do negócio antes de criar bloqueios.",
      409,
    );
  }

  let timezone: string;
  try {
    timezone = assertIanaTimeZone(timezoneInput);
  } catch {
    throw new ApplicationError(
      "BUSINESS_TIMEZONE_INVALID",
      "O timezone do negócio é inválido.",
      503,
    );
  }

  const start = resolveLocalDateTime(
    input.localDate,
    input.startLocalTime,
    timezone,
  );
  const end = resolveLocalDateTime(
    input.localDate,
    input.endLocalTime,
    timezone,
  );
  if (start.kind === "NONEXISTENT" || end.kind === "NONEXISTENT") {
    throw new ApplicationError(
      "BLOCKED_PERIOD_NONEXISTENT_LOCAL_TIME",
      "Este horário não existe no timezone do negócio.",
      400,
    );
  }
  if (
    Temporal.Instant.compare(
      Temporal.Instant.from(start.instantUtc),
      Temporal.Instant.from(end.instantUtc),
    ) >= 0
  ) {
    throw new ApplicationError(
      "BLOCKED_PERIOD_INVALID",
      "O início do bloqueio deve ser anterior ao final.",
      400,
    );
  }

  return {
    startAtUtc: start.instantUtc,
    endAtUtc: end.instantUtc,
    timezoneSnapshot: timezone,
    privateReason: input.privateReason,
  };
}

export function getBlockedPeriods(
  repository: BlockedPeriodRepository,
): Promise<BlockedPeriodSnapshot> {
  return repository.getSnapshot();
}

export async function createBlockedPeriod(
  repository: BlockedPeriodRepository,
  input: BlockedPeriodCommand,
): Promise<BlockedPeriodSnapshot> {
  validateVersion(input.expectedAvailabilityVersion);
  const current = await repository.getSnapshot();
  return repository.applyMutation({
    kind: "create",
    id: randomUUID(),
    occupancyId: randomUUID(),
    draft: resolveDraft(input, current.timezone),
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}

export async function updateBlockedPeriod(
  repository: BlockedPeriodRepository,
  id: string,
  input: UpdateBlockedPeriodCommand,
): Promise<BlockedPeriodSnapshot> {
  validateVersion(input.expectedAvailabilityVersion);
  validateVersion(input.expectedVersion);
  const current = await repository.getSnapshot();
  return repository.applyMutation({
    kind: "update",
    id,
    draft: resolveDraft(input, current.timezone),
    expectedVersion: input.expectedVersion,
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}

export function deactivateBlockedPeriod(
  repository: BlockedPeriodRepository,
  id: string,
  expectedVersion: number,
  expectedAvailabilityVersion: number,
): Promise<BlockedPeriodSnapshot> {
  validateVersion(expectedVersion);
  validateVersion(expectedAvailabilityVersion);
  return repository.applyMutation({
    kind: "deactivate",
    id,
    expectedVersion,
    expectedAvailabilityVersion,
  });
}
