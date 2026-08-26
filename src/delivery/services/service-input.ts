import { z } from "zod";

const priceMinorSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const durationMinutesSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const expectedVersionSchema = z.number().int().positive();

export const createServiceInputSchema = z.strictObject({
  name: z.string().trim().min(1),
  description: z.string().nullable(),
  priceMinor: priceMinorSchema,
  durationMinutes: durationMinutesSchema,
  active: z.boolean(),
});

export const changeServiceInputSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("update"),
    name: z.string().trim().min(1),
    description: z.string().nullable(),
    priceMinor: priceMinorSchema,
    durationMinutes: durationMinutesSchema,
    expectedVersion: expectedVersionSchema,
  }),
  z.strictObject({
    action: z.literal("set-active"),
    active: z.boolean(),
    expectedVersion: expectedVersionSchema,
  }),
]);

export const serviceIdSchema = z.uuid();
