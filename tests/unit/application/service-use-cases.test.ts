import { describe, expect, it, vi } from "vitest";

import type { ServiceRepository } from "@/application/services/service-repository";
import {
  createService,
  setServiceActive,
  updateService,
} from "@/application/services/service-use-cases";
import { businessScopeFromServer } from "@/domain/business/business-scope";

function repository(): ServiceRepository {
  return {
    scope: businessScopeFromServer("business-a", "admin-auth-user"),
    listAll: vi.fn(async () => []),
    listActive: vi.fn(async () => []),
    create: vi.fn(async (id, input) => ({
      id,
      businessId: "business-a",
      ...input,
      currencyCode: "BRL",
      version: 1,
      createdAt: new Date("2026-08-23T00:00:00Z"),
      updatedAt: new Date("2026-08-23T00:00:00Z"),
    })),
    update: vi.fn(async (id, input) => ({
      id,
      businessId: "business-a",
      name: input.name,
      description: input.description,
      priceMinor: input.priceMinor,
      currencyCode: "BRL",
      durationMinutes: input.durationMinutes,
      active: true,
      version: input.expectedVersion + 1,
      createdAt: new Date("2026-08-23T00:00:00Z"),
      updatedAt: new Date("2026-08-23T00:01:00Z"),
    })),
    setActive: vi.fn(async (id, input) => ({
      id,
      businessId: "business-a",
      name: "Atendimento",
      description: null,
      priceMinor: 10_000,
      currencyCode: "BRL",
      durationMinutes: 60,
      active: input.active,
      version: input.expectedVersion + 1,
      createdAt: new Date("2026-08-23T00:00:00Z"),
      updatedAt: new Date("2026-08-23T00:01:00Z"),
    })),
  };
}

describe("Service application use cases", () => {
  it("creates a normalized Service in the repository scope", async () => {
    const adapter = repository();
    const result = await createService(adapter, {
      name: "  Atendimento  ",
      description: "  Individual  ",
      priceMinor: 10_000,
      durationMinutes: 60,
      active: true,
    });

    expect(result.businessId).toBe("business-a");
    expect(result.name).toBe("Atendimento");
    expect(adapter.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: "Atendimento", description: "Individual" }),
    );
  });

  it("updates fields and changes activity with optimistic versions", async () => {
    const adapter = repository();

    await expect(
      updateService(adapter, "service-a", {
        name: "Novo nome",
        description: null,
        priceMinor: 20_000,
        durationMinutes: 90,
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({ version: 4, name: "Novo nome" });

    await expect(
      setServiceActive(adapter, "service-a", {
        active: false,
        expectedVersion: 4,
      }),
    ).resolves.toMatchObject({ version: 5, active: false });
  });
});
