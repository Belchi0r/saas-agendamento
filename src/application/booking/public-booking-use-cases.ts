import { createHash, randomUUID } from "node:crypto";

import {
  enumeratePublicAvailability,
  type PublicAvailabilityResult,
} from "@/application/availability/calculate-availability";
import {
  BrazilianWhatsappError,
  normalizeBrazilianWhatsapp,
  normalizePublicBookingCommand,
  PUBLIC_BOOKING_OPERATION,
  reviewedServiceMatches,
  stableSerialize,
  type PublicAppointmentView,
  type PublicBookingCommand,
} from "@/domain/booking/public-booking";
import {
  BOOKING_ENVELOPE_TTL_MS,
  BOOKING_RECEIPT_TTL_MS,
  bookingEnvelopeAad,
  CAPABILITY_COOKIE_MAX_AGE_SECONDS,
  decryptBookingEnvelope,
  encryptBookingEnvelope,
  generateManagementToken,
  secretHmac,
  signCapabilityCookie,
  verifyCapabilityCookie,
  type BookingSecrets,
} from "@/infrastructure/security/booking-secrets";
import {
  assertIanaTimeZone,
  offsetToMinutes,
  Temporal,
} from "@/infrastructure/time/temporal";
import { findPostgresError } from "@/persistence/database/postgres-error";
import { ApplicationError } from "@/shared/errors/application-error";

import type {
  BookingDateCalendarFacts,
  BookingFacts,
  BookingProfileFacts,
  PublicBookingRepository,
} from "./public-booking-repository";

export type BookingAvailabilityView = Readonly<{
  localDate: string;
  timezone: string;
  service: NonNullable<BookingFacts["service"]>;
  slotStepMinutes: 15;
  slots: PublicAvailabilityResult["availableCandidates"];
}>;

export type PublicBookingDateStatus =
  | "AVAILABLE"
  | "NOT_WORKING"
  | "TOO_SOON"
  | "FULLY_BOOKED";

export type PublicBookingDateReason =
  | "CLOSED"
  | "NO_WORKING_WINDOW"
  | "SERVICE_DOES_NOT_FIT"
  | "LEAD_TIME"
  | "OCCUPIED"
  | null;

export type PublicBookingDateOption = Readonly<{
  localDate: string;
  status: PublicBookingDateStatus;
  reason: PublicBookingDateReason;
  availableSlotCount: number;
  firstAvailableLocalTime: string | null;
}>;

export type PublicBookingDateDiscovery = Readonly<{
  timezone: string;
  horizonStartDate: string;
  horizonEndDate: string;
  dates: readonly PublicBookingDateOption[];
}>;

export type PublicBookingConfirmation = Readonly<{
  disposition: "CREATED" | "REPLAYED";
  appointment: PublicAppointmentView;
  managementLink: string;
}>;

export type AdminBookingConfirmation = Readonly<{
  disposition: "CREATED" | "REPLAYED";
  appointment: PublicAppointmentView;
}>;

const ADMIN_BOOKING_OPERATION = "admin-booking/v1";

type StoredBookingResponse = Omit<PublicBookingConfirmation, "disposition">;

export async function listPublicBookingAvailability(
  repository: PublicBookingRepository,
  serviceId: string,
  localDate: string,
  now = new Date(),
): Promise<BookingAvailabilityView> {
  const facts = await repository.loadAvailabilityFacts(serviceId, localDate);
  return calculateBookingAvailability(facts, localDate, now, true);
}

export async function listAdminBookingAvailability(
  repository: PublicBookingRepository,
  serviceId: string,
  localDate: string,
  now = new Date(),
): Promise<BookingAvailabilityView> {
  const facts = await repository.loadAvailabilityFacts(serviceId, localDate);
  return calculateBookingAvailability(facts, localDate, now, false);
}

export async function listPublicBookingDateOptions(
  repository: PublicBookingRepository,
  serviceId: string,
  now = new Date(),
): Promise<PublicBookingDateDiscovery> {
  const profile = requireBookingProfile(await repository.loadBookingProfile(serviceId), true);
  return discoverBookingDates(repository, profile, now);
}

