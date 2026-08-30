import { z } from "zod";

export const appointmentIdSchema = z.uuid();
export const customerIdSchema = z.uuid();
export const transitionAppointmentInputSchema = z.object({
  action: z.enum(["complete", "no-show", "cancel"]),
  expectedVersion: z.number().int().positive(),
}).strict();
