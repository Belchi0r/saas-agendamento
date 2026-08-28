import { z } from "zod";

const localTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const expectedAvailabilityVersionSchema = z.number().int().positive();

export const weeklyRangeInputSchema = z.strictObject({
  weekday: z.number().int().min(1).max(7),
  startLocalTime: localTimeSchema,
  endLocalTime: localTimeSchema,
  expectedAvailabilityVersion: expectedAvailabilityVersionSchema,
});

export const updateWeeklyRangeInputSchema = z.strictObject({
  action: z.literal("update"),
  weekday: z.number().int().min(1).max(7),
  startLocalTime: localTimeSchema,
  endLocalTime: localTimeSchema,
  expectedAvailabilityVersion: expectedAvailabilityVersionSchema,
});

export const deleteWeeklyRangeInputSchema = z.strictObject({
  expectedAvailabilityVersion: expectedAvailabilityVersionSchema,
});

export const weeklyRangeIdSchema = z.uuid();

export const replaceWeeklyDaysInputSchema = z.strictObject({
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  workingStartLocalTime: localTimeSchema,
  workingEndLocalTime: localTimeSchema,
  breakStartLocalTime: localTimeSchema.nullable(),
  breakEndLocalTime: localTimeSchema.nullable(),
  confirmReplaceExisting: z.boolean(),
  expectedAvailabilityVersion: expectedAvailabilityVersionSchema,
}).refine(
  (input) =>
    (input.breakStartLocalTime === null) ===
    (input.breakEndLocalTime === null),
  { message: "Break times must be provided together." },
);
