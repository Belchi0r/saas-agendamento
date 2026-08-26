import { randomUUID } from "node:crypto";

import {
  assertDateAvailabilityExceptionDraft,
  DateAvailabilityRuleError,
  type DateAvailabilityExceptionDraft,
} from "@/domain/availability/date-availability";
import { ApplicationError } from "@/shared/errors/application-error";

import type {
  DateAvailabilityRepository,
  DateAvailabilitySnapshot,
} from "./date-availability-repository";

export type DateAvailabilityCommand = DateAvailabilityExceptionDraft &
  Readonly<{
    expectedAvailabilityVersion: number;
  }>;

export type UpdateDateAvailabilityCommand = DateAvailabilityCommand &
  Readonly<{ expectedVersion: number }>;

function validatePositiveVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ApplicationError(
      "AVAILABILITY_VERSION_INVALID",
      "A versão da disponibilidade é inválida.",
      400,
    );
  }
}

function validateDraft(input: DateAvailabilityExceptionDraft): void {
  try {
    assertDateAvailabilityExceptionDraft(input);
  } catch (error) {
    if (error instanceof DateAvailabilityRuleError) {
      throw new ApplicationError(
        error.code,
        error.code === "DATE_EXCEPTION_WINDOW_OVERLAP"
          ? "As faixas especiais não podem se sobrepor."
          : "Revise a data e as faixas especiais informadas.",
        error.code === "DATE_EXCEPTION_WINDOW_OVERLAP" ? 409 : 400,
      );
    }
    throw error;
  }
}

export function getDateAvailability(
  repository: DateAvailabilityRepository,
): Promise<DateAvailabilitySnapshot> {
  return repository.getSnapshot();
}

export function createDateAvailabilityException(
  repository: DateAvailabilityRepository,
  input: DateAvailabilityCommand,
): Promise<DateAvailabilitySnapshot> {
  validatePositiveVersion(input.expectedAvailabilityVersion);
  validateDraft(input);
  return repository.applyMutation({
    kind: "create",
    id: randomUUID(),
    draft: input,
    windowIds: input.workingWindows.map(() => randomUUID()),
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}

export function updateDateAvailabilityException(
  repository: DateAvailabilityRepository,
  id: string,
  input: UpdateDateAvailabilityCommand,
): Promise<DateAvailabilitySnapshot> {
  validatePositiveVersion(input.expectedAvailabilityVersion);
  validatePositiveVersion(input.expectedVersion);
  validateDraft(input);
  return repository.applyMutation({
    kind: "update",
    id,
    draft: input,
    windowIds: input.workingWindows.map(() => randomUUID()),
    expectedVersion: input.expectedVersion,
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}

export function deleteDateAvailabilityException(
  repository: DateAvailabilityRepository,
  id: string,
  expectedVersion: number,
  expectedAvailabilityVersion: number,
): Promise<DateAvailabilitySnapshot> {
  validatePositiveVersion(expectedVersion);
  validatePositiveVersion(expectedAvailabilityVersion);
  return repository.applyMutation({
    kind: "delete",
    id,
    expectedVersion,
    expectedAvailabilityVersion,
  });
}