export async function listAdminBookingDateOptions(
  repository: PublicBookingRepository,
  serviceId: string,
  now = new Date(),
): Promise<PublicBookingDateDiscovery> {
  const profile = requireBookingProfile(await repository.loadBookingProfile(serviceId), false);
  return discoverBookingDates(repository, profile, now);
}

export async function confirmAdminBooking(
  repository: PublicBookingRepository,
  rawCommand: PublicBookingCommand,
  rawIdempotencyKey: string,
  idempotencyPepper: Buffer,
  now = new Date(),
): Promise<AdminBookingConfirmation> {
  assertIdempotencyKey(rawIdempotencyKey);
  const command = normalizeBookingCommand(rawCommand);
  const fingerprint = createHash("sha256").update(stableSerialize(command), "utf8").digest();
  const keyHash = secretHmac(rawIdempotencyKey, idempotencyPepper);
  const lockDigest = createHash("sha256").update(repository.scope.businessId).update(ADMIN_BOOKING_OPERATION).update(keyHash).digest();
  try {
    return await repository.transaction(async (transaction) => {
      await transaction.lockIdempotency(lockDigest.readInt32BE(0), lockDigest.readInt32BE(4));
      const existing = await transaction.findIdempotencyReceipt(ADMIN_BOOKING_OPERATION, keyHash);
      if (existing) {
        if (!existing.requestFingerprint.equals(fingerprint)) {
          throw new ApplicationError("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", "Esta chave já foi usada para outro agendamento.", 409);
        }
        const appointment = await transaction.findAppointmentById(existing.appointmentId);
        if (!appointment) throw new Error("IDEMPOTENT_APPOINTMENT_NOT_FOUND");
        return { disposition: "REPLAYED", appointment };
      }
      const facts = await transaction.loadFactsForConfirmation(command.schedule.serviceId, command.schedule.localDate);
      const availability = calculateBookingAvailability(facts, command.schedule.localDate, now, false);
      if (!reviewedServiceMatches(command.reviewedService, availability.service)) {
        throw new ApplicationError("SERVICE_CHANGED", "O serviço mudou. Revise os dados antes de confirmar.", 409);
      }
      const slot = availability.slots.find((candidate) => candidate.startLocalTime === command.schedule.localTime);
      if (!slot) throw slotUnavailable();
      const appointmentId = randomUUID();
      const customerId = randomUUID();
      const appointment: PublicAppointmentView = {
        appointmentId, status: "CONFIRMED", version: 1,
        serviceName: availability.service.name, durationMinutes: availability.service.durationMinutes,
        priceMinor: availability.service.priceMinor, currencyCode: availability.service.currencyCode,
        customerName: command.customer.name, customerWhatsapp: command.customer.whatsappE164,
        scheduledStartAt: slot.startAtUtc, scheduledEndAt: slot.endAtUtc,
        timezone: availability.timezone, localDate: command.schedule.localDate,
        localTime: command.schedule.localTime, utcOffsetMinutes: offsetToMinutes(slot.offset),
      };
      await transaction.insertAdminBooking({
        customer: { id: customerId, name: command.customer.name, whatsappE164: command.customer.whatsappE164 },
        appointment: { ...appointment, serviceId: availability.service.id, customerId,
          serviceDescription: availability.service.description, occupiedStartAt: slot.startAtUtc,
          occupiedEndAt: slot.endAtUtc, createdAt: now },
        occupancyId: randomUUID(), eventId: randomUUID(),
        receipt: { id: randomUUID(), operation: ADMIN_BOOKING_OPERATION, keyHash,
          requestFingerprint: fingerprint, fingerprintVersion: command.version,
          responseStatus: 201, createdAt: now, expiresAt: new Date(now.getTime() + BOOKING_RECEIPT_TTL_MS) },
      });
      return { disposition: "CREATED", appointment };
    });
  } catch (error) {
    if (findPostgresError(error)?.code === "23P01") throw slotUnavailable();
    throw error;
  }
}

