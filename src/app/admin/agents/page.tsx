"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import UpiMultiSelect from "@/components/UpiMultiSelect";

interface Agent {
  id: number;
  name: string;
  upiIds: string[];
  isActive: boolean;
}

export default function AgentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { role?: string } | undefined;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [availableVpas, setAvailableVpas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const [name, setName] = useState("");
  const [selectedUpiIds, setSelectedUpiIds] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && user?.role !== "admin") router.replace("/dashboard");
  }, [status, user, router]);

  async function fetchAll() {
    const [agentsRes, vpasRes] = await Promise.all([
      fetch("/api/agents"),
      fetch("/api/upi-ids"),
    ]);
    setAgents(await agentsRes.json());
    setAvailableVpas(await vpasRes.json());
    setLoading(false);
  }

  useEffect(() => {
    if (status === "authenticated") fetchAll();
  }, [status]);

  function openAdd() {
    setEditingAgent(null);
    setName("");
    setSelectedUpiIds([]);
    setPin("");
    setError("");
    setShowForm(true);
  }

  function openEdit(agent: Agent) {
    setEditingAgent(agent);
    setName(agent.name);
    setSelectedUpiIds(agent.upiIds || []);
    setPin("");
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!selectedUpiIds.length) { setError("Select at least one UPI ID"); return; }
    if (!editingAgent && !pin) { setError("PIN is required for new agents"); return; }

    setSaving(true);
    setError("");
    const body: Record<string, unknown> = { name: name.trim(), upiIds: selectedUpiIds };
    if (pin) body.pin = pin;

    const url = editingAgent ? `/api/agents/${editingAgent.id}` : "/api/agents";
    const method = editingAgent ? "PATCH" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json();
      setError(err.error || "Something went wrong");
    } else {
      setShowForm(false);
      fetchAll();
    }
    setSaving(false);
  }

  async function toggleActive(agent: Agent) {
    await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !agent.isActive }),
    });
    fetchAll();
  }

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }

  // UPI IDs already claimed by other agents (for highlighting)
  const claimedVpas = new Map<string, string>();
  agents.forEach((a) => {
    (a.upiIds || []).forEach((vpa) => {
      if (!editingAgent || a.id !== editingAgent.id) {
        claimedVpas.set(vpa, a.name);
      }
    });
  });

  return (
    <div className="min-h-screen">
      <div className="bg-gray-900 text-white px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← Admin</Link>
          <h1 className="text-lg font-bold">Manage Agents</h1>
        </div>
        <button
          onClick={openAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Add Agent
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {agents.map((agent) => (
                <div key={agent.id} className="px-6 py-4 flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{agent.name}</p>
                      {!agent.isActive && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(agent.upiIds || []).map((upi) => (
                        <span
                          key={upi}
                          className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono"
                        >
                          {upi}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 shrink-0 mt-1">
                    <button
                      onClick={() => openEdit(agent)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(agent)}
                      className={`text-sm font-medium ${
                        agent.isActive
                          ? "text-red-500 hover:text-red-700"
                          : "text-green-600 hover:text-green-800"
                      }`}
                    >
                      {agent.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
              {agents.length === 0 && (
                <div className="px-6 py-12 text-center text-gray-400">
                  No agents yet. Add one to get started.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {editingAgent ? `Edit ${editingAgent.name}` : "Add New Agent"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Agent name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  UPI IDs
                  <span className="text-gray-400 font-normal ml-1">
                    — from transaction history
                  </span>
                </label>
                {availableVpas.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">
                    No VPAs found in transaction history yet.
                  </p>
                ) : (
                  <UpiMultiSelect
                    options={availableVpas}
                    selected={selectedUpiIds}
                    onChange={setSelectedUpiIds}
                    claimedBy={claimedVpas}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN
                  {editingAgent && (
                    <span className="text-gray-400 font-normal ml-1">(leave blank to keep current)</span>
                  )}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="4–6 digit PIN"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : editingAgent ? "Save Changes" : "Add Agent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
