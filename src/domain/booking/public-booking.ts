import { isValidLocalDate, localTimeToSeconds } from "@/domain/availability/local-interval";

export const PUBLIC_BOOKING_FINGERPRINT_VERSION = "public-booking/v1" as const;
export const PUBLIC_BOOKING_OPERATION = "CREATE_PUBLIC_APPOINTMENT" as const;

export type PublicBookingCommand = Readonly<{
  serviceId: string;
  localDate: string;
  localTime: string;
  customerName: string;
  whatsappE164: string;
  reviewedService: Readonly<{
    version: number;
    name: string;
    durationMinutes: number;
    priceMinor: number;
    currencyCode: string;
  }>;
}>;

export type NormalizedPublicBookingCommand = Readonly<{
  version: typeof PUBLIC_BOOKING_FINGERPRINT_VERSION;
  customer: Readonly<{ name: string; whatsappE164: string }>;
  schedule: Readonly<{ serviceId: string; localDate: string; localTime: string }>;
  reviewedService: PublicBookingCommand["reviewedService"];
}>;

export type PublicAppointmentView = Readonly<{
  appointmentId: string;
  status: "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  version: number;
  serviceName: string;
  durationMinutes: number;
  priceMinor: number;
  currencyCode: string;
  customerName: string;
  customerWhatsapp?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  timezone: string;
  localDate: string;
  localTime: string;
  utcOffsetMinutes: number;
}>;

const BRAZILIAN_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export class BrazilianWhatsappError extends Error {
  constructor() {
    super("BRAZILIAN_WHATSAPP_INVALID");
    this.name = "BrazilianWhatsappError";
  }
}

export function normalizeBrazilianWhatsapp(value: string): string {
  const input = value.normalize("NFKC").trim();
  if (!/^\+?[0-9\s().-]+$/.test(input)) throw new BrazilianWhatsappError();

  let digits = input.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    digits = digits.slice(2);
  }

  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (
    digits.length !== 11 ||
    !BRAZILIAN_DDDS.has(ddd) ||
    subscriber[0] !== "9" ||
    /^(\d)\1{8}$/.test(subscriber)
  ) {
    throw new BrazilianWhatsappError();
  }

  return `+55${digits}`;
}

export function normalizePublicBookingCommand(
  input: PublicBookingCommand,
): NormalizedPublicBookingCommand {
  const name = input.customerName.normalize("NFC").trim().replace(/\s+/g, " ");
  const phone = normalizeBrazilianWhatsapp(input.whatsappE164);
  const serviceName = input.reviewedService.name
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
  const localTime = input.localTime.length === 8 && input.localTime.endsWith(":00")
    ? input.localTime.slice(0, 5)
    : input.localTime;

  if (
    name.length < 2 || name.length > 120 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.serviceId) ||
    !isValidLocalDate(input.localDate) || localTimeToSeconds(localTime) === null ||
    serviceName.length === 0 ||
    !Number.isSafeInteger(input.reviewedService.version) || input.reviewedService.version <= 0 ||
    !Number.isSafeInteger(input.reviewedService.durationMinutes) || input.reviewedService.durationMinutes <= 0 ||
    !Number.isSafeInteger(input.reviewedService.priceMinor) || input.reviewedService.priceMinor < 0 ||
    !/^[A-Z]{3}$/.test(input.reviewedService.currencyCode)
  ) throw new Error("PUBLIC_BOOKING_COMMAND_INVALID");

  return {
    version: PUBLIC_BOOKING_FINGERPRINT_VERSION,
    customer: { name, whatsappE164: phone },
    schedule: { serviceId: input.serviceId.toLowerCase(), localDate: input.localDate, localTime },
    reviewedService: {
      version: input.reviewedService.version,
      name: serviceName,
      durationMinutes: input.reviewedService.durationMinutes,
      priceMinor: input.reviewedService.priceMinor,
      currencyCode: input.reviewedService.currencyCode,
    },
  };
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(object[key])}`).join(",")}}`;
}

export function reviewedServiceMatches(
  reviewed: NormalizedPublicBookingCommand["reviewedService"],
  current: Readonly<{ version: number; name: string; durationMinutes: number; priceMinor: number; currencyCode: string; active: boolean }>,
): boolean {
  return current.active && reviewed.version === current.version &&
    reviewed.name === current.name && reviewed.durationMinutes === current.durationMinutes &&
    reviewed.priceMinor === current.priceMinor && reviewed.currencyCode === current.currencyCode;
}
