import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateAgent } from "@/lib/sheets";
import bcrypt from "bcryptjs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!session || user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const body = await req.json();
    const data: Parameters<typeof updateAgent>[1] = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.upiIds !== undefined) data.upiIds = body.upiIds;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.pin !== undefined) data.pinHash = await bcrypt.hash(String(body.pin), 10);
    const agent = await updateAgent(id, data);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json(agent);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
