import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));
const password = z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email,
  password,
});
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password").max(128) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ password });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
