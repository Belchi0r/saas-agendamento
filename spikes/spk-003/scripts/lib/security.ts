import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const TOKEN_BYTES = 32;
export const TOKEN_BITS = TOKEN_BYTES * 8;
export const HASH_BYTES = 32;
export const ENVELOPE_ALGORITHM = "aes-256-gcm";
export const ENVELOPE_NONCE_BYTES = 12;
export const ENVELOPE_TAG_BYTES = 16;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function secretHash(secret: string, pepper: Buffer): Buffer {
  return createHmac("sha256", pepper).update(secret, "utf8").digest();
}

export type Envelope = {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: string;
};

export function encryptEnvelope(
  value: unknown,
  key: Buffer,
  keyVersion: string,
  aad: string,
): Envelope {
  const nonce = randomBytes(ENVELOPE_NONCE_BYTES);
  const cipher = createCipheriv(ENVELOPE_ALGORITHM, key, nonce, {
    authTagLength: ENVELOPE_TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion };
}

export function decryptEnvelope<T>(
  envelope: Envelope,
  key: Buffer,
  aad: string,
): T {
  const decipher = createDecipheriv(
    ENVELOPE_ALGORITHM,
    key,
    envelope.nonce,
    { authTagLength: ENVELOPE_TAG_BYTES },
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(envelope.authTag);
  const plaintext = Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export type Capability = {
  tokenRef: string;
  appointmentVersion: number;
  expiresAtEpochSeconds: number;
  capabilityVersion: "cap-v1";
};

export function signCapability(value: Capability, signingKey: Buffer): string {
  const payload = b64urlJson(value);
  const signature = createHmac("sha256", signingKey)
    .update(payload, "ascii")
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyCapability(
  encoded: string,
  signingKey: Buffer,
  nowEpochSeconds: number,
): Capability | undefined {
  const [payload, providedSignature, extra] = encoded.split(".");
  if (!payload || !providedSignature || extra !== undefined) return undefined;
  const expectedSignature = createHmac("sha256", signingKey)
    .update(payload, "ascii")
    .digest("base64url");
  const provided = Buffer.from(providedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return undefined;
  }
  const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Capability;
  if (value.capabilityVersion !== "cap-v1" || value.expiresAtEpochSeconds <= nowEpochSeconds) {
    return undefined;
  }
  return value;
}

export function serializeCapabilityCookie(value: string, maxAgeSeconds = 600): string {
  return [
    `spk003_cap=${value}`,
    "Path=/manage",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}
