import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSession, getSessionsForDate, upsertSession } from "@/lib/sheets";
import { getTransactionsForAgent } from "@/lib/queries";
import { getAgentById } from "@/lib/sheets";

async function computeClosingBalance(agentId: number, date: string): Promise<number | null> {
  const [session, agent] = await Promise.all([
    getSession(agentId, date),
    getAgentById(agentId),
  ]);
  if (!session || !agent) return null;
  const txns = await getTransactionsForAgent(agent.upiIds, date);
  const totalPaid = txns.reduce((s, t) => s + Number(t.amount), 0);
  return Number(session.openingBalance) - totalPaid;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string; id?: string } | undefined;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (user?.role === "agent") {
      const agentId = parseInt(user.id || "0");
      const cashSession = await getSession(agentId, date);

      let suggestedCarryOver: number | null = null;
      if (!cashSession) {
        suggestedCarryOver = await computeClosingBalance(agentId, addDays(date, -1));
      }
      return NextResponse.json({ session: cashSession, suggestedCarryOver });
    }

    if (user?.role === "admin") {
      const agentIdParam = searchParams.get("agentId");
      if (agentIdParam) {
        const agentId = parseInt(agentIdParam);
        const cashSession = await getSession(agentId, date);
        return NextResponse.json(cashSession ? [cashSession] : []);
      }
      const sessions = await getSessionsForDate(date);
      return NextResponse.json(sessions);
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string; id?: string } | undefined;
    if (!session || user?.role !== "agent") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { carryOver = 0, cashAdded = 0, date } = await req.json();
    const openingBalance = Number(carryOver) + Number(cashAdded);
    if (openingBalance < 0) {
      return NextResponse.json({ error: "Opening balance cannot be negative" }, { status: 400 });
    }
    const agentId = parseInt(user.id || "0");
    const sessionDate = date || new Date().toISOString().split("T")[0];
    const cashSession = await upsertSession({ agentId, sessionDate, carryOver: Number(carryOver), cashAdded: Number(cashAdded), openingBalance });
    return NextResponse.json(cashSession, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