export async function confirmPublicBooking(
  repository: PublicBookingRepository,
  rawCommand: PublicBookingCommand,
  rawIdempotencyKey: string,
  secrets: BookingSecrets,
  appOrigin: string,
  now = new Date(),
): Promise<PublicBookingConfirmation> {
  assertIdempotencyKey(rawIdempotencyKey);
  const command = normalizeBookingCommand(rawCommand);

  const serialized = stableSerialize(command);
  const fingerprint = createHash("sha256").update(serialized, "utf8").digest();
  const keyHash = secretHmac(rawIdempotencyKey, secrets.idempotencyPepper);
  const lockDigest = createHash("sha256")
    .update(repository.scope.businessId)
    .update(PUBLIC_BOOKING_OPERATION)
    .update(keyHash)
    .digest();

  try {
    return await repository.transaction(async (transaction) => {
      await transaction.lockIdempotency(
        lockDigest.readInt32BE(0),
        lockDigest.readInt32BE(4),
      );
      const existing = await transaction.findIdempotencyReceipt(
        PUBLIC_BOOKING_OPERATION,
        keyHash,
      );
      if (existing) {
        if (!existing.requestFingerprint.equals(fingerprint)) {
          throw new ApplicationError(
            "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
            "Esta chave já foi usada para outra confirmação.",
            409,
          );
        }
        const key = existing.envelopeKeyVersion
          ? secrets.envelopeKeys.get(existing.envelopeKeyVersion)
          : undefined;
        if (
          !existing.responseEnvelope ||
          !existing.envelopeNonce ||
          !existing.envelopeAuthTag ||
          !existing.envelopeKeyVersion ||
          !existing.envelopeExpiresAt ||
          existing.envelopeExpiresAt.getTime() <= now.getTime() ||
          !key
        ) {
          throw new ApplicationError(
            "IDEMPOTENCY_RESPONSE_EXPIRED_ADMIN_REISSUE_REQUIRED",
            "A reserva foi confirmada, mas o acesso precisa ser reemitido pelo responsável.",
            409,
          );
        }
        const response = decryptBookingEnvelope<StoredBookingResponse>(
          {
            ciphertext: existing.responseEnvelope,
            nonce: existing.envelopeNonce,
            authTag: existing.envelopeAuthTag,
            keyVersion: existing.envelopeKeyVersion,
          },
          key,
          bookingEnvelopeAad({
            receiptId: existing.id,
            businessId: existing.businessId,
            operation: existing.operation,
            fingerprintVersion: existing.fingerprintVersion,
            envelopeExpiresAt: existing.envelopeExpiresAt,
          }),
        );
        return { disposition: "REPLAYED", ...response };
      }

      const facts = await transaction.loadFactsForConfirmation(
        command.schedule.serviceId,
        command.schedule.localDate,
      );
      const availability = calculateBookingAvailability(facts, command.schedule.localDate, now, true);
      if (!reviewedServiceMatches(command.reviewedService, availability.service)) {
        throw new ApplicationError(
          "SERVICE_CHANGED",
          "O serviço mudou. Revise os dados antes de confirmar.",
          409,
        );
      }
      const slot = availability.slots.find(
        (candidate) => candidate.startLocalTime === command.schedule.localTime,
      );
      if (!slot) throw slotUnavailable();

      const appointmentId = randomUUID();
      const customerId = randomUUID();
      const rawToken = generateManagementToken();
      const managementUrl = new URL("/manage", appOrigin);
      managementUrl.hash = `token=${encodeURIComponent(rawToken)}`;
      const appointment: PublicAppointmentView = {
        appointmentId,
        status: "CONFIRMED",
        version: 1,
        serviceName: availability.service.name,
        durationMinutes: availability.service.durationMinutes,
        priceMinor: availability.service.priceMinor,
        currencyCode: availability.service.currencyCode,
        customerName: command.customer.name,
        customerWhatsapp: command.customer.whatsappE164,
        scheduledStartAt: slot.startAtUtc,
        scheduledEndAt: slot.endAtUtc,
        timezone: availability.timezone,
        localDate: command.schedule.localDate,
        localTime: command.schedule.localTime,
        utcOffsetMinutes: offsetToMinutes(slot.offset),
      };
      const response: StoredBookingResponse = {
        appointment,
        managementLink: managementUrl.toString(),
      };
      const receiptId = randomUUID();
      const envelopeExpiresAt = new Date(now.getTime() + BOOKING_ENVELOPE_TTL_MS);
      const expiresAt = new Date(now.getTime() + BOOKING_RECEIPT_TTL_MS);
      const envelopeKey = secrets.envelopeKeys.get(
        secrets.activeEnvelopeKeyVersion,
      );
      if (!envelopeKey) throw new Error("ACTIVE_ENVELOPE_KEY_UNAVAILABLE");
      const encrypted = encryptBookingEnvelope(
        response,
        envelopeKey,
        secrets.activeEnvelopeKeyVersion,
        bookingEnvelopeAad({
          receiptId,
          businessId: repository.scope.businessId,
          operation: PUBLIC_BOOKING_OPERATION,
          fingerprintVersion: command.version,
          envelopeExpiresAt,
        }),
      );

      await transaction.insertBooking({
        customer: {
          id: customerId,
          name: command.customer.name,
          whatsappE164: command.customer.whatsappE164,
        },
        appointment: {
          ...appointment,
          serviceId: availability.service.id,
          customerId,
          serviceDescription: availability.service.description,
          occupiedStartAt: slot.startAtUtc,
          occupiedEndAt: slot.endAtUtc,
          createdAt: now,
        },
        occupancyId: randomUUID(),
        eventId: randomUUID(),
        token: {
          id: randomUUID(),
          hash: secretHmac(rawToken, secrets.tokenPepper),
          version: 1,
        },
        receipt: {
          id: receiptId,
          operation: PUBLIC_BOOKING_OPERATION,
          keyHash,
          requestFingerprint: fingerprint,
          fingerprintVersion: command.version,
          responseStatus: 201,
          responseEnvelope: encrypted.ciphertext,
          envelopeNonce: encrypted.nonce,
          envelopeAuthTag: encrypted.authTag,
          envelopeKeyVersion: encrypted.keyVersion,
          envelopeExpiresAt,
          createdAt: now,
          expiresAt,
        },
      });

      return { disposition: "CREATED", ...response };
    });
  } catch (error) {
    if (findPostgresError(error)?.code === "23P01") throw slotUnavailable();
    throw error;
  }
}

