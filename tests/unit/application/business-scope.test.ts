import { describe, expect, it } from "vitest";

import {
  resolveAdminBusinessScope,
  resolvePublicBusinessScope,
  type BusinessScopeReader,
} from "@/application/business/resolve-business-scope";

function reader(overrides: Partial<BusinessScopeReader> = {}): BusinessScopeReader {
  return {
    findPublicSingleton: async () => [
      { id: "business-a", adminAuthUserId: "admin-a" },
    ],
    findByAdminAuthUserId: async (authUserId) =>
      authUserId === "admin-a"
        ? { id: "business-a", adminAuthUserId: "admin-a" }
        : null,
    ...overrides,
  };
}

describe("server-side BusinessScope resolution", () => {
  it("resolves the public singleton without accepting browser business_id", async () => {
    await expect(resolvePublicBusinessScope(reader())).resolves.toMatchObject({
      businessId: "business-a",
      resolvedBy: "public-singleton",
    });
  });

  it("fails closed when more than one public Business exists", async () => {
    const multiple = reader({
      findPublicSingleton: async () => [
        { id: "business-a", adminAuthUserId: "admin-a" },
        { id: "business-b", adminAuthUserId: "admin-b" },
      ],
    });

    await expect(resolvePublicBusinessScope(multiple)).rejects.toMatchObject({
      code: "BUSINESS_SCOPE_AMBIGUOUS",
      status: 503,
    });
  });

  it("authorizes an admin only through admin_auth_user_id", async () => {
    await expect(
      resolveAdminBusinessScope(reader(), "admin-a"),
    ).resolves.toMatchObject({
      businessId: "business-a",
      resolvedBy: "admin-auth-user",
    });

    await expect(
      resolveAdminBusinessScope(reader(), "wrong-admin"),
    ).rejects.toMatchObject({ code: "ADMIN_NOT_AUTHORIZED", status: 403 });
  });
});
