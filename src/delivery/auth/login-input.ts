import { z } from "zod";

export const loginInputSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1),
});