export async function exchangeManagementToken(
  repository: PublicBookingRepository,
  rawToken: string,
  secrets: BookingSecrets,
  now = new Date(),
): Promise<string> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw managementLinkInvalid();
  const authorization = await repository.exchangeManagementToken(
    secretHmac(rawToken, secrets.tokenPepper),
    now,
  );
  if (!authorization) throw managementLinkInvalid();
  return signCapabilityCookie(
    {
      capabilityVersion: "booking-cap/v1",
      ...authorization,
      expiresAtEpochSeconds:
        Math.floor(now.getTime() / 1_000) + CAPABILITY_COOKIE_MAX_AGE_SECONDS,
    },
    secrets.capabilitySigningKey,
  );
}

export async function getManagedAppointment(
  repository: PublicBookingRepository,
  cookieValue: string,
  secrets: BookingSecrets,
  now = new Date(),
): Promise<PublicAppointmentView> {
  const capability = verifyCapabilityCookie(
    cookieValue,
    secrets.capabilitySigningKey,
    Math.floor(now.getTime() / 1_000),
  );
  if (!capability) throw managementLinkInvalid();
  const appointment = await repository.findManagedAppointment(
    capability.tokenRef,
    capability.tokenVersion,
    capability.appointmentVersion,
  );
  if (!appointment) throw managementLinkInvalid();
  return appointment;
}

export async function rotateManagementToken(
  repository: PublicBookingRepository,
  appointmentId: string,
  secrets: BookingSecrets,
  reason: string,
  now = new Date(),
): Promise<string> {
  const rawToken = generateManagementToken();
  await repository.rotateManagementToken({
    appointmentId,
    newTokenId: randomUUID(),
    newTokenHash: secretHmac(rawToken, secrets.tokenPepper),
    rotatedAt: now,
    reason,
  });
  return rawToken;
}

export function revokeManagementToken(
  repository: PublicBookingRepository,
  appointmentId: string,
  reason: string,
  now = new Date(),
): Promise<void> {
  return repository.revokeManagementToken(appointmentId, now, reason);
}

