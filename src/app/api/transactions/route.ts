import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAgentById, getAgents } from "@/lib/sheets";
import { getTransactionsForAgent, getAllAgentTransactionsByDate, getAllTransactions } from "@/lib/queries";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string; id?: string } | undefined;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const date = dateParam && dateParam !== "all" ? dateParam : undefined;

    if (user?.role === "agent") {
      const agentId = parseInt(user.id || "0");
      const agent = await getAgentById(agentId);
      if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      const txns = await getTransactionsForAgent(agent.upiIds, date);
      return NextResponse.json(txns);
    }

    if (user?.role === "admin") {
      if (searchParams.get("scope") === "all") {
        const txns = await getAllTransactions(date);
        return NextResponse.json(txns);
      }
      const agentIdParam = searchParams.get("agentId");
      if (agentIdParam) {
        const agent = await getAgentById(parseInt(agentIdParam));
        if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        const txns = await getTransactionsForAgent(agent.upiIds, date);
        return NextResponse.json(txns);
      }
      const agents = await getAgents();
      const activeAgents = agents.filter((a) => a.isActive);
      const allTxns = await getAllAgentTransactionsByDate(
        activeAgents.map((a) => ({ id: a.id, upiIds: a.upiIds })),
        date
      );
      return NextResponse.json(allTxns);
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}
