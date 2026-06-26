import { getPaymentDb } from "./db";

export interface Transaction {
  id: string;
  upi: string;
  consumer_mobile: string | null;
  status: string;
  created_date: string;
  amount: number;
}

export async function getTransactionsForAgent(
  upiIds: string[],
  date?: string
): Promise<Transaction[]> {
  if (!upiIds.length) return [];
  const db = getPaymentDb();
  const placeholders = upiIds.map(() => "?").join(", ");
  // DB stores UTC; convert to IST (UTC+5:30) before date-matching so the IST date is correct
  const dateClause = date ? "AND DATE(CONVERT_TZ(txn_date, '+00:00', '+05:30')) = ?" : "";
  const params = date ? [...upiIds, date] : upiIds;
  const [rows] = await db.execute(
    `SELECT
       id,
       upi,
       acc_number   AS consumer_mobile,
       txn_status   AS status,
       txn_date     AS created_date,
       total_amount AS amount
     FROM direct_payout_txn
     WHERE upi IN (${placeholders})
       ${dateClause}
     ORDER BY txn_date DESC`,
    params
  );
  return rows as Transaction[];
}

export async function getPaidByDateForAgent(
  upiIds: string[]
): Promise<Record<string, { totalPaid: number; txnCount: number; failedCount: number; failedAmount: number; initiatedCount: number; initiatedAmount: number }>> {
  if (!upiIds.length) return {};
  const db = getPaymentDb();
  const placeholders = upiIds.map(() => "?").join(", ");
  const [rows] = await db.execute(
    `SELECT
       DATE(CONVERT_TZ(txn_date, '+00:00', '+05:30'))                               AS txn_date,
       SUM(total_amount)                                                             AS total_paid,
       COUNT(*)                                                                      AS txn_count,
       SUM(CASE WHEN txn_status = 'FAILED'    THEN 1            ELSE 0 END)         AS failed_count,
       SUM(CASE WHEN txn_status = 'FAILED'    THEN total_amount ELSE 0 END)         AS failed_amount,
       SUM(CASE WHEN txn_status = 'INITIATED' THEN 1            ELSE 0 END)         AS initiated_count,
       SUM(CASE WHEN txn_status = 'INITIATED' THEN total_amount ELSE 0 END)         AS initiated_amount
     FROM direct_payout_txn
     WHERE upi IN (${placeholders})
     GROUP BY DATE(CONVERT_TZ(txn_date, '+00:00', '+05:30'))
     ORDER BY txn_date DESC`,
    upiIds
  );
  const result: Record<string, { totalPaid: number; txnCount: number; failedCount: number; failedAmount: number; initiatedCount: number; initiatedAmount: number }> = {};
  for (const row of rows as { txn_date: string; total_paid: number; txn_count: number; failed_count: number; failed_amount: number; initiated_count: number; initiated_amount: number }[]) {
    const d = typeof row.txn_date === "string" ? row.txn_date : new Date(row.txn_date).toISOString().split("T")[0];
    result[d] = {
      totalPaid: Number(row.total_paid),
      txnCount: Number(row.txn_count),
      failedCount: Number(row.failed_count),
      failedAmount: Number(row.failed_amount),
      initiatedCount: Number(row.initiated_count),
      initiatedAmount: Number(row.initiated_amount),
    };
  }
  return result;
}

export async function getTransactionSummaryByDate(
  upiIds: string[],
  date: string
): Promise<{ total: number; failed: number; totalAmount: number; failedAmount: number }> {
  if (!upiIds.length) return { total: 0, failed: 0, totalAmount: 0, failedAmount: 0 };
  const txns = await getTransactionsForAgent(upiIds, date);
  const failed = txns.filter((t) => t.status !== "SUCCESS");
  return {
    total: txns.length,
    failed: failed.length,
    totalAmount: txns.reduce((s, t) => s + Number(t.amount), 0),
    failedAmount: failed.reduce((s, t) => s + Number(t.amount), 0),
  };
}

export async function getAllAgentTransactionsByDate(
  agents: { id: number; upiIds: string[] }[],
  date?: string
): Promise<Record<number, Transaction[]>> {
  const result: Record<number, Transaction[]> = {};
  await Promise.all(
    agents.map(async (a) => {
      result[a.id] = await getTransactionsForAgent(a.upiIds, date);
    })
  );
  return result;
}

export async function getDistinctUpiIds(): Promise<string[]> {
  const db = getPaymentDb();
  const [rows] = await db.execute(
    `SELECT DISTINCT upi FROM direct_payout_txn WHERE upi IS NOT NULL ORDER BY upi ASC`
  );
  return (rows as { upi: string }[]).map((r) => r.upi);
}

export async function getAllTransactions(date?: string): Promise<Transaction[]> {
  const db = getPaymentDb();
  const dateClause = date ? "WHERE DATE(CONVERT_TZ(txn_date, '+00:00', '+05:30')) = ?" : "";
  const [rows] = await db.execute(
    `SELECT id, upi, acc_number AS consumer_mobile, txn_status AS status, txn_date AS created_date, total_amount AS amount
     FROM direct_payout_txn
     ${dateClause}
     ORDER BY txn_date DESC
     LIMIT 2000`,
    date ? [date] : []
  );
  return rows as Transaction[];
}
