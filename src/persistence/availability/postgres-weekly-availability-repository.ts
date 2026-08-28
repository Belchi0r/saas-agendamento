import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  WeeklyAvailabilityRepository,
  WeeklyAvailabilitySnapshot,
} from "@/application/availability/weekly-availability-repository";
import {
  assertWeeklyAvailabilityMutation,
  WeeklyAvailabilityRuleError,
  type IsoWeekday,
  type WeeklyAvailabilityMutation,
  type WeeklyBreak,
  type WeeklyWorkingWindow,
} from "@/domain/availability/weekly-availability";
import type { BusinessScope } from "@/domain/business/business-scope";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  businesses,
  weeklyBreaks,
  weeklyWorkingWindows,
} from "../database/schema";
import { findPostgresError } from "../database/postgres-error";
import type * as schema from "../database/schema";

type AppDatabase = NodePgDatabase<typeof schema>;

function normalizeDatabaseTime(value: string): string {
  return value.endsWith(":00") ? value.slice(0, 5) : value;
}

function toWorkingWindow(
  row: typeof weeklyWorkingWindows.$inferSelect,
): WeeklyWorkingWindow {
  return {
    id: row.id,
    businessId: row.businessId,
    weekday: row.weekday as IsoWeekday,
    startLocalTime: normalizeDatabaseTime(row.startLocalTime),
    endLocalTime: normalizeDatabaseTime(row.endLocalTime),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWeeklyBreak(row: typeof weeklyBreaks.$inferSelect): WeeklyBreak {
  return {
    id: row.id,
    businessId: row.businessId,
    weekday: row.weekday as IsoWeekday,
    startLocalTime: normalizeDatabaseTime(row.startLocalTime),
    endLocalTime: normalizeDatabaseTime(row.endLocalTime),
  };
}

function mapRuleError(error: WeeklyAvailabilityRuleError): ApplicationError {
  switch (error.code) {
    case "WEEKLY_ITEM_NOT_FOUND":
      return new ApplicationError(
        error.code,
        "A faixa não existe neste negócio.",
        404,
      );
    case "WORKING_WINDOW_OVERLAP":
      return new ApplicationError(
        error.code,
        "As faixas de trabalho do mesmo dia não podem se sobrepor.",
        409,
      );
    case "WEEKLY_BREAK_OVERLAP":
      return new ApplicationError(
        error.code,
        "As pausas do mesmo dia não podem se sobrepor.",
        409,
      );
    case "WEEKLY_BREAK_OUTSIDE_WORKING_WINDOW":
      return new ApplicationError(
        error.code,
        "Toda pausa deve cruzar uma faixa de trabalho do mesmo dia.",
        409,
      );
    case "WEEKLY_RANGE_INVALID":
      return new ApplicationError(
        error.code,
        "Informe um dia e um horário inicial anterior ao final.",
        400,
      );
    case "WEEKLY_REPLACEMENT_CONFIRMATION_REQUIRED":
      return new ApplicationError(
        error.code,
        "Confirme a substituição dos horários que já existem nos dias selecionados.",
        409,
      );
  }
}

export class PostgresWeeklyAvailabilityRepository
  implements WeeklyAvailabilityRepository
{
  constructor(
    private readonly database: AppDatabase,
    readonly scope: BusinessScope,
  ) {}

  async getSnapshot(): Promise<WeeklyAvailabilitySnapshot> {
    const [business] = await this.database
      .select({
        timezone: businesses.timezone,
        availabilityVersion: businesses.availabilityVersion,
      })
      .from(businesses)
      .where(eq(businesses.id, this.scope.businessId))
      .limit(1);

    if (!business) throw this.businessNotFound();

    const [workingRows, breakRows] = await Promise.all([
      this.database
        .select()
        .from(weeklyWorkingWindows)
        .where(eq(weeklyWorkingWindows.businessId, this.scope.businessId))
        .orderBy(
          asc(weeklyWorkingWindows.weekday),
          asc(weeklyWorkingWindows.startLocalTime),
          asc(weeklyWorkingWindows.id),
        ),
      this.database
        .select()
        .from(weeklyBreaks)
        .where(eq(weeklyBreaks.businessId, this.scope.businessId))
        .orderBy(
          asc(weeklyBreaks.weekday),
          asc(weeklyBreaks.startLocalTime),
          asc(weeklyBreaks.id),
        ),
    ]);

    return {
      timezone: business.timezone,
      availabilityVersion: business.availabilityVersion,
      workingWindows: workingRows.map(toWorkingWindow),
      breaks: breakRows.map(toWeeklyBreak),
    };
  }

  async applyMutation(
    mutation: WeeklyAvailabilityMutation,
  ): Promise<WeeklyAvailabilitySnapshot> {
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
            "Os horários mudaram desde que esta tela foi aberta. Recarregue e tente novamente.",
            409,
          );
        }

        const [currentWorkingRows, currentBreakRows] = await Promise.all([
          transaction
            .select()
            .from(weeklyWorkingWindows)
            .where(eq(weeklyWorkingWindows.businessId, this.scope.businessId))
            .orderBy(
              asc(weeklyWorkingWindows.weekday),
              asc(weeklyWorkingWindows.startLocalTime),
              asc(weeklyWorkingWindows.id),
            ),
          transaction
            .select()
            .from(weeklyBreaks)
            .where(eq(weeklyBreaks.businessId, this.scope.businessId))
            .orderBy(
              asc(weeklyBreaks.weekday),
              asc(weeklyBreaks.startLocalTime),
              asc(weeklyBreaks.id),
            ),
        ]);

        assertWeeklyAvailabilityMutation(
          {
            workingWindows: currentWorkingRows.map(toWorkingWindow),
            breaks: currentBreakRows.map(toWeeklyBreak),
          },
          mutation,
        );

        await this.persistMutation(transaction, mutation);

        const nextVersion = mutation.expectedAvailabilityVersion + 1;
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

        const [workingRows, breakRows] = await Promise.all([
          transaction
            .select()
            .from(weeklyWorkingWindows)
            .where(eq(weeklyWorkingWindows.businessId, this.scope.businessId))
            .orderBy(
              asc(weeklyWorkingWindows.weekday),
              asc(weeklyWorkingWindows.startLocalTime),
              asc(weeklyWorkingWindows.id),
            ),
          transaction
            .select()
            .from(weeklyBreaks)
            .where(eq(weeklyBreaks.businessId, this.scope.businessId))
            .orderBy(
              asc(weeklyBreaks.weekday),
              asc(weeklyBreaks.startLocalTime),
              asc(weeklyBreaks.id),
            ),
        ]);

        return {
          timezone: business.timezone,
          availabilityVersion: nextVersion,
          workingWindows: workingRows.map(toWorkingWindow),
          breaks: breakRows.map(toWeeklyBreak),
        };
      });
    } catch (error) {
      if (error instanceof WeeklyAvailabilityRuleError) {
        throw mapRuleError(error);
      }

      if (findPostgresError(error)?.code === "23P01") {
        throw new ApplicationError(
          "WEEKLY_RANGE_OVERLAP",
          "Já existe uma faixa do mesmo tipo sobreposta neste dia.",
          409,
        );
      }

      throw error;
    }
  }

  private async persistMutation(
    transaction: Parameters<
      Parameters<AppDatabase["transaction"]>[0]
    >[0],
    mutation: WeeklyAvailabilityMutation,
  ): Promise<void> {
    switch (mutation.kind) {
      case "create-working-window":
        await transaction.insert(weeklyWorkingWindows).values({
          id: mutation.id,
          businessId: this.scope.businessId,
          weekday: mutation.range.weekday,
          startLocalTime: mutation.range.startLocalTime,
          endLocalTime: mutation.range.endLocalTime,
        });
        return;
      case "update-working-window":
        await transaction
          .update(weeklyWorkingWindows)
          .set({
            weekday: mutation.range.weekday,
            startLocalTime: mutation.range.startLocalTime,
            endLocalTime: mutation.range.endLocalTime,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(weeklyWorkingWindows.businessId, this.scope.businessId),
              eq(weeklyWorkingWindows.id, mutation.id),
            ),
          );
        return;
      case "delete-working-window":
        await transaction
          .delete(weeklyWorkingWindows)
          .where(
            and(
              eq(weeklyWorkingWindows.businessId, this.scope.businessId),
              eq(weeklyWorkingWindows.id, mutation.id),
            ),
          );
        return;
      case "create-break":
        await transaction.insert(weeklyBreaks).values({
          id: mutation.id,
          businessId: this.scope.businessId,
          weekday: mutation.range.weekday,
          startLocalTime: mutation.range.startLocalTime,
          endLocalTime: mutation.range.endLocalTime,
        });
        return;
      case "update-break":
        await transaction
          .update(weeklyBreaks)
          .set({
            weekday: mutation.range.weekday,
            startLocalTime: mutation.range.startLocalTime,
            endLocalTime: mutation.range.endLocalTime,
          })
          .where(
            and(
              eq(weeklyBreaks.businessId, this.scope.businessId),
              eq(weeklyBreaks.id, mutation.id),
            ),
          );
        return;
      case "delete-break":
        await transaction
          .delete(weeklyBreaks)
          .where(
            and(
              eq(weeklyBreaks.businessId, this.scope.businessId),
              eq(weeklyBreaks.id, mutation.id),
            ),
          );
        return;
      case "replace-days": {
        const weekdays = mutation.replacements.map((item) => item.weekday);
        await transaction
          .delete(weeklyBreaks)
          .where(
            and(
              eq(weeklyBreaks.businessId, this.scope.businessId),
              inArray(weeklyBreaks.weekday, weekdays),
            ),
          );
        await transaction
          .delete(weeklyWorkingWindows)
          .where(
            and(
              eq(weeklyWorkingWindows.businessId, this.scope.businessId),
              inArray(weeklyWorkingWindows.weekday, weekdays),
            ),
          );
        await transaction.insert(weeklyWorkingWindows).values(
          mutation.replacements.map((replacement) => ({
            id: replacement.workingWindow.id,
            businessId: this.scope.businessId,
            weekday: replacement.weekday,
            startLocalTime: replacement.workingWindow.startLocalTime,
            endLocalTime: replacement.workingWindow.endLocalTime,
          })),
        );
        const replacementBreaks = mutation.replacements.flatMap((replacement) =>
          replacement.weeklyBreak
            ? [{
                id: replacement.weeklyBreak.id,
                businessId: this.scope.businessId,
                weekday: replacement.weekday,
                startLocalTime: replacement.weeklyBreak.startLocalTime,
                endLocalTime: replacement.weeklyBreak.endLocalTime,
              }]
            : [],
        );
        if (replacementBreaks.length > 0) {
          await transaction.insert(weeklyBreaks).values(replacementBreaks);
        }
        return;
      }
    }
  }

  private businessNotFound(): ApplicationError {
    return new ApplicationError(
      "BUSINESS_SCOPE_NOT_FOUND",
      "Não foi possível identificar o negócio.",
      503,
    );
  }
}
