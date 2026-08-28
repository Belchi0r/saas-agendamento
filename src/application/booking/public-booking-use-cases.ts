import { createHash, randomUUID } from "node:crypto";

import {
  enumeratePublicAvailability,
  type PublicAvailabilityResult,
} from "@/application/availability/calculate-availability";
import {
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
import { offsetToMinutes } from "@/infrastructure/time/temporal";
import { findPostgresError } from "@/persistence/database/postgres-error";
import { ApplicationError } from "@/shared/errors/application-error";

import type {
  BookingFacts,
  PublicBookingRepository,
} from "./public-booking-repository";

export type BookingAvailabilityView = Readonly<{
  localDate: string;
  timezone: string;
  service: NonNullable<BookingFacts["service"]>;
  slotStepMinutes: 15;
  slots: PublicAvailabilityResult["availableCandidates"];
}>;

export type PublicBookingConfirmation = Readonly<{
  disposition: "CREATED" | "REPLAYED";
  appointment: PublicAppointmentView;
  managementLink: string;
}>;

type StoredBookingResponse = Omit<PublicBookingConfirmation, "disposition">;

export async function listPublicBookingAvailability(
  repository: PublicBookingRepository,
  serviceId: string,
  localDate: string,
  now = new Date(),
): Promise<BookingAvailabilityView> {
  const facts = await repository.loadAvailabilityFacts(serviceId, localDate);
  return calculatePublicAvailability(facts, localDate, now);
}

export async function confirmPublicBooking(
  repository: PublicBookingRepository,
  rawCommand: PublicBookingCommand,
  rawIdempotencyKey: string,
  secrets: BookingSecrets,
  appOrigin: string,
  now = new Date(),
): Promise<PublicBookingConfirmation> {
  if (
    rawIdempotencyKey.length < 16 ||
    rawIdempotencyKey.length > 200 ||
    !/^[A-Za-z0-9._~-]+$/.test(rawIdempotencyKey)
  ) {
    throw new ApplicationError(
      "IDEMPOTENCY_KEY_INVALID",
      "Não foi possível identificar esta tentativa de confirmação.",
      400,
    );
  }

  let command: ReturnType<typeof normalizePublicBookingCommand>;
  try {
    command = normalizePublicBookingCommand(rawCommand);
  } catch {
    throw new ApplicationError(
      "PUBLIC_BOOKING_INPUT_INVALID",
      "Revise os dados do agendamento.",
      400,
    );
  }

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
      const availability = calculatePublicAvailability(
        facts,
        command.schedule.localDate,
        now,
      );
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

function calculatePublicAvailability(
  facts: BookingFacts,
  localDate: string,
  now: Date,
): BookingAvailabilityView {
  if (
    !facts.business?.publicBookingEnabled ||
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
  const result = enumeratePublicAvailability({
    localDate,
    timezone: facts.business.timezone,
    serviceDurationMinutes: facts.service.durationMinutes,
    slotStepMinutes: facts.policy.slotStepMinutes,
    minimumLeadMinutes: facts.policy.minimumLeadMinutes,
    bookingHorizonDays: facts.policy.bookingHorizonDays,
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
    service: facts.service,
    slotStepMinutes: 15,
    slots: result.availableCandidates,
  };
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
