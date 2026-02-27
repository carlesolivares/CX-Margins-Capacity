export type Role = 'CSM' | 'CS' | 'PMO' | 'FDE' | 'PM' | 'Dev';

export interface ProjectRow {
  id: string;
  account: string;
  project: string;
  deployRevenue: number;    // "DEPLOY (€)" column — EUR
  deployConso: number;      // "DEPLOY Conso (€)" column — EUR
  runRevenue: number;       // "RUN 2026 (€)" column — EUR
  runConso: number;         // "RUN conso 2026 (€)" column — EUR
  status: string;           // parsed from "Status" column
  kickOff: string;          // "Kick-off date"
  goLive: string;           // first date from "Go live date"
  contractEnd: string;      // "Contract termination" date
}

export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  m1: number;  // Jan
  m2: number;  // Feb
  m3: number;  // Mar
  m4: number;  // Apr
  m5: number;  // May
  m6: number;  // Jun
  m7: number;  // Jul
  m8: number;  // Aug
  m9: number;  // Sep
  m10: number; // Oct
  m11: number; // Nov
  m12: number; // Dec
  dailyRate: number; // EUR per JH
}

/** Month keys for iterating over TeamMember monthly days */
export const MONTH_KEYS = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11','m12'] as const;
export type MonthField = typeof MONTH_KEYS[number];
export const MONTH_LABELS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Sum all monthly days for a team member */
export function totalDays(m: TeamMember): number {
  return m.m1 + m.m2 + m.m3 + m.m4 + m.m5 + m.m6 + m.m7 + m.m8 + m.m9 + m.m10 + m.m11 + m.m12;
}

/** Migrate legacy quarterly TeamMember to monthly (splits quarter evenly across 3 months) */
export function migrateTeamMember(m: Record<string, unknown>): TeamMember {
  // Already migrated
  if ('m1' in m && typeof m.m1 === 'number') return m as unknown as TeamMember;
  // Legacy quarterly format
  const q1 = (m.q1Days as number) || 0;
  const q2 = (m.q2Days as number) || 0;
  const q3 = (m.q3Days as number) || 0;
  const q4 = (m.q4Days as number) || 0;
  const perQ1 = Math.round(q1 / 3 * 10) / 10;
  const perQ2 = Math.round(q2 / 3 * 10) / 10;
  const perQ3 = Math.round(q3 / 3 * 10) / 10;
  const perQ4 = Math.round(q4 / 3 * 10) / 10;
  return {
    id: m.id as string,
    name: m.name as string,
    role: m.role as Role,
    m1: perQ1, m2: perQ1, m3: perQ1,
    m4: perQ2, m5: perQ2, m6: perQ2,
    m7: perQ3, m8: perQ3, m9: perQ3,
    m10: perQ4, m11: perQ4, m12: perQ4,
    dailyRate: (m.dailyRate as number) || 400,
  };
}

export interface CustomerMargin {
  account: string;
  project?: string;         // populated in project-level views
  deployRevenue: number;
  deployCost: number;       // = deployConso in EUR
  deployMargin: number;
  deployHealthy: boolean;   // >= 20%
  runRevenue: number;
  runCost: number;          // = runConso in EUR
  runMargin: number;
  runHealthy: boolean;      // >= 80%
}

export interface TeamCapacity {
  totalAvailableDays: number;
  totalConsumedDays: number;
  totalCost: number;
  byRole: Record<Role, { days: number; cost: number; count: number }>;
  byMonth: Record<string, number>; // "Jan".."Dec" -> available days
}

export interface SimulationOverride {
  roleOverrides: Record<Role, { countDelta: number; daysDelta: number; rateDelta: number }>;
}

export interface Targets {
  deployMargin: number; // e.g. 20 for 20%
  runMargin: number;    // e.g. 80 for 80%
  globalMargin: number; // e.g. 70 for 70% — combined deploy+RUN target
}

export const DEFAULT_TARGETS: Targets = { deployMargin: 20, runMargin: 80, globalMargin: 70 };
export const ROLES: Role[] = ['CSM', 'CS', 'PMO', 'FDE', 'PM', 'Dev'];
export const DEFAULT_JH_RATE = 400;
