import { z } from "zod";

const uuid = z.uuid();
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const publicAvailabilityQuerySchema = z.object({
  serviceId: uuid,
  localDate,
}).strict();

export const publicAvailabilityDatesQuerySchema = z.object({
  serviceId: uuid,
}).strict();

export const publicBookingInputSchema = z.object({
  serviceId: uuid,
  localDate,
  localTime,
  customerName: z.string().min(2).max(120),
  whatsappE164: z.string().min(8).max(32),
  reviewedService: z.object({
    version: z.number().int().positive(),
    name: z.string().min(1).max(160),
    durationMinutes: z.number().int().positive(),
    priceMinor: z.number().int().nonnegative(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
  }).strict(),
}).strict();

export const managementTokenInputSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();
