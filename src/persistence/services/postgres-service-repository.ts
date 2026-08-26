import { and, asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { ServiceRepository } from "@/application/services/service-repository";
import type { BusinessScope } from "@/domain/business/business-scope";
import type {
  Service,
  ServiceChanges,
  ServiceDraft,
  ServiceStatusChange,
} from "@/domain/services/service";
import { ApplicationError } from "@/shared/errors/application-error";

import { businesses, services } from "../database/schema";
import type * as schema from "../database/schema";

type AppDatabase = NodePgDatabase<typeof schema>;

function toService(row: typeof services.$inferSelect): Service {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    description: row.description,
    priceMinor: row.priceMinor,
    currencyCode: row.currencyCode,
    durationMinutes: row.durationMinutes,
    active: row.active,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresServiceRepository implements ServiceRepository {
  constructor(
    private readonly database: AppDatabase,
    readonly scope: BusinessScope,
  ) {}

  async listAll(): Promise<Service[]> {
    const rows = await this.database
      .select()
      .from(services)
      .where(eq(services.businessId, this.scope.businessId))
      .orderBy(desc(services.active), asc(services.name), asc(services.id));

    return rows.map(toService);
  }

  async listActive(): Promise<Service[]> {
    const rows = await this.database
      .select()
      .from(services)
      .where(
        and(
          eq(services.businessId, this.scope.businessId),
          eq(services.active, true),
        ),
      )
      .orderBy(asc(services.name), asc(services.id));

    return rows.map(toService);
  }

  async create(id: string, input: ServiceDraft): Promise<Service> {
    const [business] = await this.database
      .select({ currencyCode: businesses.currencyCode })
      .from(businesses)
      .where(eq(businesses.id, this.scope.businessId))
      .limit(1);

    if (!business) {
      throw new ApplicationError(
        "BUSINESS_SCOPE_NOT_FOUND",
        "Não foi possível identificar o negócio.",
        503,
      );
    }

    const [created] = await this.database
      .insert(services)
      .values({
        id,
        businessId: this.scope.businessId,
        name: input.name,
        description: input.description,
        priceMinor: input.priceMinor,
        currencyCode: business.currencyCode,
        durationMinutes: input.durationMinutes,
        active: input.active,
        version: 1,
      })
      .returning();

    if (!created) {
      throw new ApplicationError(
        "SERVICE_CREATE_FAILED",
        "Não foi possível criar o serviço.",
        500,
      );
    }

    return toService(created);
  }

  async update(id: string, input: ServiceChanges): Promise<Service> {
    const [updated] = await this.database
      .update(services)
      .set({
        name: input.name,
        description: input.description,
        priceMinor: input.priceMinor,
        durationMinutes: input.durationMinutes,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(services.businessId, this.scope.businessId),
          eq(services.id, id),
          eq(services.version, input.expectedVersion),
        ),
      )
      .returning();

    return this.requireUpdated(updated);
  }

  async setActive(id: string, input: ServiceStatusChange): Promise<Service> {
    const [updated] = await this.database
      .update(services)
      .set({
        active: input.active,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(services.businessId, this.scope.businessId),
          eq(services.id, id),
          eq(services.version, input.expectedVersion),
        ),
      )
      .returning();

    return this.requireUpdated(updated);
  }

  private requireUpdated(
    updated: typeof services.$inferSelect | undefined,
  ): Service {
    if (!updated) {
      throw new ApplicationError(
        "SERVICE_VERSION_CONFLICT",
        "O serviço mudou desde que esta tela foi aberta. Atualize e tente novamente.",
        409,
      );
    }

    return toService(updated);
  }
}
