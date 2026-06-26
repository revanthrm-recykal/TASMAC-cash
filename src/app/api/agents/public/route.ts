import { NextResponse } from "next/server";
import { getAgents } from "@/lib/sheets";

export async function GET() {
  try {
    const agents = await getAgents();
    const active = agents
      .filter((a) => a.isActive)
      .map((a) => ({ id: a.id, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(active);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
