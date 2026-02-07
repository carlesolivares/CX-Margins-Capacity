import type { ProjectRow, TeamMember, CustomerMargin, TeamCapacity, SimulationOverride, Role, Targets } from '../types';
import { DEFAULT_JH_RATE, DEFAULT_TARGETS, ROLES } from '../types';

/**
 * Returns true if the project's go-live is in the past (before current year start),
 * meaning the deploy phase is complete and it should not appear in deploy dashboards.
 */
export function isDeployComplete(p: ProjectRow): boolean {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  if (!p.goLive) return false;
  const match = p.goLive.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const goLive = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return goLive < yearStart;
}

/**
 * Calculate margins per account.
 * Conso values are already in EUR, so: margin = (revenue - conso) / revenue.
 * The optional rateMultiplier lets simulation scale conso costs:
 *   effective cost = conso * rateMultiplier
 * Default rateMultiplier = 1.0 (no change).
 */
export function calculateMargins(projects: ProjectRow[], rateMultiplier: number = 1, targets: Targets = DEFAULT_TARGETS): CustomerMargin[] {
  const accounts = [...new Set(projects.map(p => p.account))].sort();

  return accounts.map(account => {
    const rows = projects.filter(p => p.account === account);

    const deployRevenue = rows.reduce((s, r) => s + r.deployRevenue, 0);
    const runRevenue = rows.reduce((s, r) => s + r.runRevenue, 0);
    const deployConso = rows.reduce((s, r) => s + r.deployConso, 0);
    const runConso = rows.reduce((s, r) => s + r.runConso, 0);

    // Cost = conso in EUR (already in EUR), scaled by rate multiplier for simulation
    const deployCost = deployConso * rateMultiplier;
    const runCost = runConso * rateMultiplier;

    const deployMargin = deployRevenue > 0
      ? ((deployRevenue - deployCost) / deployRevenue) * 100 : 0;
    const runMargin = runRevenue > 0
      ? ((runRevenue - runCost) / runRevenue) * 100 : 0;

    return {
      account,
      deployRevenue,
      deployCost,
      deployMargin: Math.round(deployMargin * 10) / 10,
      deployHealthy: deployMargin >= targets.deployMargin,
      runRevenue,
      runCost,
      runMargin: Math.round(runMargin * 10) / 10,
      runHealthy: runMargin >= targets.runMargin,
    };
  });
}

/**
 * Calculate margins per individual project (not grouped by account).
 */
export function calculateProjectMargins(projects: ProjectRow[], rateMultiplier: number = 1, targets: Targets = DEFAULT_TARGETS): CustomerMargin[] {
  return projects.map(p => {
    const deployCost = p.deployConso * rateMultiplier;
    const runCost = p.runConso * rateMultiplier;
    const deployMargin = p.deployRevenue > 0
      ? ((p.deployRevenue - deployCost) / p.deployRevenue) * 100 : 0;
    const runMargin = p.runRevenue > 0
      ? ((p.runRevenue - runCost) / p.runRevenue) * 100 : 0;

    return {
      account: p.account,
      project: p.project,
      deployRevenue: p.deployRevenue,
      deployCost,
      deployMargin: Math.round(deployMargin * 10) / 10,
      deployHealthy: deployMargin >= targets.deployMargin,
      runRevenue: p.runRevenue,
      runCost,
      runMargin: Math.round(runMargin * 10) / 10,
      runHealthy: runMargin >= targets.runMargin,
    };
  });
}

export function calculateTeamCapacity(members: TeamMember[]): TeamCapacity {
  const byRole = {} as TeamCapacity['byRole'];
  for (const role of ROLES) {
    byRole[role] = { days: 0, cost: 0, count: 0 };
  }

  const byQuarter: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  let totalAvailableDays = 0;
  let totalCost = 0;

  for (const m of members) {
    const totalDays = m.q1Days + m.q2Days + m.q3Days + m.q4Days;
    const cost = totalDays * m.dailyRate;
    byRole[m.role].days += totalDays;
    byRole[m.role].cost += cost;
    byRole[m.role].count += 1;
    byQuarter.Q1 += m.q1Days;
    byQuarter.Q2 += m.q2Days;
    byQuarter.Q3 += m.q3Days;
    byQuarter.Q4 += m.q4Days;
    totalAvailableDays += totalDays;
    totalCost += cost;
  }

  return { totalAvailableDays, totalConsumedDays: 0, totalCost, byRole, byQuarter };
}

