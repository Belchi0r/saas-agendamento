import { z } from "zod";

const localTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const positiveVersionSchema = z.number().int().positive();
const fields = {
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startLocalTime: localTimeSchema,
  endLocalTime: localTimeSchema,
  privateReason: z.string().trim().min(1).nullable(),
  expectedAvailabilityVersion: positiveVersionSchema,
} as const;

export const createBlockedPeriodInputSchema = z.strictObject(fields);
export const updateBlockedPeriodInputSchema = z.strictObject({
  action: z.literal("update"),
  ...fields,
  expectedVersion: positiveVersionSchema,
});
export const deactivateBlockedPeriodInputSchema = z.strictObject({
  expectedVersion: positiveVersionSchema,
  expectedAvailabilityVersion: positiveVersionSchema,
});
export const blockedPeriodIdSchema = z.uuid();
