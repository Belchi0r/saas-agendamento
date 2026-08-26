import type {
  DateAvailabilityException,
  DateAvailabilityMutation,
} from "@/domain/availability/date-availability";
import type { BusinessScope } from "@/domain/business/business-scope";

export type DateAvailabilitySnapshot = Readonly<{
  timezone: string | null;
  availabilityVersion: number;
  exceptions: readonly DateAvailabilityException[];
}>;

export interface DateAvailabilityRepository {
  readonly scope: BusinessScope;
  getSnapshot(): Promise<DateAvailabilitySnapshot>;
  applyMutation(
    mutation: DateAvailabilityMutation,
  ): Promise<DateAvailabilitySnapshot>;
}
