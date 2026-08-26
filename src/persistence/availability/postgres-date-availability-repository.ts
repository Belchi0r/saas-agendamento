import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  DateAvailabilityRepository,
  DateAvailabilitySnapshot,
} from "@/application/availability/date-availability-repository";
import {
  assertDateAvailabilityMutation,
  DateAvailabilityRuleError,
  type DateAvailabilityException,
  type DateAvailabilityMutation,
} from "@/domain/availability/date-availability";
import type { BusinessScope } from "@/domain/business/business-scope";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  businesses,
  dateAvailabilityExceptions,
  exceptionWorkingWindows,
} from "../database/schema";
import { findPostgresError } from "../database/postgres-error";
import type * as schema from "../database/schema";

type AppDatabase = NodePgDatabase<typeof schema>;
type AppTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

type ExceptionJoinRow = Readonly<{
  id: string;
  business_id: string;
  local_date: string;
  mode: "CLOSED" | "REPLACE";
  private_note: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  window_id: string | null;
  start_local_time: string | null;
  end_local_time: string | null;
}>;

function normalizeDatabaseTime(value: string): string {
  return value.endsWith(":00") ? value.slice(0, 5) : value;
}

function mapExceptionRows(
  rows: readonly ExceptionJoinRow[],
): DateAvailabilityException[] {
  type MutableException = Omit<DateAvailabilityException, "workingWindows"> & {
    workingWindows: DateAvailabilityException["workingWindows"];
  };
  const mapped = new Map<string, MutableException>();

  for (const row of rows) {
    const current = mapped.get(row.id) ?? {
      id: row.id,
      businessId: row.business_id,
      localDate: row.local_date,
      mode: row.mode,
      privateNote: row.private_note,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      workingWindows: [],
    };

    if (
      row.window_id &&
      row.start_local_time !== null &&
      row.end_local_time !== null
    ) {
      current.workingWindows = [
        ...current.workingWindows,
        {
          id: row.window_id,
          dateExceptionId: row.id,
          startLocalTime: normalizeDatabaseTime(row.start_local_time),
          endLocalTime: normalizeDatabaseTime(row.end_local_time),
        },
      ];
    }

    mapped.set(row.id, current);
  }

  return [...mapped.values()];
}

export class PostgresDateAvailabilityRepository
  implements DateAvailabilityRepository
{
  constructor(
    private readonly database: AppDatabase,
    readonly scope: BusinessScope,
  ) {}

  async getSnapshot(): Promise<DateAvailabilitySnapshot> {
    const [business] = await this.database
      .select({
        timezone: businesses.timezone,
        availabilityVersion: businesses.availabilityVersion,
      })
      .from(businesses)
      .where(eq(businesses.id, this.scope.businessId))
      .limit(1);

    if (!business) throw this.businessNotFound();
    const exceptions = await this.loadExceptions(this.database);
    return { ...business, exceptions };
  }

  async applyMutation(
    mutation: DateAvailabilityMutation,
  ): Promise<DateAvailabilitySnapshot> {
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

        const current = await this.loadExceptions(transaction);
        assertDateAvailabilityMutation(current, mutation);
        if (mutation.kind !== "create") {
          const target = current.find((item) => item.id === mutation.id);
          if (!target || target.version !== mutation.expectedVersion) {
            throw new ApplicationError(
              "DATE_EXCEPTION_VERSION_CONFLICT",
              "A data especial mudou desde que esta tela foi aberta.",
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
          exceptions: await this.loadExceptions(transaction),
        };
      });
    } catch (error) {
      const postgresError = findPostgresError(error);
      if (error instanceof DateAvailabilityRuleError) {
        throw this.mapRuleError(error);
      }
      if (postgresError?.code === "23505") {
        throw new ApplicationError(
          "DATE_EXCEPTION_ALREADY_EXISTS",
          "Já existe uma configuração especial para esta data.",
          409,
        );
      }
      if (postgresError?.code === "23P01") {
        throw new ApplicationError(
          "DATE_EXCEPTION_WINDOW_OVERLAP",
          "As faixas especiais não podem se sobrepor.",
          409,
        );
      }
      throw error;
    }
  }

  private async loadExceptions(
    database: AppDatabase | AppTransaction,
  ): Promise<DateAvailabilityException[]> {
    const result = await database.execute(sql<ExceptionJoinRow>`
      select
        exception.id,
        exception.business_id,
        exception.local_date::text,
        exception.mode,
        exception.private_note,
        exception.version,
        exception.created_at,
        exception.updated_at,
        working_window.id as window_id,
        working_window.start_local_time::text,
        working_window.end_local_time::text
      from app_private.date_availability_exception as exception
      left join app_private.exception_working_window as working_window
        on working_window.date_exception_id = exception.id
      where exception.business_id = ${this.scope.businessId}
      order by exception.local_date, exception.id,
               working_window.start_local_time, working_window.id
    `);

    return mapExceptionRows(result.rows as unknown as ExceptionJoinRow[]);
  }

  private async persistMutation(
    transaction: AppTransaction,
    mutation: DateAvailabilityMutation,
  ): Promise<void> {
    if (mutation.kind === "delete") {
      await transaction
        .delete(dateAvailabilityExceptions)
        .where(
          and(
            eq(dateAvailabilityExceptions.businessId, this.scope.businessId),
            eq(dateAvailabilityExceptions.id, mutation.id),
            eq(dateAvailabilityExceptions.version, mutation.expectedVersion),
          ),
        );
      return;
    }

    if (mutation.kind === "create") {
      await transaction.insert(dateAvailabilityExceptions).values({
        id: mutation.id,
        businessId: this.scope.businessId,
        localDate: mutation.draft.localDate,
        mode: mutation.draft.mode,
        privateNote: mutation.draft.privateNote,
      });
    } else {
      await transaction
        .update(dateAvailabilityExceptions)
        .set({
          localDate: mutation.draft.localDate,
          mode: mutation.draft.mode,
          privateNote: mutation.draft.privateNote,
          version: mutation.expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dateAvailabilityExceptions.businessId, this.scope.businessId),
            eq(dateAvailabilityExceptions.id, mutation.id),
            eq(dateAvailabilityExceptions.version, mutation.expectedVersion),
          ),
        );
      await transaction
        .delete(exceptionWorkingWindows)
        .where(eq(exceptionWorkingWindows.dateExceptionId, mutation.id));
    }

    if (mutation.draft.workingWindows.length > 0) {
      await transaction.insert(exceptionWorkingWindows).values(
        mutation.draft.workingWindows.map((window, index) => ({
          id: mutation.windowIds[index]!,
          dateExceptionId: mutation.id,
          startLocalTime: window.startLocalTime,
          endLocalTime: window.endLocalTime,
        })),
      );
    }
  }

  private mapRuleError(error: DateAvailabilityRuleError): ApplicationError {
    if (error.code === "DATE_EXCEPTION_ITEM_NOT_FOUND") {
      return new ApplicationError(
        error.code,
        "A data especial não existe neste negócio.",
        404,
      );
    }
    return new ApplicationError(
      error.code,
      error.code === "DATE_EXCEPTION_WINDOW_OVERLAP"
        ? "As faixas especiais não podem se sobrepor."
        : "Revise a data e as faixas especiais.",
      error.code === "DATE_EXCEPTION_WINDOW_OVERLAP" ? 409 : 400,
    );
  }

  private businessNotFound(): ApplicationError {
    return new ApplicationError(
      "BUSINESS_SCOPE_NOT_FOUND",
      "Não foi possível identificar o negócio.",
      503,
    );
  }
}
