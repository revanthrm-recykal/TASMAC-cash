import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAgentById, getSessions } from "@/lib/sheets";
import { getPaidByDateForAgent } from "@/lib/queries";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string; id?: string } | undefined;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const agentIdParam = searchParams.get("agentId");

    let agentId: number;
    if (user?.role === "agent") {
      agentId = parseInt(user.id || "0");
    } else if (user?.role === "admin" && agentIdParam) {
      agentId = parseInt(agentIdParam);
    } else {
      return NextResponse.json({ error: "agentId required for admin" }, { status: 400 });
    }

    const [sessions, agent] = await Promise.all([
      getSessions({ agentId }),
      getAgentById(agentId),
    ]);

    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const paidByDate = await getPaidByDateForAgent(agent.upiIds);

    const rows = sessions
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
      .map((s) => {
        const dateStr = s.sessionDate.slice(0, 10);
        const stats = paidByDate[dateStr] ?? { totalPaid: 0, txnCount: 0, failedCount: 0, failedAmount: 0, initiatedCount: 0, initiatedAmount: 0 };
        return {
          date: dateStr,
          carryOver: Number(s.carryOver),
          cashAdded: Number(s.cashAdded),
          openingBalance: Number(s.openingBalance),
          totalPaid: stats.totalPaid,
          txnCount: stats.txnCount,
          failedCount: stats.failedCount,
          failedAmount: stats.failedAmount,
          initiatedCount: stats.initiatedCount,
          initiatedAmount: stats.initiatedAmount,
          closingBalance: Number(s.openingBalance) - stats.totalPaid,
        };
      });

    return NextResponse.json({ agentName: agent.name, rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
