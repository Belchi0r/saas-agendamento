import type { BlockedPeriodSnapshot } from "./blocked-period-repository";
import { Temporal } from "@/infrastructure/time/temporal";

export type BlockedPeriodView = Readonly<{
  id: string;
  localDate: string;
  startLocalTime: string;
  endLocalTime: string;
  privateReason: string | null;
  version: number;
}>;

export type BlockedPeriodListView = Readonly<{
  timezone: string | null;
  availabilityVersion: number;
  blockedPeriods: readonly BlockedPeriodView[];
}>;

export function toBlockedPeriodListView(
  snapshot: BlockedPeriodSnapshot,
): BlockedPeriodListView {
  return {
    timezone: snapshot.timezone,
    availabilityVersion: snapshot.availabilityVersion,
    blockedPeriods: snapshot.blockedPeriods.map((blockedPeriod) => {
      const start = Temporal.Instant.from(blockedPeriod.startAtUtc)
        .toZonedDateTimeISO(blockedPeriod.timezoneSnapshot);
      const end = Temporal.Instant.from(blockedPeriod.endAtUtc)
        .toZonedDateTimeISO(blockedPeriod.timezoneSnapshot);
      return {
        id: blockedPeriod.id,
        localDate: start.toPlainDate().toString(),
        startLocalTime: start.toPlainTime().toString({ smallestUnit: "minute" }),
        endLocalTime: end.toPlainTime().toString({ smallestUnit: "minute" }),
        privateReason: blockedPeriod.privateReason,
        version: blockedPeriod.version,
      };
    }),
  };
}
