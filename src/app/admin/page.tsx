"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Agent {
  id: number;
  name: string;
  upiIds: string[];
  isActive: boolean;
}

interface CashSession {
  id: number;
  agentId: number;
  openingBalance: number;
  carryOver: number;
  cashAdded: number;
  agent: { name: string };
}

interface Transaction {
  id: string;
  upi: string;
  consumer_mobile: string;
  status: string;
  created_date: string;
  amount: number;
}

interface FlatTransaction extends Transaction {
  agentName: string;
}

interface HistoryRow {
  date: string;
  carryOver: number;
  cashAdded: number;
  openingBalance: number;
  totalPaid: number;
  txnCount: number;
  failedCount: number;
  failedAmount: number;
  initiatedCount: number;
  initiatedAmount: number;
  closingBalance: number;
}

function formatCurrency(n: number) {
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const IST = { timeZone: "Asia/Kolkata" } as const;

function toUtcDate(d: string): Date {
  return new Date(typeof d === "string" && !d.endsWith("Z") ? d.replace(" ", "T") + "Z" : d);
}

function formatDate(d: string) {
  return toUtcDate(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short", ...IST });
}

function formatDateTime(d: string) {
  const dt = toUtcDate(d);
  return (
    dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...IST }) +
    " " +
    dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", ...IST })
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "SUCCESS"   ? "bg-green-100 text-green-700"  :
    status === "FAILED"    ? "bg-red-100 text-red-700"      :
    status === "INITIATED" ? "bg-amber-100 text-amber-700"  :
                             "bg-gray-100 text-gray-600";
  const label = status === "SUCCESS" ? "OK" : status;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { role?: string } | undefined;
  const today = new Date().toISOString().split("T")[0];

  const [selectedDate, setSelectedDate] = useState(today);
  const [allTime, setAllTime] = useState(false);
  const [activeTab, setActiveTab] = useState<"agents" | "transactions">("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [allTxns, setAllTxns] = useState<Record<number, Transaction[]>>({});
  const [allDbTxns, setAllDbTxns] = useState<Transaction[]>([]);
  const [txnFilter, setTxnFilter] = useState<"ALL" | "FAILED" | "INITIATED" | "SUCCESS">("ALL");
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [historyAgent, setHistoryAgent] = useState<Agent | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // UPI → agent name lookup (built from all agents, not just active)
  const upiToAgent = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach((a) => (a.upiIds || []).forEach((u) => m.set(u, a.name)));
    return m;
  }, [agents]);

  // Per-agent flat view (Agent Summary tab totals)
  const flatTxns: FlatTransaction[] = useMemo(() => {
    return agents
      .flatMap((agent) =>
        (allTxns[agent.id] || []).map((t) => ({ ...t, agentName: agent.name }))
      )
      .sort((a, b) => toUtcDate(b.created_date).getTime() - toUtcDate(a.created_date).getTime());
  }, [agents, allTxns]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && user?.role !== "admin") router.replace("/dashboard");
  }, [status, user, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dateParam = allTime ? "all" : selectedDate;
      const [agentsRes, sessionsRes, txnsRes, allDbRes] = await Promise.all([
        fetch("/api/agents"),
        allTime ? Promise.resolve({ json: async () => [] }) : fetch(`/api/sessions?date=${selectedDate}`),
        fetch(`/api/transactions?date=${dateParam}`),
        fetch(`/api/transactions?date=${dateParam}&scope=all`),
      ]);
      const safeJson = async (r: { json: () => Promise<unknown> }) => {
        try { return await r.json(); } catch { return null; }
      };
      const [agentsData, sessionsData, txnsData, dbData] = await Promise.all([
        safeJson(agentsRes), safeJson(sessionsRes), safeJson(txnsRes), safeJson(allDbRes),
      ]);
      setAgents(Array.isArray(agentsData) ? agentsData : []);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      const isValidTxnMap = txnsData && typeof txnsData === "object" && !Array.isArray(txnsData) && !("error" in txnsData);
      setAllTxns(isValidTxnMap ? txnsData as Record<number, Transaction[]> : {});
      setAllDbTxns(Array.isArray(dbData) ? dbData : []);
    } catch (e) {
      console.error("fetchData failed:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, allTime]);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status, fetchData]);

  async function openHistory(agent: Agent) {
    setHistoryAgent(agent);
    setHistoryRows([]);
    setLoadingHistory(true);
    const r = await fetch(`/api/history?agentId=${agent.id}`);
    const data = await r.json();
    setHistoryRows(data.rows || []);
    setLoadingHistory(false);
  }

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  const activeAgents = agents.filter((a) => a.isActive);

  function getSessionForAgent(agentId: number) {
    return sessions.find((s) => s.agentId === agentId);
  }

  function getTxnsForAgent(agentId: number): Transaction[] {
    return allTxns[agentId] || [];
  }

  function getStats(txns: Transaction[], s: CashSession | undefined) {
    const totalPaid = txns.reduce((acc, t) => acc + Number(t.amount), 0);
    const failedTxns = txns.filter((t) => t.status === "FAILED");
    const initiatedTxns = txns.filter((t) => t.status === "INITIATED");
    return {
      totalPaid,
      failedCount: failedTxns.length,
      failedAmount: failedTxns.reduce((acc, t) => acc + Number(t.amount), 0),
      initiatedCount: initiatedTxns.length,
      initiatedAmount: initiatedTxns.reduce((acc, t) => acc + Number(t.amount), 0),
      closing: s ? Number(s.openingBalance) - totalPaid : null,
    };
  }

  // Agent Summary tab totals (only tracked agent UPI IDs)
  const allAgentTxns = Object.values(allTxns).flat();
  const grandTotalPaid = allAgentTxns.reduce((s, t) => s + Number(t.amount), 0);
  const grandTotalTxns = allAgentTxns.length;
  const grandFailedTxns = allAgentTxns.filter((t) => t.status === "FAILED");
  const grandFailed = grandFailedTxns.length;
  const grandFailedAmount = grandFailedTxns.reduce((s, t) => s + Number(t.amount), 0);
  const grandInitiatedTxns = allAgentTxns.filter((t) => t.status === "INITIATED");
  const grandInitiated = grandInitiatedTxns.length;
  const grandInitiatedAmount = grandInitiatedTxns.reduce((s, t) => s + Number(t.amount), 0);

  const grandCarryOver = sessions.reduce((s, sess) => s + Number(sess.carryOver), 0);
  const grandCashAdded = sessions.reduce((s, sess) => s + Number(sess.cashAdded), 0);
  const grandOpening = sessions.reduce((s, sess) => s + Number(sess.openingBalance), 0);
  const grandClosing = grandOpening - grandTotalPaid;

  // All Transactions tab totals (entire payment DB)
  const dbTotalPaid = allDbTxns.reduce((s, t) => s + Number(t.amount), 0);
  const dbTotalTxns = allDbTxns.length;
  const dbFailedTxns = allDbTxns.filter((t) => t.status === "FAILED");
  const dbFailed = dbFailedTxns.length;
  const dbFailedAmount = dbFailedTxns.reduce((s, t) => s + Number(t.amount), 0);
  const dbInitiatedTxns = allDbTxns.filter((t) => t.status === "INITIATED");
  const dbInitiated = dbInitiatedTxns.length;
  const dbInitiatedAmount = dbInitiatedTxns.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-base font-bold tracking-tight">TASMAC Cash</h1>
            <p className="text-gray-400 text-xs mt-0.5">Admin · Bottle Buyback Tracker</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/agents" className="text-xs text-gray-300 hover:text-white font-medium">
              Manage Agents
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-4 pb-8 max-w-6xl mx-auto space-y-4">

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("agents")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "agents" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Agent Summary
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "transactions" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            All Transactions
            {!loading && dbTotalTxns > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{dbTotalTxns}</span>
            )}
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg bg-white border border-gray-200 p-0.5">
            <button
              onClick={() => setAllTime(false)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${!allTime ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              By date
            </button>
            <button
              onClick={() => setAllTime(true)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${allTime ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              All time
            </button>
          </div>
          {!allTime && (
            <>
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {selectedDate !== today && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  ← Today
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Grand summary — same card layout in both by-date and all-time ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          {/* Cash row — always shown; all-time shows "—" for fields requiring sessions */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Cash carry-over</p>
              <p className="text-sm font-semibold text-gray-700">
                {allTime ? "—" : formatCurrency(grandCarryOver)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Cash received</p>
              <p className="text-sm font-semibold text-blue-600">
                {allTime ? "—" : formatCurrency(grandCashAdded)}
              </p>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs text-gray-400 mb-1">Cash opening</p>
              <p className="text-sm font-semibold text-gray-800">
                {allTime ? "—" : formatCurrency(grandOpening)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">UPI paid out</p>
              <p className="text-sm font-semibold text-red-600">{formatCurrency(grandTotalPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Cash closing</p>
              <p className={`text-sm font-bold ${allTime ? "text-gray-400" : grandClosing < 0 ? "text-red-600" : "text-green-600"}`}>
                {allTime ? "—" : formatCurrency(grandClosing)}
              </p>
            </div>
          </div>

          {/* UPI breakdown — always shown */}
          <div className="pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400 mb-0.5">UPI txns</p>
              <p className="text-xl font-bold text-gray-900">{grandTotalTxns}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xs text-green-500 mb-0.5">Success</p>
              <p className="text-xl font-bold text-green-600">{grandTotalTxns - grandFailed - grandInitiated}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-xs text-red-400 mb-0.5">Failed</p>
              <p className="text-xl font-bold text-red-600">{grandFailed || "—"}</p>
              {grandFailedAmount > 0 && <p className="text-xs text-red-400 mt-0.5">{formatCurrency(grandFailedAmount)}</p>}
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-xs text-amber-500 mb-0.5">Initiated</p>
              <p className="text-xl font-bold text-amber-600">{grandInitiated || "—"}</p>
              {grandInitiatedAmount > 0 && <p className="text-xs text-amber-500 mt-0.5">{formatCurrency(grandInitiatedAmount)}</p>}
            </div>
          </div>

          {!allTime && sessions.length > 0 && (
            <p className="mt-2 text-xs text-gray-400 text-right">{sessions.length} of {activeAgents.length} agents active</p>
          )}
        </div>

        {/* Agent Summary tab */}
        {activeTab === "agents" && <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-sm">
              Agent Summary
            </h2>
            <span className="text-xs text-gray-400">
              {allTime ? "All time" : formatDate(selectedDate)}
            </span>
          </div>

          {loading ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : activeAgents.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">No active agents</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {activeAgents.map((agent) => {
                const agentSession = getSessionForAgent(agent.id);
                const txns = getTxnsForAgent(agent.id);
                const stats = getStats(txns, agentSession);
                const isExpanded = expandedAgent === agent.id;
                const noSession = !allTime && !agentSession;

                return (
                  <div key={agent.id}>
                    <div className={`px-4 sm:px-6 py-4 ${noSession ? "opacity-60" : ""}`}>
                      {/* Name row */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                            className="text-gray-300 hover:text-gray-600 text-xs shrink-0 w-4 transition-colors"
                            title={isExpanded ? "Collapse" : "Expand transactions"}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                          <p className="font-medium text-gray-900">{agent.name}</p>
                          {noSession && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">no session</span>
                          )}
                          {stats.failedCount > 0 && (
                            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                              {stats.failedCount} failed · {formatCurrency(stats.failedAmount)}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => openHistory(agent)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                        >
                          History
                        </button>
                      </div>

                      {/* Stats — same layout in both modes */}
                      <div className="pl-6 space-y-2">
                        {/* Cash row */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1">
                          <div>
                            <p className="text-xs text-gray-400">Cash carry-over</p>
                            <p className="text-sm font-medium text-gray-600 mt-0.5">
                              {agentSession ? formatCurrency(agentSession.carryOver) : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Cash received</p>
                            <p className="text-sm font-medium text-blue-600 mt-0.5">
                              {agentSession ? formatCurrency(agentSession.cashAdded) : "—"}
                            </p>
                          </div>
                          <div className="hidden sm:block">
                            <p className="text-xs text-gray-400">Cash opening</p>
                            <p className="text-sm font-medium text-gray-800 mt-0.5">
                              {agentSession ? formatCurrency(agentSession.openingBalance) : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">UPI paid out</p>
                            <p className="text-sm font-medium text-red-600 mt-0.5">{formatCurrency(stats.totalPaid)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Cash closing</p>
                            <p className={`text-sm font-bold mt-0.5 ${stats.closing !== null && stats.closing < 0 ? "text-red-600" : stats.closing !== null ? "text-green-600" : "text-gray-400"}`}>
                              {stats.closing !== null ? formatCurrency(stats.closing) : "—"}
                            </p>
                          </div>
                        </div>
                        {/* UPI breakdown row */}
                        <div className="grid grid-cols-4 gap-x-4 pt-1 border-t border-gray-50">
                          <div>
                            <p className="text-xs text-gray-400">UPI txns</p>
                            <p className="text-sm font-semibold text-gray-700 mt-0.5">{txns.length}</p>
                          </div>
                          <div>
                            <p className="text-xs text-green-500">Success</p>
                            <p className="text-sm font-semibold text-green-600 mt-0.5">{txns.length - stats.failedCount - stats.initiatedCount}</p>
                          </div>
                          <div>
                            <p className="text-xs text-red-400">Failed</p>
                            <p className="text-sm font-semibold text-red-500 mt-0.5">{stats.failedCount || "—"}</p>
                            {stats.failedAmount > 0 && <p className="text-xs text-red-400">{formatCurrency(stats.failedAmount)}</p>}
                          </div>
                          <div>
                            <p className="text-xs text-amber-500">Initiated</p>
                            <p className="text-sm font-semibold text-amber-600 mt-0.5">{stats.initiatedCount || "—"}</p>
                            {stats.initiatedAmount > 0 && <p className="text-xs text-amber-500">{formatCurrency(stats.initiatedAmount)}</p>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded transactions */}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        {txns.length === 0 ? (
                          <p className="text-sm text-gray-400 px-6 py-4">No transactions</p>
                        ) : (
                          <div className="overflow-x-auto overflow-y-auto max-h-[280px]">
                            <table className="w-full text-sm min-w-[400px]">
                              <thead className="sticky top-0 bg-gray-50 z-10">
                                <tr className="text-xs text-gray-500 border-b border-gray-200">
                                  {allTime && <th className="text-left px-4 sm:px-6 py-2 font-medium">Date / Time</th>}
                                  <th className="text-left px-4 sm:px-6 py-2 font-medium">Mobile / ID</th>
                                  <th className="text-left py-2 font-medium hidden sm:table-cell">UPI</th>
                                  <th className="text-left py-2 font-medium">Status</th>
                                  {!allTime && <th className="text-left py-2 font-medium">Time</th>}
                                  <th className="text-right px-4 sm:px-6 py-2 font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {txns.map((t) => (
                                  <tr key={t.id} className={t.status === "FAILED" ? "bg-red-50" : t.status === "INITIATED" ? "bg-amber-50" : "hover:bg-gray-50"}>
                                    {allTime && (
                                      <td className="px-4 sm:px-6 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                                        {formatDateTime(t.created_date)}
                                      </td>
                                    )}
                                    <td className="px-4 sm:px-6 py-2.5 text-gray-700 text-xs">
                                      {t.consumer_mobile || t.id}
                                    </td>
                                    <td className="py-2.5 text-gray-400 text-xs font-mono hidden sm:table-cell">{t.upi}</td>
                                    <td className="py-2.5"><StatusBadge status={t.status} /></td>
                                    {!allTime && (
                                      <td className="py-2.5 text-gray-400 text-xs whitespace-nowrap">
                                        {toUtcDate(t.created_date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", ...IST })}
                                      </td>
                                    )}
                                    <td className="px-4 sm:px-6 py-2.5 text-right font-medium text-gray-900">
                                      {formatCurrency(t.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>}

        {/* All Transactions tab */}
        {activeTab === "transactions" && <>
          {/* Insight cards */}
          {!loading && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">UPI paid out (Overall)</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(dbTotalPaid)}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">UPI txns</p>
                  <p className="text-xl font-bold text-gray-900">{dbTotalTxns}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-500 mb-0.5">Success</p>
                  <p className="text-xl font-bold text-green-600">{dbTotalTxns - dbFailed - dbInitiated}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-red-400 mb-0.5">Failed</p>
                  <p className="text-xl font-bold text-red-600">{dbFailed || "—"}</p>
                  {dbFailedAmount > 0 && <p className="text-xs text-red-400 mt-0.5">{formatCurrency(dbFailedAmount)}</p>}
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-amber-500 mb-0.5">Initiated</p>
                  <p className="text-xl font-bold text-amber-600">{dbInitiated || "—"}</p>
                  {dbInitiatedAmount > 0 && <p className="text-xs text-amber-500 mt-0.5">{formatCurrency(dbInitiatedAmount)}</p>}
                </div>
              </div>
            </div>
          )}

          {(() => {
            const filteredTxns = txnFilter === "ALL" ? allDbTxns : allDbTxns.filter(t => t.status === txnFilter);
            const filteredAmount = filteredTxns.reduce((s, t) => s + Number(t.amount), 0);
            return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Filter bar */}
            <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
              {(["ALL", "FAILED", "INITIATED", "SUCCESS"] as const).map((f) => {
                const count = f === "ALL" ? allDbTxns.length : allDbTxns.filter(t => t.status === f).length;
                const active = txnFilter === f;
                const color =
                  f === "FAILED"   ? active ? "bg-red-600 text-white border-red-600"   : "border-red-200 text-red-500 hover:bg-red-50"   :
                  f === "INITIATED"? active ? "bg-amber-500 text-white border-amber-500": "border-amber-200 text-amber-600 hover:bg-amber-50" :
                  f === "SUCCESS"  ? active ? "bg-green-600 text-white border-green-600": "border-green-200 text-green-600 hover:bg-green-50" :
                                     active ? "bg-gray-800 text-white border-gray-800"  : "border-gray-200 text-gray-500 hover:bg-gray-50";
                return (
                  <button
                    key={f}
                    onClick={() => setTxnFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${color}`}
                  >
                    {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()} · {count}
                  </button>
                );
              })}
              {txnFilter !== "ALL" && filteredAmount > 0 && (
                <span className="ml-auto text-xs font-semibold text-gray-700">{formatCurrency(filteredAmount)}</span>
              )}
            </div>

            <div className="px-4 sm:px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-800 text-sm">
                  {txnFilter === "ALL" ? "All Transactions" : txnFilter.charAt(0) + txnFilter.slice(1).toLowerCase() + " Transactions"}
                </h2>
                {!loading && (
                  <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                    {filteredTxns.length}
                  </span>
                )}
              </div>
              {!loading && filteredAmount > 0 && (
                <span className="text-sm font-bold text-gray-700">{formatCurrency(filteredAmount)}</span>
              )}
            </div>

            {loading ? (
              <div className="px-6 py-10 text-center text-gray-400 text-sm">Loading…</div>
            ) : filteredTxns.length === 0 ? (
              <div className="px-6 py-10 text-center text-gray-400 text-sm">
                {txnFilter === "ALL" ? "No transactions for this period" : `No ${txnFilter.toLowerCase()} transactions`}
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-left px-4 sm:px-6 py-3 font-medium">Date / Time</th>
                      <th className="text-left py-3 font-medium">Agent / UPI</th>
                      <th className="text-left py-3 font-medium hidden sm:table-cell">Mobile / ID</th>
                      <th className="text-left py-3 font-medium">Status</th>
                      <th className="text-right px-4 sm:px-6 py-3 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTxns.map((t) => {
                      const agentName = upiToAgent.get(t.upi);
                      return (
                        <tr key={t.id} className={t.status === "FAILED" ? "bg-red-50" : t.status === "INITIATED" ? "bg-amber-50" : "hover:bg-gray-50"}>
                          <td className="px-4 sm:px-6 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                            {formatDateTime(t.created_date)}
                          </td>
                          <td className="py-2.5">
                            {agentName
                              ? <span className="font-medium text-gray-800 text-xs">{agentName}</span>
                              : <span className="text-gray-400 text-xs font-mono">{t.upi}</span>
                            }
                          </td>
                          <td className="py-2.5 text-gray-500 text-xs hidden sm:table-cell">
                            {t.consumer_mobile || t.id}
                          </td>
                          <td className="py-2.5"><StatusBadge status={t.status} /></td>
                          <td className="px-4 sm:px-6 py-2.5 text-right font-medium text-gray-900">
                            {formatCurrency(t.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
          })()}
        </>}

      </div>

      {/* History modal */}
      {historyAgent && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setHistoryAgent(null); }}
        >
          <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">{historyAgent.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Day-wise balance history</p>
              </div>
              <button
                onClick={() => setHistoryAgent(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                ×
              </button>
            </div>

            <div className="overflow-auto flex-1">
              {loadingHistory ? (
                <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
              ) : historyRows.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">No history yet</div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="divide-y divide-gray-100 sm:hidden">
                    {historyRows.map((row) => (
                      <div key={row.date} className="px-5 py-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-semibold text-gray-800">{formatDate(row.date)}</span>
                          <span className={`text-base font-bold ${row.closingBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                            {formatCurrency(row.closingBalance)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-gray-400">Cash carry-over</p>
                            <p className="text-gray-700 font-medium mt-0.5">{formatCurrency(row.carryOver)}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Cash received</p>
                            <p className="text-blue-600 font-medium mt-0.5">{formatCurrency(row.cashAdded)}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">UPI paid out</p>
                            <p className="text-red-500 font-medium mt-0.5">{formatCurrency(row.totalPaid)}</p>
                          </div>
                        </div>
                        {(row.failedCount > 0 || row.initiatedCount > 0) && (
                          <p className="mt-2 text-xs">
                            {row.txnCount} UPI txns
                            {row.failedCount > 0 && <span className="text-red-500"> · {row.failedCount} failed ({formatCurrency(row.failedAmount)})</span>}
                            {row.initiatedCount > 0 && <span className="text-amber-500"> · {row.initiatedCount} initiated</span>}
                          </p>
                        )}
                      </div>
                    ))}
                    <div className="px-5 py-4 bg-gray-50 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">{historyRows.length} days</span>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600">
                          {formatCurrency(historyRows.reduce((s, r) => s + r.totalPaid, 0))} UPI paid
                        </p>
                        <p className="text-xs text-blue-600 mt-0.5">
                          {formatCurrency(historyRows.reduce((s, r) => s + r.cashAdded, 0))} cash received
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Desktop table */}
                  <table className="hidden sm:table w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 z-10">
                      <tr className="text-xs text-gray-500 border-b border-gray-200">
                        <th className="text-left px-6 py-3 font-medium">Date</th>
                        <th className="text-right px-3 py-3 font-medium">Cash carry-over</th>
                        <th className="text-right px-3 py-3 font-medium">Cash received</th>
                        <th className="text-right px-3 py-3 font-medium">Cash opening</th>
                        <th className="text-right px-3 py-3 font-medium">UPI paid out</th>
                        <th className="text-right px-3 py-3 font-medium">UPI txns</th>
                        <th className="text-right px-6 py-3 font-medium">Cash closing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {historyRows.map((row) => (
                        <tr key={row.date} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 font-medium text-gray-800 whitespace-nowrap">{formatDate(row.date)}</td>
                          <td className="px-3 py-3 text-right text-gray-500">{formatCurrency(row.carryOver)}</td>
                          <td className="px-3 py-3 text-right text-blue-600 font-medium">{formatCurrency(row.cashAdded)}</td>
                          <td className="px-3 py-3 text-right text-gray-700">{formatCurrency(row.openingBalance)}</td>
                          <td className="px-3 py-3 text-right text-red-600">{formatCurrency(row.totalPaid)}</td>
                          <td className="px-3 py-3 text-right text-gray-500">
                            {row.txnCount}
                            {row.failedCount > 0 && (
                              <span className="ml-1 text-xs text-red-400 block">{row.failedCount}✗ {formatCurrency(row.failedAmount)}</span>
                            )}
                            {row.initiatedCount > 0 && (
                              <span className="ml-1 text-xs text-amber-500 block">{row.initiatedCount} initiated</span>
                            )}
                          </td>
                          <td className={`px-6 py-3 text-right font-bold ${row.closingBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                            {formatCurrency(row.closingBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold">
                      <tr>
                        <td className="px-6 py-3 text-gray-700">Total</td>
                        <td className="px-3 py-3 text-right text-gray-400">—</td>
                        <td className="px-3 py-3 text-right text-blue-700">
                          {formatCurrency(historyRows.reduce((s, r) => s + r.cashAdded, 0))}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-400">—</td>
                        <td className="px-3 py-3 text-right text-red-700">
                          {formatCurrency(historyRows.reduce((s, r) => s + r.totalPaid, 0))}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-600">
                          {historyRows.reduce((s, r) => s + r.txnCount, 0)} UPI txns
                        </td>
                        <td className="px-6 py-3 text-right text-gray-400">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
