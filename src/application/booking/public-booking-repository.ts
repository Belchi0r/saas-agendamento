import type { OccupiedScheduleInterval } from "@/application/availability/calculate-availability";
import type { DateAvailabilityException } from "@/domain/availability/date-availability";
import type { WeeklyBreak, WeeklyWorkingWindow } from "@/domain/availability/weekly-availability";
import type { PublicAppointmentView } from "@/domain/booking/public-booking";
import type { BusinessScope } from "@/domain/business/business-scope";

export type BookingPolicySnapshot = Readonly<{ minimumLeadMinutes: number; bookingHorizonDays: number; slotStepMinutes: number; bufferMinutes: number | null; configurationConfirmedAt: Date; version: number }>;
export type BookingServiceSnapshot = Readonly<{ id: string; name: string; description: string | null; durationMinutes: number; priceMinor: number; currencyCode: string; active: boolean; version: number }>;
export type BookingFacts = Readonly<{
  business: Readonly<{ timezone: string | null; publicBookingEnabled: boolean; availabilityVersion: number }> | null;
  policy: BookingPolicySnapshot | null;
  service: BookingServiceSnapshot | null;
  weeklyWorkingWindows: readonly WeeklyWorkingWindow[];
  weeklyBreaks: readonly WeeklyBreak[];
  dateException: DateAvailabilityException | null;
  scheduleOccupancies: readonly OccupiedScheduleInterval[];
}>;
export type BookingProfileFacts = Pick<BookingFacts, "business" | "policy" | "service">;
export type BookingDateDiscoveryRange = Readonly<{
  startLocalDate: string;
  endLocalDate: string;
  startAtUtc: string;
  endAtUtc: string;
}>;
export type BookingDateCalendarFacts = Readonly<{
  weeklyWorkingWindows: readonly WeeklyWorkingWindow[];
  weeklyBreaks: readonly WeeklyBreak[];
  dateExceptions: readonly DateAvailabilityException[];
  scheduleOccupancies: readonly OccupiedScheduleInterval[];
}>;
export type IdempotencyReceipt = Readonly<{
  id: string; businessId: string; operation: string; requestFingerprint: Buffer;
  fingerprintVersion: string; appointmentId: string; responseStatus: number;
  responseEnvelope: Buffer | null; envelopeNonce: Buffer | null; envelopeAuthTag: Buffer | null;
  envelopeKeyVersion: string | null; envelopeExpiresAt: Date | null;
}>;
export type PersistPublicBooking = Readonly<{
  customer: Readonly<{ id: string; name: string; whatsappE164: string }>;
  appointment: PublicAppointmentView & Readonly<{ serviceId: string; customerId: string; serviceDescription: string | null; occupiedStartAt: string; occupiedEndAt: string; createdAt: Date }>;
  occupancyId: string; eventId: string;
  token: Readonly<{ id: string; hash: Buffer; version: number }>;
  receipt: Readonly<{ id: string; operation: string; keyHash: Buffer; requestFingerprint: Buffer; fingerprintVersion: string; responseStatus: number; responseEnvelope: Buffer; envelopeNonce: Buffer; envelopeAuthTag: Buffer; envelopeKeyVersion: string; envelopeExpiresAt: Date; createdAt: Date; expiresAt: Date }>;
}>;
export interface PublicBookingTransaction {
  lockIdempotency(firstKey: number, secondKey: number): Promise<void>;
  findIdempotencyReceipt(operation: string, keyHash: Buffer): Promise<IdempotencyReceipt | null>;
  loadFactsForConfirmation(serviceId: string, localDate: string): Promise<BookingFacts>;
  insertBooking(effect: PersistPublicBooking): Promise<void>;
}
export type ManagementTokenAuthorization = Readonly<{ tokenRef: string; tokenVersion: number; appointmentVersion: number }>;
export interface PublicBookingRepository {
  readonly scope: BusinessScope;
  loadBookingProfile(serviceId: string): Promise<BookingProfileFacts>;
  loadDateDiscoveryCalendar(range: BookingDateDiscoveryRange): Promise<BookingDateCalendarFacts>;
  loadAvailabilityFacts(serviceId: string, localDate: string): Promise<BookingFacts>;
  transaction<T>(work: (transaction: PublicBookingTransaction) => Promise<T>): Promise<T>;
  exchangeManagementToken(tokenHash: Buffer, usedAt: Date): Promise<ManagementTokenAuthorization | null>;
  findManagedAppointment(tokenRef: string, tokenVersion: number, appointmentVersion: number): Promise<PublicAppointmentView | null>;
  rotateManagementToken(input: Readonly<{ appointmentId: string; newTokenId: string; newTokenHash: Buffer; rotatedAt: Date; reason: string }>): Promise<number>;
  revokeManagementToken(appointmentId: string, revokedAt: Date, reason: string): Promise<void>;
}
