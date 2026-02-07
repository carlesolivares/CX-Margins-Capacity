import type { ProjectRow, TeamMember, Targets } from '../types';
import { DEFAULT_TARGETS } from '../types';
import { deployEurToJH, runEurToJH } from './margins';

/** Month key like "2026-01", "2026-02", etc. */
export type MonthKey = string;

/** Per-project JH spread across months */
export interface ProjectMonthlyJH {
  projectId: string;
  account: string;
  project: string;
  /** month key -> JH for that month */
  months: Record<MonthKey, number>;
}

/** Aggregated data for one month across all projects */
export interface MonthlyAggregate {
  month: MonthKey;
  label: string; // "Jan", "Feb", etc.
  total: number;
  /** per-project breakdown: projectId -> JH */
  byProject: Record<string, number>;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Default go-live date when the field is blank */
const DEFAULT_GO_LIVE = new Date(2025, 0, 1); // 01/01/2025

/** Parse a date string (YYYY-MM-DD or similar) to a Date object */
function parseDate(str: string): Date | null {
  if (!str) return null;
  const match = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  // Try parsing as-is
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/** Get the number of days in a given month (0-indexed month) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Format a month key from year and month index */
function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Build month entries between two dates with covered-day counts.
 */
function getMonthEntries(startDate: Date, endDate: Date): { key: MonthKey; days: number; monthIdx: number }[] {
  const entries: { key: MonthKey; days: number; monthIdx: number }[] = [];
  if (startDate >= endDate) return entries;

  let idx = 0;
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (cursor <= endDate) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const dim = daysInMonth(y, m);
    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m, dim);
    const effectiveStart = startDate > monthStart ? startDate : monthStart;
    const effectiveEnd = endDate < monthEnd ? endDate : monthEnd;

    if (effectiveStart <= effectiveEnd) {
      const coveredDays = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      entries.push({ key: monthKey(y, m), days: coveredDays, monthIdx: idx });
      idx++;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return entries;
}

/**
 * Spread total JH proportionally across months between startDate and endDate.
 * Partial months get a proportional share based on how many days of that month are covered.
 */
function spreadByMonth(totalJH: number, startDate: Date, endDate: Date): Record<MonthKey, number> {
  const result: Record<MonthKey, number> = {};
  if (totalJH <= 0 || startDate >= endDate) return result;

  const entries = getMonthEntries(startDate, endDate);
  const totalDays = entries.reduce((s, e) => s + e.days, 0);

  for (const e of entries) {
    result[e.key] = Math.round((totalJH * e.days / totalDays) * 10) / 10;
  }
  return result;
}

/**
 * Spread RUN JH with a hypercare curve: the first 3 months after go-live
 * get elevated weights (3x, 2x, 1.5x) compared to later months (1x).
 * Total JH is preserved — only the distribution changes.
 */
const HYPERCARE_WEIGHTS = [3, 2, 1.5];

function spreadByMonthWithHypercare(totalJH: number, startDate: Date, endDate: Date): Record<MonthKey, number> {
  const result: Record<MonthKey, number> = {};
  if (totalJH <= 0 || startDate >= endDate) return result;

  const entries = getMonthEntries(startDate, endDate);

  // Apply hypercare multipliers to the first 3 months, 1x after
  let weightedTotal = 0;
  const weighted = entries.map(e => {
    const multiplier = e.monthIdx < HYPERCARE_WEIGHTS.length ? HYPERCARE_WEIGHTS[e.monthIdx] : 1;
    const w = e.days * multiplier;
    weightedTotal += w;
    return { key: e.key, w };
  });

  for (const { key, w } of weighted) {
    result[key] = Math.round((totalJH * w / weightedTotal) * 10) / 10;
  }
  return result;
}

/**
 * For each project, compute Deploy JH spread by month (Phase 1: kickOff → goLive).
 */
export function computeDeploySimulation(
  projects: ProjectRow[],
  targets: Targets = DEFAULT_TARGETS,
): { perProject: ProjectMonthlyJH[]; aggregated: MonthlyAggregate[] } {
  const perProject: ProjectMonthlyJH[] = [];

  for (const p of projects) {
    const start = parseDate(p.kickOff);
    const end = parseDate(p.goLive) || DEFAULT_GO_LIVE;
    if (!start || p.deployRevenue <= 0) continue;

    const totalJH = deployEurToJH(p.deployRevenue, targets.deployMargin);
    const months = spreadByMonth(totalJH, start, end);

    if (Object.keys(months).length > 0) {
      perProject.push({
        projectId: p.id,
        account: p.account,
        project: p.project,
        months,
      });
    }
  }

  return { perProject, aggregated: aggregateMonths(perProject) };
}

/**
 * For each project, compute RUN JH spread by month (Phase 2: goLive → Dec 31 of current year).
 * If go-live is before Jan 1 of the current year, the project is already fully in RUN:
 *   - Start is clamped to Jan 1 (hypercare period is past)
 *   - JH is spread evenly (flat) across 2026 months only
 * If go-live is in the current year, hypercare weighting applies from go-live.
 */
export function computeRunSimulation(
  projects: ProjectRow[],
  targets: Targets = DEFAULT_TARGETS,
): { perProject: ProjectMonthlyJH[]; aggregated: MonthlyAggregate[] } {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1); // Jan 1
  const yearEnd = new Date(currentYear, 11, 31); // Dec 31

  const perProject: ProjectMonthlyJH[] = [];

  for (const p of projects) {
    const goLive = parseDate(p.goLive) || DEFAULT_GO_LIVE;
    if (p.runRevenue <= 0) continue;

    const totalJH = runEurToJH(p.runRevenue, targets.runMargin);
    let months: Record<MonthKey, number>;

    if (goLive < yearStart) {
      // Go-live was before this year → already in RUN, no hypercare, spread evenly from Jan 1
      months = spreadByMonth(totalJH, yearStart, yearEnd);
    } else {
      // Go-live is this year → hypercare applies from go-live date
      months = spreadByMonthWithHypercare(totalJH, goLive, yearEnd);
    }

    if (Object.keys(months).length > 0) {
      perProject.push({
        projectId: p.id,
        account: p.account,
        project: p.project,
        months,
      });
    }
  }

  return { perProject, aggregated: aggregateMonths(perProject) };
}

/** Aggregate per-project monthly data into per-month totals.
 *  Always returns all 12 months of the given year so charts are consistent.
 */
function aggregateMonths(perProject: ProjectMonthlyJH[], year: number = 2026): MonthlyAggregate[] {
  return Array.from({ length: 12 }, (_, m) => {
    const mk = monthKey(year, m);
    const byProject: Record<string, number> = {};
    let total = 0;

    for (const pp of perProject) {
      const jh = pp.months[mk] || 0;
      if (jh > 0) {
        byProject[pp.projectId] = jh;
        total += jh;
      }
    }

    return {
      month: mk,
      label: MONTH_LABELS[m],
      total: Math.round(total * 10) / 10,
      byProject,
    };
  });
}

/**
 * Compute team capacity by month.
 * Each team member has Q1-Q4 days. We split each quarter evenly across its 3 months.
 * Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec.
 */
export function computeTeamCapacityByMonth(
  members: TeamMember[],
  year: number = new Date().getFullYear(),
): MonthlyAggregate[] {
  const monthTotals: Record<MonthKey, number> = {};

  // Initialize all 12 months
  for (let m = 0; m < 12; m++) {
    monthTotals[monthKey(year, m)] = 0;
  }

  for (const member of members) {
    const quarters = [member.q1Days, member.q2Days, member.q3Days, member.q4Days];
    for (let q = 0; q < 4; q++) {
      const perMonth = quarters[q] / 3;
      for (let mOffset = 0; mOffset < 3; mOffset++) {
        const m = q * 3 + mOffset;
        monthTotals[monthKey(year, m)] += perMonth;
      }
    }
  }

  const sorted = Object.keys(monthTotals).sort();
  return sorted.map(mk => {
    const [, mStr] = mk.split('-');
    const monthIdx = Number(mStr) - 1;
    return {
      month: mk,
      label: MONTH_LABELS[monthIdx] || mk,
      total: Math.round(monthTotals[mk] * 10) / 10,
      byProject: {},
    };
  });
}

/**
 * Compute simulated team capacity by month, applying role overrides.
 * Each role's quarterly days are adjusted by daysDelta and headcount delta,
 * then split evenly across the 3 months of each quarter.
 */
export function computeSimulatedCapacityByMonth(
  members: TeamMember[],
  overrides: { roleOverrides: Record<string, { countDelta: number; daysDelta: number; rateDelta: number }> },
  year: number = 2026,
): MonthlyAggregate[] {
  const ROLES = ['CSM', 'CS', 'PMO', 'FDE', 'PM', 'Dev'];
  const monthTotals: Record<MonthKey, number> = {};
  for (let m = 0; m < 12; m++) {
    monthTotals[monthKey(year, m)] = 0;
  }

  for (const role of ROLES) {
    const roleMembers = members.filter(m => m.role === role);
    const baseCount = roleMembers.length;
    const override = overrides.roleOverrides[role] || { countDelta: 0, daysDelta: 0, rateDelta: 0 };
    const simCount = Math.max(0, baseCount + override.countDelta);

    if (simCount === 0 || baseCount === 0) continue;

    // Average quarterly days per person for this role
    const avgQ = [
      roleMembers.reduce((s, m) => s + m.q1Days, 0) / baseCount,
      roleMembers.reduce((s, m) => s + m.q2Days, 0) / baseCount,
      roleMembers.reduce((s, m) => s + m.q3Days, 0) / baseCount,
      roleMembers.reduce((s, m) => s + m.q4Days, 0) / baseCount,
    ];

    // Total annual days per person (for computing daysDelta spread)
    const totalAnnualPerPerson = avgQ.reduce((s, v) => s + v, 0);

    for (let q = 0; q < 4; q++) {
      // Spread daysDelta proportionally across quarters
      const quarterDelta = totalAnnualPerPerson > 0
        ? override.daysDelta * (avgQ[q] / totalAnnualPerPerson)
        : override.daysDelta / 4;
      const perPerson = Math.max(0, avgQ[q] + quarterDelta);
      const quarterTotal = simCount * perPerson;
      const perMonth = quarterTotal / 3;

      for (let mOffset = 0; mOffset < 3; mOffset++) {
        const m = q * 3 + mOffset;
        monthTotals[monthKey(year, m)] += perMonth;
      }
    }
  }

  const sorted = Object.keys(monthTotals).sort();
  return sorted.map(mk => {
    const [, mStr] = mk.split('-');
    const monthIdx = Number(mStr) - 1;
    return {
      month: mk,
      label: MONTH_LABELS[monthIdx] || mk,
      total: Math.round(monthTotals[mk] * 10) / 10,
      byProject: {},
    };
  });
}

/**
 * Compute combined demand (Deploy + RUN) per month, non-cumulative.
 * Always returns 12 months for the given year.
 */
export function computeTotalDemandByMonth(
  projects: ProjectRow[],
  targets: Targets = DEFAULT_TARGETS,
  year: number = 2026,
): MonthlyAggregate[] {
  const deploy = computeDeploySimulation(projects, targets);
  const run = computeRunSimulation(projects, targets);

  return Array.from({ length: 12 }, (_, m) => {
    const mk = monthKey(year, m);
    const dAgg = deploy.aggregated.find(a => a.month === mk);
    const rAgg = run.aggregated.find(a => a.month === mk);

    return {
      month: mk,
      label: MONTH_LABELS[m],
      total: Math.round(((dAgg?.total || 0) + (rAgg?.total || 0)) * 10) / 10,
      byProject: {},
    };
  });
}

/** Projection: extrapolate current consumption to end of phase */
export interface ProjectProjection {
  id: string;
  account: string;
  project: string;
  status: string;
  // Deploy
  deployRevenue: number;
  deployConso: number;         // actual so far
  deployProjected: number;     // extrapolated to end of phase
  deployMarginProjected: number; // projected margin %
  deployPhaseDays: number;     // total phase days
  deployElapsedDays: number;   // days elapsed
  deployProgress: number;      // 0-100%
  // RUN
  runRevenue: number;
  runConso: number;
  runProjected: number;
  runMarginProjected: number;
  runPhaseDays: number;
  runElapsedDays: number;
  runProgress: number;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export function computeProjections(
  projects: ProjectRow[],
  targets: Targets = DEFAULT_TARGETS,
  today: Date = new Date(),
): ProjectProjection[] {
  const yearEnd = new Date(2026, 11, 31);

  return projects.map(p => {
    const kickOff = parseDate(p.kickOff);
    const goLive = parseDate(p.goLive) || DEFAULT_GO_LIVE;
    const inPhase2 = today >= goLive;

    // Deploy phase: kickOff → goLive
    let deployPhaseDays = 0;
    let deployElapsedDays = 0;
    let deployProjected = p.deployConso;
    let deployProgress = 0;

    if (inPhase2) {
      // Project is past go-live → deploy phase is 100% complete
      if (kickOff && goLive > kickOff) {
        deployPhaseDays = daysBetween(kickOff, goLive);
      }
      deployElapsedDays = deployPhaseDays;
      deployProjected = p.deployConso; // actual = final
      deployProgress = 100;
    } else if (kickOff && goLive > kickOff) {
      // Still in Phase 1 (deploy)
      deployPhaseDays = daysBetween(kickOff, goLive);
      deployElapsedDays = Math.min(daysBetween(kickOff, today), deployPhaseDays);
      if (deployElapsedDays > 0 && deployElapsedDays < deployPhaseDays && p.deployConso > 0) {
        deployProjected = Math.round(p.deployConso * (deployPhaseDays / deployElapsedDays));
      }
      deployProgress = deployPhaseDays > 0 ? Math.min(100, Math.round((deployElapsedDays / deployPhaseDays) * 100)) : 0;
    }

    const deployMarginProjected = p.deployRevenue > 0
      ? Math.round(((p.deployRevenue - deployProjected) / p.deployRevenue) * 1000) / 10
      : 0;

    // RUN phase: goLive → Dec 31
    // If go-live was before 01/01/2026, RUN starts counting from 01/01/2026
    const yearStart = new Date(2026, 0, 1);
    const runStart = goLive < yearStart ? yearStart : goLive;
    const runPhaseDays = daysBetween(runStart, yearEnd);
    let runElapsedDays = 0;
    let runProjected = p.runConso;

    if (!inPhase2) {
      // Project still in Phase 1 → RUN hasn't started yet
      // Use the simulation-based projected cost: runRevenue * (100 - runMargin%) / 100
      if (p.runRevenue > 0) {
        runProjected = Math.round(p.runRevenue * (100 - targets.runMargin) / 100);
      }
    } else if (runPhaseDays > 0) {
      // Project is in Phase 2
      runElapsedDays = Math.min(daysBetween(runStart, today), runPhaseDays);
      if (runElapsedDays > 0 && runElapsedDays < runPhaseDays && p.runConso > 0) {
        runProjected = Math.round(p.runConso * (runPhaseDays / runElapsedDays));
      }
      if (today >= yearEnd) {
        runProjected = p.runConso;
        runElapsedDays = runPhaseDays;
      }
    }

    const runProgress = runPhaseDays > 0 ? Math.min(100, Math.round((runElapsedDays / runPhaseDays) * 100)) : 0;
    const runMarginProjected = p.runRevenue > 0
      ? Math.round(((p.runRevenue - runProjected) / p.runRevenue) * 1000) / 10
      : 0;

    return {
      id: p.id,
      account: p.account,
      project: p.project,
      status: p.status,
      deployRevenue: p.deployRevenue,
      deployConso: p.deployConso,
      deployProjected,
      deployMarginProjected,
      deployPhaseDays,
      deployElapsedDays,
      deployProgress,
      runRevenue: p.runRevenue,
      runConso: p.runConso,
      runProjected,
      runMarginProjected,
      runPhaseDays,
      runElapsedDays,
      runProgress,
    };
  });
}

/** Generate a color palette for projects */
const PROJECT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#22c55e',
  '#eab308', '#d946ef', '#64748b', '#fb923c', '#2dd4bf',
];

export function getProjectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}
