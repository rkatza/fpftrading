import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

/**
 * v1 auth: shared partner password + 4 allow-listed emails (PRD §3).
 * JWT sessions, no DB adapter — keeps auth() usable from proxy.ts.
 */
export const ALLOWED_EMAILS = [
  "rk@katz.com.pa",
  "simon@katz.com.pa",
  "isaac@fpffund.com",
  "fernando@fpffund.com",
] as const;

const credentialsSchema = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        if (!(ALLOWED_EMAILS as readonly string[]).includes(email)) return null;
        if (!process.env.AUTH_PASSWORD || password !== process.env.AUTH_PASSWORD) return null;
        return { email, name: email.split("@")[0] };
      },
    }),
  ],
});
