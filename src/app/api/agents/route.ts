import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAgents, createAgent } from "@/lib/sheets";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!session || user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const agents = await getAgents();
    return NextResponse.json(agents);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!session || user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { name, upiIds, pin } = await req.json();
    if (!name || !pin || !upiIds?.length) {
      return NextResponse.json({ error: "name, pin, and at least one upiId are required" }, { status: 400 });
    }
    const pinHash = await bcrypt.hash(String(pin), 10);
    const agent = await createAgent({ name, upiIds, pinHash });
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
