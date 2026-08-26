import { randomUUID } from "node:crypto";

import {
  assertServiceInvariants,
  normalizeServiceText,
  type Service,
  type ServiceChanges,
  type ServiceDraft,
  type ServiceStatusChange,
} from "@/domain/services/service";
import { ApplicationError } from "@/shared/errors/application-error";

import type { ServiceRepository } from "./service-repository";

function validateExpectedVersion(expectedVersion: number): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0) {
    throw new ApplicationError(
      "SERVICE_VERSION_INVALID",
      "A versão do serviço é inválida.",
      400,
    );
  }
}

function validateDraft(input: ServiceDraft): ServiceDraft {
  const normalized = normalizeServiceText(input);

  try {
    assertServiceInvariants(normalized);
  } catch {
    throw new ApplicationError(
      "SERVICE_DATA_INVALID",
      "Revise os dados do serviço.",
      400,
    );
  }

  return normalized;
}

export function listAdminServices(repository: ServiceRepository): Promise<Service[]> {
  return repository.listAll();
}

export function listPublicServices(repository: ServiceRepository): Promise<Service[]> {
  return repository.listActive();
}

export function createService(
  repository: ServiceRepository,
  input: ServiceDraft,
): Promise<Service> {
  return repository.create(randomUUID(), validateDraft(input));
}

export function updateService(
  repository: ServiceRepository,
  id: string,
  input: ServiceChanges,
): Promise<Service> {
  validateExpectedVersion(input.expectedVersion);
  const normalized = validateDraft({ ...input, active: true });

  return repository.update(id, {
    name: normalized.name,
    description: normalized.description,
    priceMinor: normalized.priceMinor,
    durationMinutes: normalized.durationMinutes,
    expectedVersion: input.expectedVersion,
  });
}

export function setServiceActive(
  repository: ServiceRepository,
  id: string,
  input: ServiceStatusChange,
): Promise<Service> {
  validateExpectedVersion(input.expectedVersion);
  return repository.setActive(id, input);
}
