import * as XLSX from 'xlsx';
import type { ProjectRow } from '../types';

let idCounter = Date.now();
function nextId(): string {
  return (idCounter++).toString(36);
}

function normalize(str: string): string {
  return (str || '').toString().trim().toLowerCase()
    // Normalize dashes (en-dash, em-dash, non-breaking hyphen) to regular hyphen
    .replace(/[\u2013\u2014\u2011\u2012\u2015]/g, '-')
    // Normalize all whitespace (non-breaking space, thin space, etc.) to regular space
    .replace(/[\u00A0\u2007\u202F\u2060]/g, ' ');
}

function findColumn(headers: string[], candidates: string[], exclude?: string[]): number {
  // First pass: strict matching (skip long headers and URLs)
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => {
      const raw = (h || '').toString().trim();
      if (raw.length > 40 || /https?:\/\//.test(raw) || /notion\.so/.test(raw)) return false;
      const nh = normalize(raw);
      if (!nh.includes(normalize(candidate))) return false;
      if (exclude) {
        for (const ex of exclude) {
          if (nh.includes(normalize(ex))) return false;
        }
      }
      return true;
    });
    if (idx !== -1) return idx;
  }
  // Second pass: extract text before any URL/parenthetical, then match
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => {
      const raw = (h || '').toString().trim();
      // Extract just the readable part: strip URLs, parentheticals, and Notion IDs
      const cleaned = raw
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[-–]\s*[a-f0-9]{32}\s*$/i, '')
        .trim();
      if (!cleaned) return false;
      const nh = normalize(cleaned);
      if (!nh.includes(normalize(candidate))) return false;
      if (exclude) {
        for (const ex of exclude) {
          if (nh.includes(normalize(ex))) return false;
        }
      }
      return true;
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNum(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  let str = (raw || '0').toString().replace(/[^\d.,-]/g, '');
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastDot > lastComma) {
      // US format: "55,452.30" — comma is thousands, dot is decimal
      str = str.replace(/,/g, '');
    } else {
      // European format: "55.452,30" — dot is thousands, comma is decimal
      str = str.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastComma !== -1) {
    // Only comma: European decimal (e.g. "55452,30")
    str = str.replace(',', '.');
  }
  // If only dots: parseFloat handles single decimal dot correctly;
  // multiple dots (e.g. "40.500.00") — keep last as decimal
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

const MONTH_NAMES: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function parseDate(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(raw);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  let str = (raw || '').toString().trim();
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str;
  // Notion format: "@Month Day, Year" or "Month Day, Year"
  str = str.replace(/^@\s*/, '');
  // Match "February 4, 2026" or "Feb 4, 2026" or "February 4 2026"
  const mdy = str.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (mdy) {
    const mm = MONTH_NAMES[mdy[1].toLowerCase()];
    if (mm) {
      return `${mdy[3]}-${mm}-${String(mdy[2]).padStart(2, '0')}`;
    }
  }
  // Match "4 February 2026" or "04/02/2026" (DD/MM/YYYY)
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  return str;
}

/** Extract only the first date from a cell that may contain multiple dates */
function extractFirstDate(raw: unknown): string {
  const full = parseDate(raw);
  if (!full) return '';
  // If it looks like "2026-01-15, 2026-06-01" or "Jan 15 2026 / Jun 1 2026", take first
  const match = full.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  // Try splitting by common separators
  const parts = full.split(/[,;/|]/).map(s => s.trim()).filter(Boolean);
  return parts[0] || full;
}

/** Strip Notion URL / markdown links from account name */
function cleanAccountName(raw: string): string {
  return raw
    // Markdown link: [Text](url) -> Text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Parenthesized URL: "Name (https://...)" -> "Name"
    .replace(/\s*\(https?:\/\/[^)]*\)\s*/g, '')
    // Bare URL anywhere
    .replace(/https?:\/\/\S+/g, '')
    // Notion ID-like suffixes: "Name-abc123def456"
    .replace(/[-–]\s*[a-f0-9]{32}\s*$/i, '')
    .trim();
}

/** Revenue import: each row is a payment line.
 *  - "type" column: "licenses" → RUN, "setup" → Deploy
 *  - "CA year" (or similar) column(s): the revenue amount
 *  - Grouped by account/program to produce totals per project.
 *  Returns a map: accountKey → { deployRevenue, runRevenue } */
export interface RevenueEntry {
  account: string;
  project: string;
  deployRevenue: number;
  runRevenue: number;
}

/** Detailed revenue line with per-year breakdown */
export interface RevenueLineItem {
  account: string;
  project: string;
  type: 'deploy' | 'run' | 'unknown';
  yearAmounts: Record<number, number>; // year → amount
}