/** Get consumed conso in EUR and converted to JH for display */
export function getConsumedStats(projects: ProjectRow[], targets: Targets = DEFAULT_TARGETS): {
  deployEur: number; runEur: number;
  deployJH: number; runJH: number;
} {
  const deployEur = projects.reduce((s, r) => s + r.deployRevenue, 0);
  const runEur = projects.reduce((s, r) => s + r.runRevenue, 0);
  return {
    deployEur,
    runEur,
    deployJH: deployEurToJH(deployEur, targets.deployMargin),
    runJH: runEurToJH(runEur, targets.runMargin),
  };
}

/**
 * Simulation: adjusting team capacity changes the effective cost rate.
 * We compute a rateMultiplier = simulated avg rate / current avg rate,
 * then scale all conso costs by that multiplier.
 */
export function simulateMargins(
  projects: ProjectRow[],
  members: TeamMember[],
  overrides: SimulationOverride,
  targets: Targets = DEFAULT_TARGETS,
): { margins: CustomerMargin[]; avgRate: number; totalCapacity: number; rateMultiplier: number } {
  const currentRate = getWeightedAvgRate(members);

  let totalDays = 0;
  let totalCost = 0;

  for (const role of ROLES) {
    const roleMembers = members.filter(m => m.role === role);
    const override = overrides.roleOverrides[role];

    const baseCount = roleMembers.length;
    const baseAvgDays = baseCount > 0
      ? roleMembers.reduce((s, m) => s + m.q1Days + m.q2Days + m.q3Days + m.q4Days, 0) / baseCount
      : 0;
    const baseAvgRate = baseCount > 0
      ? roleMembers.reduce((s, m) => s + m.dailyRate, 0) / baseCount
      : DEFAULT_JH_RATE;

    const simCount = Math.max(0, baseCount + override.countDelta);
    const simDaysPerPerson = Math.max(0, baseAvgDays + override.daysDelta);
    const simRate = Math.max(0, baseAvgRate + override.rateDelta);

    const roleTotalDays = simCount * simDaysPerPerson;
    totalDays += roleTotalDays;
    totalCost += roleTotalDays * simRate;
  }

  const simRate = totalDays > 0 ? totalCost / totalDays : DEFAULT_JH_RATE;
  const rateMultiplier = currentRate > 0 ? simRate / currentRate : 1;
  const margins = calculateMargins(projects, rateMultiplier, targets);

  return { margins, avgRate: simRate, totalCapacity: totalDays, rateMultiplier };
}

export function getWeightedAvgRate(members: TeamMember[]): number {
  if (members.length === 0) return DEFAULT_JH_RATE;
  let totalDays = 0;
  let totalCost = 0;
  for (const m of members) {
    const d = m.q1Days + m.q2Days + m.q3Days + m.q4Days;
    totalDays += d;
    totalCost += d * m.dailyRate;
  }
  return totalDays > 0 ? totalCost / totalDays : DEFAULT_JH_RATE;
}

export function emptySimulationOverride(): SimulationOverride {
  const roleOverrides = {} as SimulationOverride['roleOverrides'];
  for (const role of ROLES) {
    roleOverrides[role as Role] = { countDelta: 0, daysDelta: 0, rateDelta: 0 };
  }
  return { roleOverrides };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Convert EUR to JH for display */
export function eurToJH(eur: number, rate: number = DEFAULT_JH_RATE): number {
  return Math.round(eur / rate * 10) / 10;
}

/** Deploy JH = Deploy € * (100 - deployMargin%) / 400 */
export function deployEurToJH(eur: number, deployMarginPct: number = DEFAULT_TARGETS.deployMargin): number {
  return Math.round((eur * (100 - deployMarginPct) / 100) / DEFAULT_JH_RATE * 10) / 10;
}

/** RUN JH = RUN € * (100 - runMargin%) / 400 */
export function runEurToJH(eur: number, runMarginPct: number = DEFAULT_TARGETS.runMargin): number {
  return Math.round((eur * (100 - runMarginPct) / 100) / DEFAULT_JH_RATE * 10) / 10;
}
