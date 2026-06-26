import { google, sheets_v4 } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// Singleton — survives hot reloads in Next.js dev
const g = globalThis as unknown as { sheetsClient?: sheets_v4.Sheets; sheetsInitialized?: boolean };

function getClient(): sheets_v4.Sheets {
  if (!g.sheetsClient) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        // Env vars store \n as literal backslash-n; convert to real newlines
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    g.sheetsClient = google.sheets({ version: "v4", auth });
  }
  return g.sheetsClient;
}

// ── Sheet initialisation ─────────────────────────────────────────────────────
// Ensures "Agents" and "Sessions" tabs exist with correct headers on first use.
async function ensureSheets() {
  if (g.sheetsInitialized) return;
  const sheets = getClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title);

  const requests: sheets_v4.Schema$Request[] = [];
  if (!titles.includes("Agents")) {
    requests.push({ addSheet: { properties: { title: "Agents" } } });
  }
  if (!titles.includes("Sessions")) {
    requests.push({ addSheet: { properties: { title: "Sessions" } } });
  }
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  }

  // Write headers if rows are empty
  const agentsCheck = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Agents!A1:G1" });
  if (!agentsCheck.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: "Agents!A1:G1", valueInputOption: "RAW",
      requestBody: { values: [["id", "name", "upiIds", "pinHash", "isActive", "createdAt", "updatedAt"]] },
    });
  }
  const sessionsCheck = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Sessions!A1:G1" });
  if (!sessionsCheck.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: "Sessions!A1:G1", valueInputOption: "RAW",
      requestBody: { values: [["id", "agentId", "sessionDate", "carryOver", "cashAdded", "openingBalance", "createdAt"]] },
    });
  }

  g.sheetsInitialized = true;
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface SheetAgent {
  id: number;
  name: string;
  upiIds: string[];
  pinHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SheetSession {
  id: number;
  agentId: number;
  sessionDate: string; // ISO date YYYY-MM-DD
  carryOver: number;
  cashAdded: number;
  openingBalance: number;
  createdAt: string;
  agentName?: string;  // joined when needed
}

// ── Parsers ──────────────────────────────────────────────────────────────────
function rowToAgent(row: string[]): SheetAgent {
  return {
    id: Number(row[0]),
    name: row[1] || "",
    upiIds: (() => { try { return JSON.parse(row[2] || "[]"); } catch { return []; } })(),
    pinHash: row[3] || "",
    isActive: row[4] === "TRUE" || row[4] === "true" || row[4] === "1",
    createdAt: row[5] || "",
    updatedAt: row[6] || "",
  };
}

function rowToSession(row: string[]): SheetSession {
  return {
    id: Number(row[0]),
    agentId: Number(row[1]),
    sessionDate: (row[2] || "").slice(0, 10), // keep YYYY-MM-DD
    carryOver: Number(row[3] || 0),
    cashAdded: Number(row[4] || 0),
    openingBalance: Number(row[5] || 0),
    createdAt: row[6] || "",
  };
}

// ── Agent CRUD ───────────────────────────────────────────────────────────────
export async function getAgents(): Promise<SheetAgent[]> {
  await ensureSheets();
  const res = await getClient().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Agents!A2:G" });
  return (res.data.values || []).filter((r) => r[0]).map(rowToAgent);
}

export async function getAgentById(id: number): Promise<SheetAgent | null> {
  const agents = await getAgents();
  return agents.find((a) => a.id === id) ?? null;
}

export async function createAgent(data: { name: string; upiIds: string[]; pinHash: string }): Promise<SheetAgent> {
  await ensureSheets();
  const agents = await getAgents();
  const id = agents.length > 0 ? Math.max(...agents.map((a) => a.id)) + 1 : 1;
  const now = new Date().toISOString();
  const row = [id, data.name, JSON.stringify(data.upiIds), data.pinHash, "TRUE", now, now];
  await getClient().spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: "Agents!A:G", valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
  return { id, ...data, isActive: true, createdAt: now, updatedAt: now };
}

export async function updateAgent(id: number, data: Partial<{ name: string; upiIds: string[]; pinHash: string; isActive: boolean }>): Promise<SheetAgent | null> {
  await ensureSheets();
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Agents!A2:G" });
  const rows = res.data.values || [];
  const idx = rows.findIndex((r) => Number(r[0]) === id);
  if (idx === -1) return null;

  const row = [...rows[idx]];
  const now = new Date().toISOString();
  if (data.name !== undefined) row[1] = data.name;
  if (data.upiIds !== undefined) row[2] = JSON.stringify(data.upiIds);
  if (data.pinHash !== undefined) row[3] = data.pinHash;
  if (data.isActive !== undefined) row[4] = data.isActive ? "TRUE" : "FALSE";
  row[6] = now;

  const sheetRow = idx + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `Agents!A${sheetRow}:G${sheetRow}`, valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
  return rowToAgent(row);
}

// ── Session CRUD ─────────────────────────────────────────────────────────────
async function getAllSessionRows(): Promise<string[][]> {
  await ensureSheets();
  const res = await getClient().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Sessions!A2:G" });
  return (res.data.values || []).filter((r) => r[0]);
}

export async function getSessions(filter?: { date?: string; agentId?: number }): Promise<SheetSession[]> {
  let rows = await getAllSessionRows();
  if (filter?.agentId !== undefined) rows = rows.filter((r) => Number(r[1]) === filter.agentId);
  if (filter?.date) rows = rows.filter((r) => (r[2] || "").slice(0, 10) === filter.date);
  return rows.map(rowToSession);
}

export async function getSessionsForDate(date: string): Promise<(SheetSession & { agentName: string })[]> {
  const [rows, agents] = await Promise.all([getAllSessionRows(), getAgents()]);
  const agentMap = new Map(agents.map((a) => [a.id, a.name]));
  return rows
    .filter((r) => (r[2] || "").slice(0, 10) === date)
    .map((r) => ({ ...rowToSession(r), agentName: agentMap.get(Number(r[1])) || "" }));
}

export async function getSession(agentId: number, date: string): Promise<SheetSession | null> {
  const sessions = await getSessions({ agentId, date });
  return sessions[0] ?? null;
}

export async function upsertSession(data: {
  agentId: number; sessionDate: string; carryOver: number; cashAdded: number; openingBalance: number;
}): Promise<SheetSession> {
  await ensureSheets();
  const sheets = getClient();
  const rows = await getAllSessionRows();
  const idx = rows.findIndex((r) => Number(r[1]) === data.agentId && (r[2] || "").slice(0, 10) === data.sessionDate);
  const now = new Date().toISOString();

  if (idx === -1) {
    const allSessions = rows.filter((r) => r[0]).map((r) => Number(r[0]));
    const id = allSessions.length > 0 ? Math.max(...allSessions) + 1 : 1;
    const row = [id, data.agentId, data.sessionDate, data.carryOver, data.cashAdded, data.openingBalance, now];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: "Sessions!A:G", valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
    return { id, ...data, createdAt: now };
  } else {
    const existingId = Number(rows[idx][0]);
    const existingCreatedAt = rows[idx][6] || now;
    const row = [existingId, data.agentId, data.sessionDate, data.carryOver, data.cashAdded, data.openingBalance, existingCreatedAt];
    const sheetRow = idx + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `Sessions!A${sheetRow}:G${sheetRow}`, valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
    return { id: existingId, ...data, createdAt: existingCreatedAt };
  }
}
