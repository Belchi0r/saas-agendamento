import type { BusinessScope } from "@/domain/business/business-scope";
import type {
  WeeklyAvailabilityMutation,
  WeeklyBreak,
  WeeklyWorkingWindow,
} from "@/domain/availability/weekly-availability";

export type WeeklyAvailabilitySnapshot = Readonly<{
  timezone: string | null;
  availabilityVersion: number;
  futureConfirmedAppointmentsOutsideAvailability: number;
  workingWindows: readonly WeeklyWorkingWindow[];
  breaks: readonly WeeklyBreak[];
}>;

export interface WeeklyAvailabilityRepository {
  readonly scope: BusinessScope;
  getSnapshot(): Promise<WeeklyAvailabilitySnapshot>;
  applyMutation(
    mutation: WeeklyAvailabilityMutation,
  ): Promise<WeeklyAvailabilitySnapshot>;
}