function calculateBookingAvailability(
  facts: BookingFacts,
  localDate: string,
  now: Date,
  requirePublicEnabled: boolean,
): BookingAvailabilityView {
  const profile = requireBookingProfile(facts, requirePublicEnabled);
  const result = enumeratePublicAvailability({
    localDate,
    timezone: profile.timezone,
    serviceDurationMinutes: profile.service.durationMinutes,
    slotStepMinutes: profile.policy.slotStepMinutes,
    minimumLeadMinutes: profile.policy.minimumLeadMinutes,
    bookingHorizonDays: profile.policy.bookingHorizonDays,
    nowUtc: now.toISOString(),
    weeklyWorkingWindows: facts.weeklyWorkingWindows,
    weeklyBreaks: facts.weeklyBreaks,
    dateException: facts.dateException,
    blockedPeriods: [],
    scheduleOccupancies: facts.scheduleOccupancies,
  });
  return {
    localDate,
    timezone: result.timezone,
    service: profile.service,
    slotStepMinutes: 15,
    slots: result.availableCandidates,
  };
}

function requireBookingProfile(facts: BookingProfileFacts, requirePublicEnabled: boolean): Readonly<{
  timezone: string;
  business: NonNullable<BookingProfileFacts["business"]>;
  policy: NonNullable<BookingProfileFacts["policy"]>;
  service: NonNullable<BookingProfileFacts["service"]>;
}> {
  if (
    !facts.business || (requirePublicEnabled && !facts.business.publicBookingEnabled) ||
    !facts.business.timezone ||
    !facts.policy
  ) {
    throw new ApplicationError(
      "PUBLIC_BOOKING_UNAVAILABLE",
      "A agenda ainda não está disponível para reservas.",
      503,
    );
  }
  if (facts.policy.bufferMinutes !== null && facts.policy.bufferMinutes !== 0) {
    throw new ApplicationError(
      "BOOKING_BUFFER_POLICY_NOT_CONFIRMED",
      "A agenda ainda não está disponível para reservas.",
      503,
    );
  }
  if (!facts.service?.active) {
    throw new ApplicationError(
      "SERVICE_UNAVAILABLE",
      "Este serviço não está disponível no momento.",
      404,
    );
  }
  let timezone: string;
  try {
    timezone = assertIanaTimeZone(facts.business.timezone);
  } catch {
    throw new ApplicationError(
      "BUSINESS_TIMEZONE_INVALID",
      "O timezone do negócio é inválido.",
      503,
    );
  }
  return {
    timezone,
    business: facts.business,
    policy: facts.policy,
    service: facts.service,
  };
}

async function discoverBookingDates(
  repository: PublicBookingRepository,
  profile: ReturnType<typeof requireBookingProfile>,
  now: Date,
): Promise<PublicBookingDateDiscovery> {
  const nowInstant = Temporal.Instant.from(now.toISOString());
  const today = nowInstant.toZonedDateTimeISO(profile.timezone).toPlainDate();
  const horizonEnd = today.add({ days: profile.policy.bookingHorizonDays });
  const calendar = await repository.loadDateDiscoveryCalendar({
    startLocalDate: today.toString(), endLocalDate: horizonEnd.toString(),
    startAtUtc: localDayBoundary(today, profile.timezone),
    endAtUtc: localDayBoundary(horizonEnd.add({ days: 1 }), profile.timezone),
  });
  const exceptions = new Map(calendar.dateExceptions.map((exception) => [exception.localDate, exception]));
  const dates: PublicBookingDateOption[] = [];
  for (let date = today; Temporal.PlainDate.compare(date, horizonEnd) <= 0; date = date.add({ days: 1 })) {
    dates.push(classifyBookingDate(profile, calendar, exceptions.get(date.toString()) ?? null, date.toString(), now));
  }
  return { timezone: profile.timezone, horizonStartDate: today.toString(), horizonEndDate: horizonEnd.toString(), dates };
}

function assertIdempotencyKey(value: string) {
  if (value.length < 16 || value.length > 200 || !/^[A-Za-z0-9._~-]+$/.test(value)) {
    throw new ApplicationError("IDEMPOTENCY_KEY_INVALID", "Não foi possível identificar esta tentativa de confirmação.", 400);
  }
}

