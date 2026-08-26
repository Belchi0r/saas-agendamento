import { createHash } from "node:crypto";

export const FINGERPRINT_VERSION = "book-appointment/v1";

export type RawBookingCommand = {
  serviceId: string;
  startAt: string;
  customerName: string;
  whatsappE164: string;
  notes?: string | null;
};

export type CanonicalBookingCommand = {
  version: typeof FINGERPRINT_VERSION;
  customer: { name: string; whatsappE164: string };
  schedule: { serviceId: string; startAt: string };
  notes: string | null;
};

export function normalizeCommand(input: RawBookingCommand): CanonicalBookingCommand {
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.valueOf())) throw new Error("INVALID_START_AT");
  const name = input.customerName.normalize("NFC").trim().replace(/\s+/g, " ");
  const phone = input.whatsappE164.replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("INVALID_WHATSAPP");
  return {
    version: FINGERPRINT_VERSION,
    customer: { name, whatsappE164: phone },
    schedule: {
      serviceId: input.serviceId.toLowerCase(),
      startAt: startAt.toISOString(),
    },
    notes: input.notes?.normalize("NFC").trim().replace(/\s+/g, " ") || null,
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(object[key])}`
  ).join(",")}}`;
}

export function canonicalFingerprint(input: RawBookingCommand) {
  const normalized = normalizeCommand(input);
  const serialized = stableSerialize(normalized);
  return {
    version: FINGERPRINT_VERSION,
    normalized,
    serialized,
    sha256: createHash("sha256").update(serialized, "utf8").digest(),
  };
}
