import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const BOOKING_TOKEN_BYTES = 32;
export const BOOKING_ENVELOPE_TTL_MS = 24 * 60 * 60 * 1_000;
export const BOOKING_RECEIPT_TTL_MS = 72 * 60 * 60 * 1_000;
export const CAPABILITY_COOKIE_NAME = "booking_cap";
export const CAPABILITY_COOKIE_MAX_AGE_SECONDS = 600;

export type BookingSecrets = Readonly<{
  tokenPepper: Buffer;
  idempotencyPepper: Buffer;
  envelopeKeys: ReadonlyMap<string, Buffer>;
  activeEnvelopeKeyVersion: string;
  capabilitySigningKey: Buffer;
}>;
export type EncryptedEnvelope = Readonly<{ ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: string }>;
export type CapabilityCookiePayload = Readonly<{
  capabilityVersion: "booking-cap/v1";
  tokenRef: string;
  tokenVersion: number;
  appointmentVersion: number;
  expiresAtEpochSeconds: number;
}>;

export function generateManagementToken(): string {
  return randomBytes(BOOKING_TOKEN_BYTES).toString("base64url");
}
export function secretHmac(secret: string, pepper: Buffer): Buffer {
  return createHmac("sha256", pepper).update(secret, "utf8").digest();
}
export function encryptBookingEnvelope(value: unknown, key: Buffer, keyVersion: string, aad: string): EncryptedEnvelope {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion };
}
export function decryptBookingEnvelope<T>(envelope: EncryptedEnvelope, key: Buffer, aad: string): T {
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.nonce, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(envelope.authTag);
  return JSON.parse(Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString("utf8")) as T;
}
export function signCapabilityCookie(payload: CapabilityCookiePayload, signingKey: Buffer): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", signingKey).update(encoded, "ascii").digest("base64url");
  return `${encoded}.${signature}`;
}
export function verifyCapabilityCookie(value: string, signingKey: Buffer, nowEpochSeconds = Math.floor(Date.now() / 1_000)): CapabilityCookiePayload | null {
  const [encoded, suppliedSignature, extra] = value.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) return null;
  const expected = createHmac("sha256", signingKey).update(encoded, "ascii").digest();
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CapabilityCookiePayload;
    if (payload.capabilityVersion !== "booking-cap/v1" ||
      !Number.isSafeInteger(payload.tokenVersion) || payload.tokenVersion <= 0 ||
      !Number.isSafeInteger(payload.appointmentVersion) || payload.appointmentVersion <= 0 ||
      payload.expiresAtEpochSeconds <= nowEpochSeconds) return null;
    return payload;
  } catch { return null; }
}
export function bookingEnvelopeAad(input: Readonly<{ receiptId: string; businessId: string; operation: string; fingerprintVersion: string; envelopeExpiresAt: Date }>): string {
  return ["booking-envelope/v1", input.receiptId, input.businessId, input.operation, input.fingerprintVersion, input.envelopeExpiresAt.toISOString()].join("|");
}
