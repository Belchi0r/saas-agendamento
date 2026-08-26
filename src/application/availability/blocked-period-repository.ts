import type {
  BlockedPeriod,
  BlockedPeriodMutation,
} from "@/domain/availability/blocked-period";
import type { BusinessScope } from "@/domain/business/business-scope";

export type BlockedPeriodSnapshot = Readonly<{
  timezone: string | null;
  availabilityVersion: number;
  blockedPeriods: readonly BlockedPeriod[];
}>;

export interface BlockedPeriodRepository {
  readonly scope: BusinessScope;
  getSnapshot(): Promise<BlockedPeriodSnapshot>;
  applyMutation(mutation: BlockedPeriodMutation): Promise<BlockedPeriodSnapshot>;
}
