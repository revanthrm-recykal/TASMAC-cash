import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getAgentById } from "./sheets";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "agent-pin",
      name: "Agent PIN",
      credentials: {
        agentId: { label: "Agent", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.agentId || !credentials?.pin) return null;
        const agent = await getAgentById(parseInt(credentials.agentId));
        if (!agent || !agent.isActive) return null;
        const valid = await bcrypt.compare(credentials.pin, agent.pinHash);
        if (!valid) return null;
        return { id: String(agent.id), name: agent.name, role: "agent" };
      },
    }),
    CredentialsProvider({
      id: "admin-password",
      name: "Admin",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null;
        if (credentials.password === process.env.ADMIN_PASSWORD) {
          return { id: "admin", name: "Admin", role: "admin" };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as unknown as { role: string }).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { role?: string; id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
};
