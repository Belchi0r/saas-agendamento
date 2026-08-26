import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  BusinessIdentity,
  BusinessScopeReader,
} from "@/application/business/resolve-business-scope";
import type { BusinessScope } from "@/domain/business/business-scope";
import { ApplicationError } from "@/shared/errors/application-error";

import { businesses } from "../database/schema";
import type * as schema from "../database/schema";

type AppDatabase = NodePgDatabase<typeof schema>;

export type BusinessPresentation = Readonly<{
  id: string;
  publicName: string | null;
  publicDescription: string | null;
  publicContact: string | null;
  publicLocation: string | null;
  timezone: string | null;
  currencyCode: string;
  publicBookingEnabled: boolean;
}>;

export class PostgresBusinessRepository implements BusinessScopeReader {
  constructor(private readonly database: AppDatabase) {}

  async findPublicSingleton(): Promise<BusinessIdentity[]> {
    return this.database
      .select({
        id: businesses.id,
        adminAuthUserId: businesses.adminAuthUserId,
      })
      .from(businesses)
      .where(eq(businesses.publicBookingEnabled, true))
      .orderBy(asc(businesses.id))
      .limit(2);
  }

  async findByAdminAuthUserId(
    authUserId: string,
  ): Promise<BusinessIdentity | null> {
    const [business] = await this.database
      .select({
        id: businesses.id,
        adminAuthUserId: businesses.adminAuthUserId,
      })
      .from(businesses)
      .where(eq(businesses.adminAuthUserId, authUserId))
      .limit(1);

    return business ?? null;
  }

  async getPresentation(scope: BusinessScope): Promise<BusinessPresentation> {
    const [business] = await this.database
      .select({
        id: businesses.id,
        publicName: businesses.publicName,
        publicDescription: businesses.publicDescription,
        publicContact: businesses.publicContact,
        publicLocation: businesses.publicLocation,
        timezone: businesses.timezone,
        currencyCode: businesses.currencyCode,
        publicBookingEnabled: businesses.publicBookingEnabled,
      })
      .from(businesses)
      .where(eq(businesses.id, scope.businessId))
      .limit(1);

    if (!business) {
      throw new ApplicationError(
        "BUSINESS_SCOPE_NOT_FOUND",
        "Não foi possível identificar o negócio.",
        503,
      );
    }

    return business;
  }
}
