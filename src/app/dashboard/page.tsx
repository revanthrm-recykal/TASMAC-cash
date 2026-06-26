"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Transaction {
  id: string;
  upi: string;
  consumer_mobile: string;
  status: string;
  created_date: string;
  amount: number;
}

interface CashSession {
  id: number;
  carryOver: number;
  cashAdded: number;
  openingBalance: number;
}

interface SessionData {
  session: CashSession | null;
  suggestedCarryOver: number | null;
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

function formatTime(dt: string) {
  return toUtcDate(dt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", ...IST });
}

function formatDateTime(dt: string) {
  const d = toUtcDate(dt);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...IST }) + " " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", ...IST });
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const today = new Date().toISOString().split("T")[0];
  const [allTime, setAllTime] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [suggestedCarryOver, setSuggestedCarryOver] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [carryOverInput, setCarryOverInput] = useState("");
  const [cashAddedInput, setCashAddedInput] = useState("");
  const [editingOpening, setEditingOpening] = useState(false);
  const [saving, setSaving] = useState(false);

  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingTxns, setLoadingTxns] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && user?.role !== "agent") router.replace("/admin");
  }, [status, user, router]);

  const fetchSession = useCallback(async () => {
    setLoadingSession(true);
    const r = await fetch(`/api/sessions?date=${selectedDate}`);
    const data: SessionData = await r.json();
    setCashSession(data.session);
    setSuggestedCarryOver(data.suggestedCarryOver);
    if (!data.session) {
      setCarryOverInput(data.suggestedCarryOver !== null ? String(data.suggestedCarryOver) : "0");
      setCashAddedInput("");
    }
    setEditingOpening(false);
    setLoadingSession(false);
  }, [selectedDate]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTxns(true);
    const dateParam = allTime ? "all" : selectedDate;
    const r = await fetch(`/api/transactions?date=${dateParam}`);
    const data = await r.json().catch(() => []);
    setTransactions(Array.isArray(data) ? data : []);
    setLoadingTxns(false);
  }, [selectedDate, allTime]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const r = await fetch("/api/history");
    const data = await r.json().catch(() => ({}));
    setHistory(Array.isArray(data.rows) ? data.rows : []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      if (!allTime) fetchSession();
      fetchTransactions();
      fetchHistory();
    }
  }, [status, allTime, fetchSession, fetchTransactions, fetchHistory]);

  async function saveOpening() {
    const carryOver = parseFloat(carryOverInput) || 0;
    const cashAdded = parseFloat(cashAddedInput) || 0;
    setSaving(true);
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carryOver, cashAdded, date: selectedDate }),
    });
    await fetchSession();
    await fetchHistory();
    setSaving(false);
  }

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }

  const totalPaid = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const failedTxns = transactions.filter((t) => t.status === "FAILED");
  const initiatedTxns = transactions.filter((t) => t.status === "INITIATED");
  const failedAmount = failedTxns.reduce((s, t) => s + Number(t.amount), 0);
  const initiatedAmount = initiatedTxns.reduce((s, t) => s + Number(t.amount), 0);
  const closingBalance = cashSession ? Number(cashSession.openingBalance) - totalPaid : null;
  const isToday = selectedDate === today;

  // All-time summary derived from history (sorted newest-first by API)
  const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const allTimeTotalReceived = sortedHistory.reduce((s, r) => s + Number(r.cashAdded), 0);
  // Use raw transactions for paid/txns/failed (accurate; history only covers days with sessions)
  const allTimeTotalPaid = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const allTimeTotalTxns = transactions.length;
  const allTimeFailedTxns = transactions.filter((t) => t.status === "FAILED");
  const allTimeFailed = allTimeFailedTxns.length;
  const allTimeFailedAmount = allTimeFailedTxns.reduce((s, t) => s + Number(t.amount), 0);
  const allTimeInitiatedTxns = transactions.filter((t) => t.status === "INITIATED");
  const allTimeInitiated = allTimeInitiatedTxns.length;
  const allTimeInitiatedAmount = allTimeInitiatedTxns.reduce((s, t) => s + Number(t.amount), 0);
  const initialCarryOver = sortedHistory.length > 0 ? Number(sortedHistory[sortedHistory.length - 1].carryOver) : 0;
  const currentBalance = sortedHistory.length > 0 ? Number(sortedHistory[0].closingBalance) : null;
  const liveCarryOver = parseFloat(carryOverInput) || 0;
  const liveCashAdded = parseFloat(cashAddedInput) || 0;
  const liveOpening = liveCarryOver + liveCashAdded;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-10 pb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-blue-200 text-xs uppercase tracking-widest mb-0.5">Agent</p>
            <h1 className="text-2xl font-bold leading-tight">{user?.name}</h1>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 border border-blue-400 text-blue-100 hover:bg-blue-500 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors mt-1"
          >
            Sign out
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg bg-blue-700/60 p-0.5">
            <button
              onClick={() => setAllTime(false)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${!allTime ? "bg-white text-blue-700 shadow" : "text-blue-100"}`}
            >
              By date
            </button>
            <button
              onClick={() => setAllTime(true)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${allTime ? "bg-white text-blue-700 shadow" : "text-blue-100"}`}
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
                className="bg-blue-700/60 text-white rounded-xl px-3 py-2 text-sm border border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-white"
              />
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className="text-xs text-blue-200 hover:text-white underline"
                >
                  Today
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="px-4 -mt-2 space-y-3">
        {/* ── Unified summary card — same layout for both today and all-time ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {allTime ? (
            /* ALL-TIME cash rows derived from history */
            loadingHistory ? (
              <div className="text-gray-400 text-sm py-2">Loading…</div>
            ) : sortedHistory.length === 0 ? (
              <p className="text-gray-400 text-sm py-2 text-center">No history yet</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Cash carry-over</p>
                    <p className="text-base font-semibold text-gray-700">{formatCurrency(initialCarryOver)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-blue-400 mb-0.5">Cash received</p>
                    <p className="text-base font-semibold text-blue-700">{formatCurrency(allTimeTotalReceived)}</p>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-3 grid grid-cols-3 gap-2 text-center mb-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Cash opening</p>
                    <p className="text-base font-bold text-gray-800">{formatCurrency(initialCarryOver + allTimeTotalReceived)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">UPI paid out</p>
                    <p className="text-base font-bold text-red-500">{formatCurrency(allTimeTotalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Cash closing</p>
                    <p className={`text-base font-bold ${(currentBalance ?? 0) < 0 ? "text-red-600" : "text-green-600"}`}>
                      {currentBalance !== null ? formatCurrency(currentBalance) : "—"}
                    </p>
                  </div>
                </div>
              </>
            )
          ) : (
            /* BY-DATE cash rows from session */
            loadingSession ? (
              <div className="text-gray-400 text-sm py-2">Loading…</div>
            ) : cashSession && !editingOpening ? (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Cash carry-over</p>
                    <p className="text-base font-semibold text-gray-700">{formatCurrency(cashSession.carryOver)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-blue-400 mb-0.5">Cash received</p>
                    <p className="text-base font-semibold text-blue-700">{formatCurrency(cashSession.cashAdded)}</p>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-3 grid grid-cols-3 gap-2 text-center mb-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Cash opening</p>
                    <p className="text-base font-bold text-gray-800">{formatCurrency(cashSession.openingBalance)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">UPI paid out</p>
                    <p className="text-base font-bold text-red-500">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Cash closing</p>
                    <p className={`text-base font-bold ${closingBalance! < 0 ? "text-red-600" : "text-green-600"}`}>
                      {formatCurrency(closingBalance!)}
                    </p>
                  </div>
                </div>
                {isToday && (
                  <button
                    onClick={() => { setCashAddedInput(String(cashSession.cashAdded)); setEditingOpening(true); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline block mb-3"
                  >
                    Edit opening balance
                  </button>
                )}
              </>
            ) : (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800">
                    {editingOpening ? "Edit opening balance" : isToday ? "Set today's opening balance" : "No session recorded"}
                  </p>
                  {editingOpening && (
                    <button onClick={() => setEditingOpening(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  )}
                </div>
                {(isToday || editingOpening) && (
                  <>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Cash carry-over from previous day</label>
                        <div className="w-full border border-gray-100 bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                          <span className="text-gray-700 text-base font-medium">{formatCurrency(liveCarryOver)}</span>
                          <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">auto</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Cash received today</label>
                        <input
                          type="number" inputMode="decimal" min="0"
                          value={cashAddedInput} onChange={(e) => setCashAddedInput(e.target.value)}
                          placeholder="0"
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
                      <span className="text-sm text-blue-700 font-medium">Total cash opening</span>
                      <span className="text-xl font-bold text-blue-900">{formatCurrency(liveOpening)}</span>
                    </div>
                    <button
                      onClick={saveOpening} disabled={saving}
                      className="mt-3 w-full bg-blue-600 text-white py-3.5 rounded-xl text-base font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 transition-colors"
                    >
                      {saving ? "Saving…" : editingOpening ? "Update" : "Confirm"}
                    </button>
                  </>
                )}
              </div>
            )
          )}

          {/* UPI metrics — same 4 cards in both modes */}
          {!loadingTxns && (
            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5">UPI txns</p>
                <p className="text-xl font-bold text-gray-900">{transactions.length}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-green-500 mb-0.5">Success</p>
                <p className="text-xl font-bold text-green-600">
                  {transactions.filter((t) => t.status === "SUCCESS").length}
                </p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-xs text-red-400 mb-0.5">Failed</p>
                <p className="text-xl font-bold text-red-600">{failedTxns.length || "—"}</p>
                {failedAmount > 0 && <p className="text-xs text-red-400 mt-0.5">{formatCurrency(failedAmount)}</p>}
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-xs text-amber-500 mb-0.5">Initiated</p>
                <p className="text-xl font-bold text-amber-600">{initiatedTxns.length || "—"}</p>
                {initiatedAmount > 0 && <p className="text-xs text-amber-500 mt-0.5">{formatCurrency(initiatedAmount)}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Failed transactions alert — cash paid by agent, needs reimbursement */}
        {!allTime && failedTxns.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-red-500 text-lg leading-none">⚠</span>
              <h3 className="font-semibold text-red-800 text-sm">
                {failedTxns.length} Failed UPI {failedTxns.length === 1 ? "Transaction" : "Transactions"} · {formatCurrency(failedAmount)}
              </h3>
            </div>
            <p className="text-red-700 text-xs mb-3">
              You paid cash for these — claim reimbursement from office.
            </p>
            <div className="space-y-2">
              {failedTxns.map((t) => (
                <div key={t.id} className="bg-white rounded-xl p-3 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 font-medium truncate">{t.consumer_mobile || t.id}</p>
                    <p className="text-xs text-gray-400 font-mono truncate">{t.upi}</p>
                    <p className="text-xs text-gray-400">{allTime ? formatDateTime(t.created_date) : formatTime(t.created_date)}</p>
                  </div>
                  <p className="font-bold text-red-600 shrink-0">{formatCurrency(t.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction list */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">UPI Transactions</h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
              {transactions.length}
            </span>
          </div>
          {loadingTxns ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">No transactions</div>
          ) : (
            <div className="divide-y divide-gray-50 overflow-y-auto max-h-[420px]">
              {transactions.map((t) => (
                <div key={t.id} className="px-5 py-3.5 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 font-medium truncate">{t.consumer_mobile || t.id}</p>
                    <p className="text-xs text-gray-400 font-mono truncate mt-0.5">{t.upi}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.status === "SUCCESS"  ? "bg-green-100 text-green-700"  :
                        t.status === "FAILED"   ? "bg-red-100 text-red-700"     :
                        t.status === "INITIATED"? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {t.status === "SUCCESS" ? "OK" : t.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        {allTime ? formatDateTime(t.created_date) : formatTime(t.created_date)}
                      </span>
                    </div>
                  </div>
                  <p className="font-semibold text-gray-900 shrink-0">{formatCurrency(t.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Balance History */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Balance History</h2>
            {!allTime && <p className="text-xs text-gray-400 mt-0.5">Tap a row to view that date&apos;s transactions</p>}
          </div>

          {loadingHistory ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : history.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">No history yet</div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="divide-y divide-gray-50 sm:hidden">
                {history.map((row) => {
                  const isSelected = !allTime && row.date === selectedDate;
                  return (
                    <button
                      key={row.date}
                      onClick={() => { setAllTime(false); setSelectedDate(row.date); }}
                      className={`w-full text-left px-5 py-4 transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-gray-50 active:bg-gray-100"}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-semibold text-gray-800">
                          {formatDate(row.date)}
                          {isSelected && <span className="ml-1.5 text-blue-500 text-xs">●</span>}
                        </span>
                        <span className={`text-base font-bold ${row.closingBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                          {formatCurrency(row.closingBalance)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div>
                          <span className="text-gray-400 block">Carry-over</span>
                          <span className="text-gray-600 font-medium">{formatCurrency(row.carryOver)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Received</span>
                          <span className="text-blue-600 font-medium">{formatCurrency(row.cashAdded)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Paid out</span>
                          <span className="text-red-500 font-medium">{formatCurrency(row.totalPaid)}</span>
                        </div>
                      </div>
                      {(row.failedCount > 0 || row.initiatedCount > 0) && (
                        <p className="mt-1.5 text-xs">
                          {row.txnCount} txns
                          {row.failedCount > 0 && <span className="text-red-500"> · {row.failedCount} failed ({formatCurrency(row.failedAmount)})</span>}
                          {row.initiatedCount > 0 && <span className="text-amber-500"> · {row.initiatedCount} initiated</span>}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium">Date</th>
                      <th className="text-right px-3 py-3 font-medium">Carry-over</th>
                      <th className="text-right px-3 py-3 font-medium">Received</th>
                      <th className="text-right px-3 py-3 font-medium">Opening</th>
                      <th className="text-right px-3 py-3 font-medium">Paid out</th>
                      <th className="text-right px-3 py-3 font-medium">Txns</th>
                      <th className="text-right px-5 py-3 font-medium">Closing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {history.map((row) => {
                      const isSelected = !allTime && row.date === selectedDate;
                      return (
                        <tr
                          key={row.date}
                          onClick={() => { setAllTime(false); setSelectedDate(row.date); }}
                          className={`cursor-pointer transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        >
                          <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
                            {formatDate(row.date)}
                            {isSelected && <span className="ml-1.5 text-xs text-blue-500">●</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-500">{formatCurrency(row.carryOver)}</td>
                          <td className="px-3 py-3 text-right text-blue-600 font-medium">{formatCurrency(row.cashAdded)}</td>
                          <td className="px-3 py-3 text-right text-gray-800">{formatCurrency(row.openingBalance)}</td>
                          <td className="px-3 py-3 text-right text-red-500">{formatCurrency(row.totalPaid)}</td>
                          <td className="px-3 py-3 text-right text-gray-500">
                            {row.txnCount}
                            {row.failedCount > 0 && (
                              <span className="ml-1 text-xs text-red-500 block">
                                {row.failedCount}✗ {formatCurrency(row.failedAmount)}
                              </span>
                            )}
                          </td>
                          <td className={`px-5 py-3 text-right font-bold ${row.closingBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                            {formatCurrency(row.closingBalance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
