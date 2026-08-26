import { describe, expect, it } from "vitest";

import { resolveAdminAccess } from "@/application/admin/resolve-admin-access";
import type { BusinessScopeReader } from "@/application/business/resolve-business-scope";
import { ApplicationError } from "@/shared/errors/application-error";

const reader: BusinessScopeReader = {
  findPublicSingleton: async () => [],
  findByAdminAuthUserId: async (authUserId) =>
    authUserId === "correct-user"
      ? { id: "business-a", adminAuthUserId: "correct-user" }
      : null,
};

describe("admin AuthN × Business AuthZ", () => {
  it("denies a request without a verified session before authorization", async () => {
    await expect(
      resolveAdminAccess(
        {
          getAuthenticatedUserId: async () => {
            throw new ApplicationError(
              "AUTHENTICATION_REQUIRED",
              "Entre novamente.",
              401,
            );
          },
        },
        reader,
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED", status: 401 });
  });

  it("denies a verified but different Auth user", async () => {
    await expect(
      resolveAdminAccess(
        { getAuthenticatedUserId: async () => "wrong-user" },
        reader,
      ),
    ).rejects.toMatchObject({ code: "ADMIN_NOT_AUTHORIZED", status: 403 });
  });

  it("allows the verified user mapped by admin_auth_user_id", async () => {
    await expect(
      resolveAdminAccess(
        { getAuthenticatedUserId: async () => "correct-user" },
        reader,
      ),
    ).resolves.toMatchObject({
      businessId: "business-a",
      resolvedBy: "admin-auth-user",
    });
  });
});