/** Detect all year columns in headers (matching patterns like "ca 2025", "2026", "revenue 2027", etc.) */
function detectYearColumns(headers: string[]): { colIndex: number; year: number }[] {
  const result: { colIndex: number; year: number }[] = [];
  const yearRe = /\b(20[2-3]\d)\b/; // matches years 2020-2039
  for (let i = 0; i < headers.length; i++) {
    const nh = normalize(headers[i]);
    // Exclude columns that are clearly not revenue
    if (nh.includes('conso') || nh.includes('consumed') || nh.includes('cost')) continue;
    const m = nh.match(yearRe);
    if (m) {
      result.push({ colIndex: i, year: parseInt(m[1], 10) });
    }
  }
  return result;
}

function classifyType(type: string): 'deploy' | 'run' | 'unknown' {
  const t = normalize(type);
  if (t.includes('license') || t.includes('licence') || t.includes('run') || t.includes('maintenance') || t.includes('support')) {
    return 'run';
  }
  if (t.includes('setup') || t.includes('deploy') || t.includes('implementation') || t.includes('install') || t.includes('project')) {
    return 'deploy';
  }
  return 'unknown';
}

/** Parse revenue file into detailed per-year line items, grouped by account+project+type */
export function parseRevenueFileDetailed(file: File): Promise<RevenueLineItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) {
          reject(new Error('File must have at least a header row and one data row'));
          return;
        }

        const headers = (rows[0] as string[]).map(h => (h || '').toString());

        const accountCol = findColumn(headers, ['account', 'accounts', 'program', 'programme', 'customer', 'client', 'compte']);
        if (accountCol === -1) { reject(new Error('Could not find account/program column')); return; }

        const projectCol = findColumn(headers, ['project', 'name', 'projet']);

        const typeCol = findColumn(headers, ['type', 'category', 'catégorie', 'categorie', 'revenue type']);
        if (typeCol === -1) { reject(new Error('Could not find "type" column (expected: type, category)')); return; }

        const yearCols = detectYearColumns(headers);
        if (yearCols.length === 0) {
          reject(new Error('Could not find any year columns (expected columns with years like 2025, 2026, 2027...)'));
          return;
        }

        // Aggregate by account+project+type
        const map = new Map<string, RevenueLineItem>();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          if (!row || row.length === 0) continue;

          const rawAccount = (row[accountCol] || '').toString().trim();
          const account = cleanAccountName(rawAccount);
          if (!account) continue;

          const project = projectCol !== -1 ? (row[projectCol] || '').toString().trim() : '';
          const typeRaw = (row[typeCol] || '').toString();
          const type = classifyType(typeRaw);

          const key = `${account}|||${project}|||${type}`;
          if (!map.has(key)) {
            map.set(key, { account, project, type, yearAmounts: {} });
          }
          const entry = map.get(key)!;

          for (const { colIndex, year } of yearCols) {
            const amount = parseNum(row[colIndex]);
            if (amount !== 0) {
              entry.yearAmounts[year] = (entry.yearAmounts[year] || 0) + amount;
            }
          }
        }

        resolve(Array.from(map.values()));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function parseRevenueFile(file: File): Promise<RevenueEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) {
          reject(new Error('File must have at least a header row and one data row'));
          return;
        }

        const headers = (rows[0] as string[]).map(h => (h || '').toString());

        // Find account/program column
        const accountCol = findColumn(headers, ['account', 'accounts', 'program', 'programme', 'customer', 'client', 'compte']);
        if (accountCol === -1) {
          reject(new Error('Could not find account/program column'));
          return;
        }

        // Find project column (optional)
        const projectCol = findColumn(headers, ['project', 'name', 'projet']);

        // Find type column (licenses / setup)
        const typeCol = findColumn(headers, ['type', 'category', 'catégorie', 'categorie', 'revenue type']);
        if (typeCol === -1) {
          reject(new Error('Could not find "type" column (expected: type, category)'));
          return;
        }

        // Find CA year column(s): match "ca 2026", "ca year", "ca annuel", "revenue year", "montant annuel"
        const currentYear = new Date().getFullYear();
        const caColIndices: number[] = [];
        for (let i = 0; i < headers.length; i++) {
          const nh = normalize(headers[i]);
          if (
            nh.includes(`ca ${currentYear}`) ||
            nh.includes(`ca year`) ||
            nh.includes(`ca annuel`) ||
            nh.includes(`revenue year`) ||
            nh.includes(`revenue ${currentYear}`) ||
            nh.includes(`montant annuel`) ||
            nh.includes(`montant ${currentYear}`) ||
            nh === 'ca' ||
            nh.includes(`${currentYear}`)
          ) {
            // Exclude columns that are clearly not revenue (conso, consumed, etc.)
            if (!nh.includes('conso') && !nh.includes('consumed')) {
              caColIndices.push(i);
            }
          }
        }

        if (caColIndices.length === 0) {
          reject(new Error(`Could not find CA/revenue year column (tried: "CA ${currentYear}", "CA year", "revenue ${currentYear}")`));
          return;
        }

        // Aggregate by account+project → { deployRevenue, runRevenue }
        const map = new Map<string, RevenueEntry>();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          if (!row || row.length === 0) continue;

          const rawAccount = (row[accountCol] || '').toString().trim();
          const account = cleanAccountName(rawAccount);
          if (!account) continue;

          const project = projectCol !== -1 ? (row[projectCol] || '').toString().trim() : '';
          const type = normalize((row[typeCol] || '').toString());

          // Sum all CA columns for this row
          let amount = 0;
          for (const ci of caColIndices) {
            amount += parseNum(row[ci]);
          }

          const key = `${account}|||${project}`;
          if (!map.has(key)) {
            map.set(key, { account, project, deployRevenue: 0, runRevenue: 0 });
          }
          const entry = map.get(key)!;

          if (type.includes('license') || type.includes('licence') || type.includes('run') || type.includes('maintenance') || type.includes('support')) {
            entry.runRevenue += amount;
          } else if (type.includes('setup') || type.includes('deploy') || type.includes('implementation') || type.includes('install') || type.includes('project')) {
            entry.deployRevenue += amount;
          }
          // Unknown types are ignored
        }

        resolve(Array.from(map.values()));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function parseProjectFile(file: File): Promise<ProjectRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) {
          reject(new Error('File must have at least a header row and one data row'));
          return;
        }

        const headers = (rows[0] as string[]).map(h => (h || '').toString());

        // Helper: try name-based detection, fall back to column index
        const col = (candidates: string[], fallbackIdx: number, exclude?: string[]): number => {
          const found = findColumn(headers, candidates, exclude);
          return found !== -1 ? found : (fallbackIdx < headers.length ? fallbackIdx : -1);
        };

        // Required columns — match actual CSV headers
        const accountCol = col(['accounts', 'account', 'compte', 'customer', 'client'], 0);
        const projectCol = col(['name', 'project', 'projet'], 1);

        // Status column
        const statusCol = findColumn(headers, ['status', 'statut', 'état', 'etat', 'stage']);

        // Date columns
        const kickOffCol = col(['kick-off date', 'kickoff date', 'kick off date', 'kick-off', 'kickoff', 'kick off'], -1, ['milestone']);
        const goLiveCol = col(['go-live date', 'go live date', 'go live', 'go-live', 'golive', 'live date'], 12, ['milestone']);
        const contractEndCol = col(['contract termination', 'contract expiration', 'termination', 'contract end', 'end date', 'fin contrat', 'expiration'], 14);

        // RUN (€) = col U (20), RUN conso = col V (21)
        const runRevCol = col(['run 2026', 'run (', 'run revenue', 'run ca'], 20, ['conso', 'consumption']);
        const runConsoCol = col(['run conso', 'run consumption'], 21);

        // DEPLOY (€) = col W (22), DEPLOY conso = col X (23)
        const deployRevCol = col(['deploy (', 'deploy 2026', 'deploy revenue', 'deploy'], 22, ['conso', 'consumption', 'jh', '%']);
        const deployConsoCol = col(['deploy conso', 'deployment conso', 'deploy consumption'], 23);


        if (accountCol === -1) {
          reject(new Error('Could not find "Accounts" column. Expected: accounts, account, customer, or client'));
          return;
        }
        if (projectCol === -1) {
          reject(new Error('Could not find "Name" (project) column. Expected: name, project, or projet'));
          return;
        }

        const projects: ProjectRow[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          if (!row || row.length === 0) continue;

          const rawAccount = (row[accountCol] || '').toString().trim();
          const account = cleanAccountName(rawAccount);
          if (!account) continue;
          const project = (row[projectCol] || '').toString().trim();

          const deployRevenue = deployRevCol !== -1 ? parseNum(row[deployRevCol]) : 0;
          const deployConso = deployConsoCol !== -1 ? parseNum(row[deployConsoCol]) : 0;
          const runRevenue = runRevCol !== -1 ? parseNum(row[runRevCol]) : 0;
          const runConso = runConsoCol !== -1 ? parseNum(row[runConsoCol]) : 0;

          const status = statusCol !== -1 ? (row[statusCol] || '').toString().trim() : '';
          const kickOff = kickOffCol !== -1 ? extractFirstDate(row[kickOffCol]) : '';
          const goLive = goLiveCol !== -1 ? extractFirstDate(row[goLiveCol]) : '';
          const contractEnd = contractEndCol !== -1 ? parseDate(row[contractEndCol]) : '';

          projects.push({
            id: nextId(),
            account,
            project,
            deployRevenue,
            deployConso,
            runRevenue,
            runConso,
            status,
            kickOff,
            goLive,
            contractEnd,
          });
        }

        resolve(projects);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
