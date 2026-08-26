import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  BlockedPeriodRepository,
  BlockedPeriodSnapshot,
} from "@/application/availability/blocked-period-repository";
import type {
  BlockedPeriod,
  BlockedPeriodMutation,
} from "@/domain/availability/blocked-period";
import type { BusinessScope } from "@/domain/business/business-scope";
import { ApplicationError } from "@/shared/errors/application-error";

import { blockedPeriods, businesses } from "../database/schema";
import { findPostgresError } from "../database/postgres-error";
import type * as schema from "../database/schema";

type AppDatabase = NodePgDatabase<typeof schema>;
type AppTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

function toBlockedPeriod(row: typeof blockedPeriods.$inferSelect): BlockedPeriod {
  return {
    id: row.id,
    businessId: row.businessId,
    startAtUtc: row.startAt.toISOString(),
    endAtUtc: row.endAt.toISOString(),
    timezoneSnapshot: row.timezoneSnapshot,
    privateReason: row.privateReason,
    active: row.active,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresBlockedPeriodRepository implements BlockedPeriodRepository {
  constructor(
    private readonly database: AppDatabase,
    readonly scope: BusinessScope,
  ) {}

  async getSnapshot(): Promise<BlockedPeriodSnapshot> {
    const [business] = await this.database
      .select({
        timezone: businesses.timezone,
        availabilityVersion: businesses.availabilityVersion,
      })
      .from(businesses)
      .where(eq(businesses.id, this.scope.businessId))
      .limit(1);
    if (!business) throw this.businessNotFound();

    return {
      ...business,
      blockedPeriods: await this.loadActive(this.database),
    };
  }

  async applyMutation(
    mutation: BlockedPeriodMutation,
  ): Promise<BlockedPeriodSnapshot> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [business] = await transaction
          .select({
            timezone: businesses.timezone,
            availabilityVersion: businesses.availabilityVersion,
          })
          .from(businesses)
          .where(eq(businesses.id, this.scope.businessId))
          .limit(1)
          .for("update");
        if (!business) throw this.businessNotFound();
        if (
          business.availabilityVersion !== mutation.expectedAvailabilityVersion
        ) {
          throw new ApplicationError(
            "AVAILABILITY_VERSION_CONFLICT",
            "A disponibilidade mudou desde que esta tela foi aberta. Recarregue e tente novamente.",
            409,
          );
        }

        if (mutation.kind !== "create") {
          const [target] = await transaction
            .select({ version: blockedPeriods.version })
            .from(blockedPeriods)
            .where(
              and(
                eq(blockedPeriods.businessId, this.scope.businessId),
                eq(blockedPeriods.id, mutation.id),
                eq(blockedPeriods.active, true),
              ),
            )
            .limit(1);
          if (!target) {
            throw new ApplicationError(
              "BLOCKED_PERIOD_NOT_FOUND",
              "O bloqueio não existe neste negócio.",
              404,
            );
          }
          if (target.version !== mutation.expectedVersion) {
            throw new ApplicationError(
              "BLOCKED_PERIOD_VERSION_CONFLICT",
              "O bloqueio mudou desde que esta tela foi aberta.",
              409,
            );
          }
        }

        await this.persistMutation(transaction, mutation);
        await transaction
          .update(businesses)
          .set({
            availabilityVersion: sql`${businesses.availabilityVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(businesses.id, this.scope.businessId),
              eq(
                businesses.availabilityVersion,
                mutation.expectedAvailabilityVersion,
              ),
            ),
          );

        return {
          timezone: business.timezone,
          availabilityVersion: mutation.expectedAvailabilityVersion + 1,
          blockedPeriods: await this.loadActive(transaction),
        };
      });
    } catch (error) {
      if (findPostgresError(error)?.code === "23P01") {
        throw new ApplicationError(
          "BLOCKED_PERIOD_CONFLICT",
          "Este período já está ocupado.",
          409,
        );
      }
      throw error;
    }
  }

  private async loadActive(
    database: AppDatabase | AppTransaction,
  ): Promise<BlockedPeriod[]> {
    const rows = await database
      .select()
      .from(blockedPeriods)
      .where(
        and(
          eq(blockedPeriods.businessId, this.scope.businessId),
          eq(blockedPeriods.active, true),
        ),
      )
      .orderBy(asc(blockedPeriods.startAt), asc(blockedPeriods.id));
    return rows.map(toBlockedPeriod);
  }

  private async persistMutation(
    transaction: AppTransaction,
    mutation: BlockedPeriodMutation,
  ): Promise<void> {
    if (mutation.kind === "create") {
      await transaction.insert(blockedPeriods).values({
        id: mutation.id,
        businessId: this.scope.businessId,
        startAt: new Date(mutation.draft.startAtUtc),
        endAt: new Date(mutation.draft.endAtUtc),
        timezoneSnapshot: mutation.draft.timezoneSnapshot,
        privateReason: mutation.draft.privateReason,
        active: true,
      });
      await transaction.execute(sql`
        insert into app_private.schedule_occupancy (
          id, business_id, blocked_period_id, occupied_period
        ) values (
          ${mutation.occupancyId},
          ${this.scope.businessId},
          ${mutation.id},
          tstzrange(
            ${mutation.draft.startAtUtc}::timestamptz,
            ${mutation.draft.endAtUtc}::timestamptz,
            '[)'
          )
        )
      `);
      return;
    }

    if (mutation.kind === "update") {
      await transaction
        .update(blockedPeriods)
        .set({
          startAt: new Date(mutation.draft.startAtUtc),
          endAt: new Date(mutation.draft.endAtUtc),
          timezoneSnapshot: mutation.draft.timezoneSnapshot,
          privateReason: mutation.draft.privateReason,
          version: mutation.expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(blockedPeriods.businessId, this.scope.businessId),
            eq(blockedPeriods.id, mutation.id),
            eq(blockedPeriods.version, mutation.expectedVersion),
            eq(blockedPeriods.active, true),
          ),
        );
      await transaction.execute(sql`
        update app_private.schedule_occupancy
        set occupied_period = tstzrange(
          ${mutation.draft.startAtUtc}::timestamptz,
          ${mutation.draft.endAtUtc}::timestamptz,
          '[)'
        )
        where business_id = ${this.scope.businessId}
          and blocked_period_id = ${mutation.id}
          and released_at is null
      `);
      return;
    }

    await transaction
      .update(blockedPeriods)
      .set({
        active: false,
        version: mutation.expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(blockedPeriods.businessId, this.scope.businessId),
          eq(blockedPeriods.id, mutation.id),
          eq(blockedPeriods.version, mutation.expectedVersion),
          eq(blockedPeriods.active, true),
        ),
      );
    await transaction.execute(sql`
      update app_private.schedule_occupancy
      set released_at = clock_timestamp()
      where business_id = ${this.scope.businessId}
        and blocked_period_id = ${mutation.id}
        and released_at is null
    `);
  }

  private businessNotFound(): ApplicationError {
    return new ApplicationError(
      "BUSINESS_SCOPE_NOT_FOUND",
      "Não foi possível identificar o negócio.",
      503,
    );
  }
}
