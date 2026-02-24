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
  q1Days: number;
  q2Days: number;
  q3Days: number;
  q4Days: number;
  dailyRate: number; // EUR per JH
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
  byQuarter: Record<string, number>; // Q1..Q4 -> available days
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
