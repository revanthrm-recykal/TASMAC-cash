"use client";
import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"agent" | "admin">("agent");
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);
  const [agentId, setAgentId] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session?.user) {
      const role = (session.user as { role?: string }).role;
      router.replace(role === "admin" ? "/admin" : "/dashboard");
    }
  }, [session, router]);

  useEffect(() => {
    if (mode === "agent") {
      fetch("/api/agents/public")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setAgents(data); })
        .catch(() => {});
    }
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result =
        mode === "agent"
          ? await signIn("agent-pin", { agentId, pin, redirect: false })
          : await signIn("admin-password", { password, redirect: false });
      if (result?.error) setError("Invalid credentials. Please try again.");
      else {
        router.replace(mode === "admin" ? "/admin" : "/dashboard");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🍾</div>
          <h1 className="text-2xl font-bold text-gray-900">TASMAC Cash</h1>
          <p className="text-gray-500 text-sm mt-1">Bottle Buyback Tracker</p>
        </div>

        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button
            onClick={() => { setMode("agent"); setError(""); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "agent" ? "bg-white shadow text-gray-900" : "text-gray-500"
            }`}
          >
            Agent
          </button>
          <button
            onClick={() => { setMode("admin"); setError(""); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "admin" ? "bg-white shadow text-gray-900" : "text-gray-500"
            }`}
          >
            Admin
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "agent" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select your name</label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select agent --</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                  placeholder="Enter your PIN"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter admin password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {error && (
            <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
