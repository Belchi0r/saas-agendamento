import { randomUUID } from "node:crypto";

import {
  assertWeeklyRangeDraft,
  WeeklyAvailabilityRuleError,
  type WeeklyRangeDraft,
} from "@/domain/availability/weekly-availability";
import { ApplicationError } from "@/shared/errors/application-error";

import type {
  WeeklyAvailabilityRepository,
  WeeklyAvailabilitySnapshot,
} from "./weekly-availability-repository";

export type WeeklyRangeCommand = WeeklyRangeDraft &
  Readonly<{ expectedAvailabilityVersion: number }>;

export type ReplaceWeeklyDaysCommand = Readonly<{
  weekdays: readonly number[];
  workingStartLocalTime: string;
  workingEndLocalTime: string;
  breakStartLocalTime: string | null;
  breakEndLocalTime: string | null;
  confirmReplaceExisting: boolean;
  expectedAvailabilityVersion: number;
}>;

function validateExpectedVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new ApplicationError(
      "AVAILABILITY_VERSION_INVALID",
      "A versão dos horários é inválida.",
      400,
    );
  }
}

function validateRange(input: WeeklyRangeDraft): void {
  try {
    assertWeeklyRangeDraft(input);
  } catch (error) {
    if (error instanceof WeeklyAvailabilityRuleError) {
      throw new ApplicationError(
        "WEEKLY_RANGE_INVALID",
        "Informe um dia e um horário inicial anterior ao final.",
        400,
      );
    }
    throw error;
  }
}

function validateRangeCommand(input: WeeklyRangeCommand): void {
  validateExpectedVersion(input.expectedAvailabilityVersion);
  validateRange(input);
}

export function getWeeklyAvailability(
  repository: WeeklyAvailabilityRepository,
): Promise<WeeklyAvailabilitySnapshot> {
  return repository.getSnapshot();
}

export function createWorkingWindow(
  repository: WeeklyAvailabilityRepository,
  input: WeeklyRangeCommand,
): Promise<WeeklyAvailabilitySnapshot> {
  validateRangeCommand(input);
  return repository.applyMutation({
    kind: "create-working-window",
    id: randomUUID(),
    range: input,
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}

export function updateWorkingWindow(
  repository: WeeklyAvailabilityRepository,
  id: string,
  input: WeeklyRangeCommand,
): Promise<WeeklyAvailabilitySnapshot> {
  validateRangeCommand(input);
  return repository.applyMutation({
    kind: "update-working-window",
    id,
    range: input,
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}

export function deleteWorkingWindow(
  repository: WeeklyAvailabilityRepository,
  id: string,
  expectedAvailabilityVersion: number,
): Promise<WeeklyAvailabilitySnapshot> {
  validateExpectedVersion(expectedAvailabilityVersion);
  return repository.applyMutation({
    kind: "delete-working-window",
    id,
    expectedAvailabilityVersion,
  });
}

export function createWeeklyBreak(
  repository: WeeklyAvailabilityRepository,
  input: WeeklyRangeCommand,
): Promise<WeeklyAvailabilitySnapshot> {
  validateRangeCommand(input);
  return repository.applyMutation({
    kind: "create-break",
    id: randomUUID(),
    range: input,
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}

export function updateWeeklyBreak(
  repository: WeeklyAvailabilityRepository,
  id: string,
  input: WeeklyRangeCommand,
): Promise<WeeklyAvailabilitySnapshot> {
  validateRangeCommand(input);
  return repository.applyMutation({
    kind: "update-break",
    id,
    range: input,
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}

export function deleteWeeklyBreak(
  repository: WeeklyAvailabilityRepository,
  id: string,
  expectedAvailabilityVersion: number,
): Promise<WeeklyAvailabilitySnapshot> {
  validateExpectedVersion(expectedAvailabilityVersion);
  return repository.applyMutation({
    kind: "delete-break",
    id,
    expectedAvailabilityVersion,
  });
}

export function replaceWeeklyDays(
  repository: WeeklyAvailabilityRepository,
  input: ReplaceWeeklyDaysCommand,
): Promise<WeeklyAvailabilitySnapshot> {
  validateExpectedVersion(input.expectedAvailabilityVersion);
  if (
    input.weekdays.length === 0 ||
    new Set(input.weekdays).size !== input.weekdays.length ||
    (input.breakStartLocalTime === null) !== (input.breakEndLocalTime === null)
  ) {
    throw new ApplicationError(
      "WEEKLY_RANGE_INVALID",
      "Selecione os dias e revise os horários informados.",
      400,
    );
  }

  for (const weekday of input.weekdays) {
    validateRange({
      weekday,
      startLocalTime: input.workingStartLocalTime,
      endLocalTime: input.workingEndLocalTime,
    });
    if (input.breakStartLocalTime && input.breakEndLocalTime) {
      validateRange({
        weekday,
        startLocalTime: input.breakStartLocalTime,
        endLocalTime: input.breakEndLocalTime,
      });
    }
  }

  return repository.applyMutation({
    kind: "replace-days",
    replacements: input.weekdays.map((weekday) => ({
      weekday,
      workingWindow: {
        id: randomUUID(),
        startLocalTime: input.workingStartLocalTime,
        endLocalTime: input.workingEndLocalTime,
      },
      weeklyBreak: input.breakStartLocalTime && input.breakEndLocalTime
        ? {
            id: randomUUID(),
            startLocalTime: input.breakStartLocalTime,
            endLocalTime: input.breakEndLocalTime,
          }
        : null,
    })),
    confirmReplaceExisting: input.confirmReplaceExisting,
    expectedAvailabilityVersion: input.expectedAvailabilityVersion,
  });
}