function normalizeBookingCommand(rawCommand: PublicBookingCommand) {
  try {
    return normalizePublicBookingCommand({ ...rawCommand, whatsappE164: normalizeBrazilianWhatsapp(rawCommand.whatsappE164) });
  } catch (error) {
    if (error instanceof BrazilianWhatsappError) {
      throw new ApplicationError("BRAZILIAN_WHATSAPP_INVALID", "Digite um WhatsApp válido com DDD.", 400);
    }
    throw new ApplicationError("PUBLIC_BOOKING_INPUT_INVALID", "Revise os dados do agendamento.", 400);
  }
}

function classifyBookingDate(
  profile: ReturnType<typeof requireBookingProfile>,
  calendar: BookingDateCalendarFacts,
  dateException: BookingDateCalendarFacts["dateExceptions"][number] | null,
  localDate: string,
  now: Date,
): PublicBookingDateOption {
  const common = {
    localDate,
    timezone: profile.timezone,
    serviceDurationMinutes: profile.service.durationMinutes,
    slotStepMinutes: profile.policy.slotStepMinutes,
    bookingHorizonDays: profile.policy.bookingHorizonDays,
    weeklyWorkingWindows: calendar.weeklyWorkingWindows,
    weeklyBreaks: calendar.weeklyBreaks,
    dateException,
    blockedPeriods: [],
  } as const;
  const structural = enumeratePublicAvailability({
    ...common,
    minimumLeadMinutes: 0,
    nowUtc: localDayBoundary(Temporal.PlainDate.from(localDate), profile.timezone),
    scheduleOccupancies: [],
  });
  if (structural.source === "CLOSED") {
    return unavailableDate(localDate, "NOT_WORKING", "CLOSED");
  }
  if (structural.effectiveWindows.length === 0) {
    return unavailableDate(localDate, "NOT_WORKING", "NO_WORKING_WINDOW");
  }
  if (structural.availableCandidates.length === 0) {
    return unavailableDate(localDate, "NOT_WORKING", "SERVICE_DOES_NOT_FIT");
  }

  const policyEligible = enumeratePublicAvailability({
    ...common,
    minimumLeadMinutes: profile.policy.minimumLeadMinutes,
    nowUtc: now.toISOString(),
    scheduleOccupancies: [],
  });
  if (policyEligible.availableCandidates.length === 0) {
    return unavailableDate(localDate, "TOO_SOON", "LEAD_TIME");
  }

  const available = enumeratePublicAvailability({
    ...common,
    minimumLeadMinutes: profile.policy.minimumLeadMinutes,
    nowUtc: now.toISOString(),
    scheduleOccupancies: calendar.scheduleOccupancies,
  }).availableCandidates;
  if (available.length === 0) {
    return unavailableDate(localDate, "FULLY_BOOKED", "OCCUPIED");
  }
  return {
    localDate,
    status: "AVAILABLE",
    reason: null,
    availableSlotCount: available.length,
    firstAvailableLocalTime: available[0]?.startLocalTime ?? null,
  };
}

function unavailableDate(
  localDate: string,
  status: Exclude<PublicBookingDateStatus, "AVAILABLE">,
  reason: Exclude<PublicBookingDateReason, null>,
): PublicBookingDateOption {
  return {
    localDate,
    status,
    reason,
    availableSlotCount: 0,
    firstAvailableLocalTime: null,
  };
}

function localDayBoundary(date: Temporal.PlainDate, timezone: string): string {
  return date
    .toPlainDateTime("12:00")
    .toZonedDateTime(timezone)
    .startOfDay()
    .toInstant()
    .toString();
}

function slotUnavailable(): ApplicationError {
  return new ApplicationError(
    "BOOKING_SLOT_UNAVAILABLE",
    "Esse horário acabou de ser reservado. Escolha outro horário.",
    409,
  );
}

function managementLinkInvalid(): ApplicationError {
  return new ApplicationError(
    "MANAGEMENT_LINK_INVALID",
    "Este acesso não é válido.",
    404,
  );
}
