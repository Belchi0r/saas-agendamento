import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decryptBookingEnvelope,
  encryptBookingEnvelope,
  generateManagementToken,
  secretHmac,
  serializeCapabilityCookie,
  signCapabilityCookie,
  verifyCapabilityCookie,
} from "@/infrastructure/security/booking-secrets";

describe("booking capability cryptography", () => {
  it("uses 256-bit raw tokens and only stable HMAC digests", () => {
    const token = generateManagementToken();
    const pepper = randomBytes(32);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(secretHmac(token, pepper)).toHaveLength(32);
    expect(secretHmac(token, pepper).toString("hex")).not.toContain(token);
  });

  it("authenticates the short capability cookie and AES-GCM response envelope", () => {
    const key = randomBytes(32);
    const payload = { capabilityVersion: "booking-cap/v1" as const, tokenRef: "token-ref", tokenVersion: 1, appointmentVersion: 1, expiresAtEpochSeconds: 1_000 };
    const signed = signCapabilityCookie(payload, key);
    expect(verifyCapabilityCookie(signed, key, 999)).toEqual(payload);
    expect(verifyCapabilityCookie(`${signed}x`, key, 999)).toBeNull();
    expect(verifyCapabilityCookie(signed, key, 1_000)).toBeNull();
    const encrypted = encryptBookingEnvelope({ managementToken: "secret" }, key, "v1", "aad");
    expect(decryptBookingEnvelope(encrypted, key, "aad")).toEqual({ managementToken: "secret" });
    expect(() => decryptBookingEnvelope(encrypted, key, "wrong-aad")).toThrow();
  });

  it("scopes the short capability to the same site while allowing secure home reload recognition", () => {
    expect(serializeCapabilityCookie("signed-capability")).toBe(
      "booking_cap=signed-capability; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Strict",
    );
  });
});
