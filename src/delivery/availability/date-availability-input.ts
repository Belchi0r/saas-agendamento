import { z } from "zod";

const localTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positiveVersionSchema = z.number().int().positive();
const exceptionWindowSchema = z.strictObject({
  startLocalTime: localTimeSchema,
  endLocalTime: localTimeSchema,
});

const exceptionFields = {
  localDate: localDateSchema,
  mode: z.enum(["CLOSED", "REPLACE"]),
  privateNote: z.string().trim().min(1).nullable(),
  workingWindows: z.array(exceptionWindowSchema),
  expectedAvailabilityVersion: positiveVersionSchema,
} as const;

export const createDateAvailabilityInputSchema = z.strictObject(exceptionFields);

export const updateDateAvailabilityInputSchema = z.strictObject({
  action: z.literal("update"),
  ...exceptionFields,
  expectedVersion: positiveVersionSchema,
});

export const deleteDateAvailabilityInputSchema = z.strictObject({
  expectedVersion: positiveVersionSchema,
  expectedAvailabilityVersion: positiveVersionSchema,
});

export const dateAvailabilityIdSchema = z.uuid();
