export type Service = Readonly<{
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currencyCode: string;
  durationMinutes: number;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ServiceDraft = Readonly<{
  name: string;
  description: string | null;
  priceMinor: number;
  durationMinutes: number;
  active: boolean;
}>;

export type ServiceChanges = Omit<ServiceDraft, "active"> &
  Readonly<{ expectedVersion: number }>;

export type ServiceStatusChange = Readonly<{
  active: boolean;
  expectedVersion: number;
}>;

export function normalizeServiceText(input: ServiceDraft): ServiceDraft {
  const description = input.description?.trim() ?? null;

  return {
    ...input,
    name: input.name.trim(),
    description: description === "" ? null : description,
  };
}

export function assertServiceInvariants(input: ServiceDraft): void {
  if (input.name.trim() === "") {
    throw new Error("SERVICE_NAME_REQUIRED");
  }

  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0) {
    throw new Error("SERVICE_PRICE_MINOR_INVALID");
  }

  if (!Number.isSafeInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error("SERVICE_DURATION_INVALID");
  }
}
