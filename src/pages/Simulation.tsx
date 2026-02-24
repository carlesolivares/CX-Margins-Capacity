import { useState, useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets, Role } from '../types';
import { ROLES } from '../types';
import {
  formatCurrency,
} from '../utils/margins';
import {
  computeTeamCapacityByMonth,
  computeTotalDemandByMonth,
} from '../utils/simulation';
import type { MonthlyAggregate } from '../utils/simulation';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line, ReferenceLine, Cell, BarChart,
} from 'recharts';
import { RotateCcw, Users, Plus, Trash2, Edit2, Check, X, Zap, Save, Download, TrendingUp } from 'lucide-react';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateToMonthLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = Number(iso.split('-')[1]);
  return m >= 1 && m <= 12 ? SHORT_MONTHS[m - 1] : null;
}

interface SimulatedProject {
  id: string;
  name: string;
  deployRevenue: number;
  runRevenue: number;
  kickOff: string;
  goLive: string;
}

interface SimTeamMember {
  id: string;
  name: string;
  role: Role;
  q1Days: number;
  q2Days: number;
  q3Days: number;
  q4Days: number;
  dailyRate: number;
  isNew: boolean;
}

function simProjectToProjectRow(sp: SimulatedProject): ProjectRow {
  return {
    id: sp.id,
    account: 'Simulated',
    project: sp.name,
    deployRevenue: sp.deployRevenue,
    deployConso: 0,
    runRevenue: sp.runRevenue,
    runConso: 0,
    status: 'Simulated',
    kickOff: sp.kickOff,
    goLive: sp.goLive,
    contractEnd: '',
  };
}

interface SimulationProps {
  projects: ProjectRow[];
  members: TeamMember[];
  targets: Targets;
  updateDate?: string;
}

type SimTab = 'capacity' | 'financial';

export function Simulation({ projects, members, targets, updateDate }: SimulationProps) {
  const [simTab, setSimTab] = useState<SimTab>('capacity');
  const [simProjects, setSimProjects] = useState<SimulatedProject[]>([]);

  // Simulated team: start from real members, allow edits and additions
  const [simTeam, setSimTeam] = useState<SimTeamMember[]>([]);
  const [simTeamInited, setSimTeamInited] = useState(false);

  if (!simTeamInited && members.length > 0) {
    setSimTeam(members.map(m => ({ ...m, isNew: false })));
    setSimTeamInited(true);
  }

  const resetSimTeam = () => {
    setSimTeam(members.map(m => ({ ...m, isNew: false })));
  };

  const simTeamAsMembers: TeamMember[] = useMemo(
    () => simTeam.map(({ isNew, ...rest }) => rest),
    [simTeam],
  );

  const hasTeamChanges = useMemo(() => {
    if (simTeam.length !== members.length) return true;
    return simTeam.some(sm => {
      if (sm.isNew) return true;
      const orig = members.find(m => m.id === sm.id);
      if (!orig) return true;
      return sm.q1Days !== orig.q1Days || sm.q2Days !== orig.q2Days ||
        sm.q3Days !== orig.q3Days || sm.q4Days !== orig.q4Days ||
        sm.dailyRate !== orig.dailyRate || sm.role !== orig.role || sm.name !== orig.name;
    });
  }, [simTeam, members]);

  const allProjects = useMemo(() => {
    const simRows = simProjects.map(simProjectToProjectRow);
    return [...projects, ...simRows];
  }, [projects, simProjects]);

  const demandByMonth = useMemo(
    () => computeTotalDemandByMonth(allProjects, targets, 2026, updateDate),
    [allProjects, targets, updateDate],
  );
  const simCapacity = useMemo(
    () => computeTeamCapacityByMonth(simTeamAsMembers),
    [simTeamAsMembers],
  );
  const baseCapacity = useMemo(
    () => computeTeamCapacityByMonth(members),
    [members],
  );

  const hasSimProjects = simProjects.length > 0;
  const hasAnyChanges = hasTeamChanges || hasSimProjects;

  const resetAll = () => {
    resetSimTeam();
    setSimProjects([]);
  };

  const SIM_SNAPSHOT_KEY = 'cx-app-sim-snapshot';

  const saveSnapshot = () => {
    const snapshot = { simTeam, simProjects, savedAt: new Date().toISOString() };
    localStorage.setItem(SIM_SNAPSHOT_KEY, JSON.stringify(snapshot));
    setSavedAt(snapshot.savedAt);
  };

  const [savedAt, setSavedAt] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(SIM_SNAPSHOT_KEY);
      if (raw) { return JSON.parse(raw).savedAt || null; }
    } catch { /* ignore */ }
    return null;
  });

  const loadSnapshot = () => {
    try {
      const raw = localStorage.getItem(SIM_SNAPSHOT_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      if (snapshot.simTeam) { setSimTeam(snapshot.simTeam); setSimTeamInited(true); }
      if (snapshot.simProjects) setSimProjects(snapshot.simProjects);
    } catch { /* ignore */ }
  };

  const capacityForChart = hasTeamChanges ? simCapacity : baseCapacity;

  const MAX_JH_PER_QUARTER = 55;
  const PROTECTED_ROLES: Role[] = ['CSM', 'PMO'];
  const ADJUSTABLE_ROLES: Role[] = ROLES.filter(r => !PROTECTED_ROLES.includes(r));

  /** Auto-balance: adjust non-protected roles so capacity ≈ demand.
   *  Rules:
   *  - Past and current quarters are frozen (only future quarters change)
   *  - CSM and PMO are never reduced
   *  - Cap at 55 JH/person/quarter */
  const autoBalance = () => {
    const today = new Date();
    const currentQ = Math.floor(today.getMonth() / 3); // 0-based: 0=Q1, 1=Q2…

    // Sum demand per quarter from monthly demand data
    const demandQ = [0, 0, 0, 0];
    for (let m = 0; m < 12; m++) {
      const q = Math.floor(m / 3);
      demandQ[q] += demandByMonth[m]?.total || 0;
    }

    // Sum capacity from non-adjustable (protected) roles per quarter
    const qKeys = ['q1Days', 'q2Days', 'q3Days', 'q4Days'] as const;
    const nonAdjCapQ = [0, 0, 0, 0];
    for (const m of simTeam) {
      if (PROTECTED_ROLES.includes(m.role)) {
        nonAdjCapQ[0] += m.q1Days;
        nonAdjCapQ[1] += m.q2Days;
        nonAdjCapQ[2] += m.q3Days;
        nonAdjCapQ[3] += m.q4Days;
      }
    }

    // Target adjustable capacity per quarter
    const targetAdjCapQ = demandQ.map((d, q) => Math.max(0, d - nonAdjCapQ[q]));

    const adjustableIds = simTeam
      .filter(m => ADJUSTABLE_ROLES.includes(m.role))
      .map(m => m.id);
    if (adjustableIds.length === 0) return;

    // Build a map of new values: memberId -> { q1Days, q2Days, q3Days, q4Days }
    const newValues: Record<string, Record<string, number>> = {};
    for (const id of adjustableIds) {
      const m = simTeam.find(t => t.id === id)!;
      newValues[id] = { q1Days: m.q1Days, q2Days: m.q2Days, q3Days: m.q3Days, q4Days: m.q4Days };
    }

    // Only adjust future quarters — past and current are frozen
    for (let q = 0; q < 4; q++) {
      const key = qKeys[q];

      if (q <= currentQ) continue; // past and current quarter: frozen

      // Sort by current days descending — keep the busiest, zero out least busy first
      const sorted = [...adjustableIds].sort((a, b) => {
        const aVal = simTeam.find(t => t.id === a)![key];
        const bVal = simTeam.find(t => t.id === b)![key];
        return bVal - aVal;
      });

      // Future quarters: fill busiest first, zero out the rest
      let remaining = targetAdjCapQ[q];

      for (const id of sorted) {
        if (remaining <= 0) {
          newValues[id][key] = 0;
        } else {
          const give = Math.min(MAX_JH_PER_QUARTER, remaining);
          newValues[id][key] = Math.round(give);
          remaining -= give;
        }
      }
    }

    setSimTeam(prev =>
      prev.map(m => {
        if (!ADJUSTABLE_ROLES.includes(m.role)) return m;
        const vals = newValues[m.id];
        return {
          ...m,
          q1Days: vals.q1Days,
          q2Days: vals.q2Days,
          q3Days: vals.q3Days,
          q4Days: vals.q4Days,
        };
      }),
    );
  };

  const addSimProject = (sp: SimulatedProject) => {
    setSimProjects(prev => [...prev, sp]);
  };
  const removeSimProject = (id: string) => {
    setSimProjects(prev => prev.filter(p => p.id !== id));
  };

  const updateSimMember = (updated: SimTeamMember) => {
    setSimTeam(prev => prev.map(m => m.id === updated.id ? updated : m));
  };
  const addSimMember = (m: SimTeamMember) => {
    setSimTeam(prev => [...prev, m]);
  };
  const removeSimMember = (id: string) => {
    setSimTeam(prev => prev.filter(m => m.id !== id));
  };

  // Financial summary data
  const financialData = useMemo(() => {
    const totalDeployRev = allProjects.reduce((s, p) => s + p.deployRevenue, 0);
    const totalRunRev = allProjects.reduce((s, p) => s + p.runRevenue, 0);
    const totalRevenue = totalDeployRev + totalRunRev;

    // Team cost from simulated team
    const teamCost = simTeamAsMembers.reduce((s, m) =>
      s + (m.q1Days + m.q2Days + m.q3Days + m.q4Days) * m.dailyRate, 0);

    // Base team cost (original team)
    const baseTeamCost = members.reduce((s, m) =>
      s + (m.q1Days + m.q2Days + m.q3Days + m.q4Days) * m.dailyRate, 0);

    // Quarterly breakdown
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const qKeys = ['q1Days', 'q2Days', 'q3Days', 'q4Days'] as const;
    const quarterlyData = quarters.map((q, qi) => {
      const simCost = simTeamAsMembers.reduce((s, m) => s + m[qKeys[qi]] * m.dailyRate, 0);
      const baseCost = members.reduce((s, m) => s + m[qKeys[qi]] * m.dailyRate, 0);
      // Quarterly revenue: spread evenly for simplicity (demand-weighted would be more accurate)
      const qDemand = demandByMonth.slice(qi * 3, qi * 3 + 3).reduce((s, d) => s + d.total, 0);
      const totalDemand = demandByMonth.reduce((s, d) => s + d.total, 0);
      const qRevShare = totalDemand > 0 ? qDemand / totalDemand : 0.25;
      const qRevenue = totalRevenue * qRevShare;
      return {
        quarter: q,
        revenue: Math.round(qRevenue),
        simCost: Math.round(simCost),
        baseCost: Math.round(baseCost),
        simMargin: qRevenue > 0 ? Math.round(((qRevenue - simCost) / qRevenue) * 1000) / 10 : 0,
        baseMargin: qRevenue > 0 ? Math.round(((qRevenue - baseCost) / qRevenue) * 1000) / 10 : 0,
      };
    });

    const simMargin = totalRevenue > 0 ? Math.round(((totalRevenue - teamCost) / totalRevenue) * 1000) / 10 : 0;
    const baseMargin = totalRevenue > 0 ? Math.round(((totalRevenue - baseTeamCost) / totalRevenue) * 1000) / 10 : 0;

    // Per-account margin breakdown
    const accountMap = new Map<string, { revenue: number; }>();
    for (const p of allProjects) {
      const existing = accountMap.get(p.account) || { revenue: 0 };
      existing.revenue += p.deployRevenue + p.runRevenue;
      accountMap.set(p.account, existing);
    }
    const accountBreakdown = [...accountMap.entries()]
      .map(([account, data]) => {
        // Allocate team cost proportionally to revenue share
        const revShare = totalRevenue > 0 ? data.revenue / totalRevenue : 0;
        const allocatedCost = teamCost * revShare;
        const margin = data.revenue > 0 ? Math.round(((data.revenue - allocatedCost) / data.revenue) * 1000) / 10 : 0;
        return { account, revenue: data.revenue, cost: Math.round(allocatedCost), margin };
      })
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalRevenue, totalDeployRev, totalRunRev,
      teamCost, baseTeamCost,
      simMargin, baseMargin,
      quarterlyData, accountBreakdown,
    };
  }, [allProjects, simTeamAsMembers, members, demandByMonth]);

  return (
    <div className="page">
      <div className="sim-header">
        <h2 style={{ marginBottom: 0 }}>Simulation</h2>
        {updateDate && (
          <div className="update-date-badge">
            <span className="update-date-label">Data as of</span>
            <span className="update-date-value">{updateDate}</span>
          </div>
        )}
      </div>
      <p className="settings-desc">
        Simulate capacity changes by editing team members or adding hypothetical projects. Changes here are not saved.
      </p>

      {/* Tabs */}
      <div className="proj-tabs" style={{ marginBottom: 16 }}>
        <button className={`sim-tab ${simTab === 'capacity' ? 'active' : ''}`} onClick={() => setSimTab('capacity')}>
          Capacity Planning
        </button>
        <button className={`sim-tab ${simTab === 'financial' ? 'active' : ''}`} onClick={() => setSimTab('financial')}>
          <TrendingUp size={14} /> Financial Summary
        </button>
      </div>

      {simTab === 'capacity' && (
        <>
          <div className="sim-header">
            <h3>Demand vs Capacity by Month (JH)</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {hasAnyChanges && (
                <button className="btn btn-secondary" onClick={saveSnapshot}>
                  <Save size={14} /> Save Snapshot
                </button>
              )}
              {savedAt && (
                <button className="btn btn-secondary" onClick={loadSnapshot}>
                  <Download size={14} /> Load Snapshot
                </button>
              )}
              {hasAnyChanges && (
                <button className="btn btn-secondary" onClick={resetAll}>
                  <RotateCcw size={14} /> Reset All
                </button>
              )}
            </div>
          </div>
          <DemandCapacityChart demand={demandByMonth} capacity={capacityForChart} updateMonthLabel={dateToMonthLabel(updateDate)} />

          {/* Simulated Projects Section */}
          <div className="sim-header">
            <h3><Plus size={18} /> Simulate New Projects</h3>
          </div>
          <p className="settings-desc">
            Add hypothetical projects to see how they impact demand. These are not saved to your project list.
          </p>
          <AddSimProjectForm onAdd={addSimProject} />
          {simProjects.length > 0 && (
            <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project Name</th>
                    <th className="right">Deploy (&euro;)</th>
                    <th className="right">RUN (&euro;)</th>
                    <th>Kick-off</th>
                    <th>Go-live</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {simProjects.map(sp => (
                    <tr key={sp.id}>
                      <td className="customer-name">{sp.name}</td>
                      <td className="right">{sp.deployRevenue > 0 ? formatCurrency(sp.deployRevenue) : '\u2014'}</td>
                      <td className="right">{sp.runRevenue > 0 ? formatCurrency(sp.runRevenue) : '\u2014'}</td>
                      <td className="date-cell">{sp.kickOff || '\u2014'}</td>
                      <td className="date-cell">{sp.goLive || '\u2014'}</td>
                      <td>
                        <button className="btn-icon" onClick={() => removeSimProject(sp.id)} title="Remove">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Simulated Team */}
          <div className="sim-header" style={{ marginTop: 24 }}>
            <h3><Users size={18} /> Adjust Team Capacity</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={autoBalance} title="Scale team days so capacity matches demand per quarter">
                <Zap size={14} /> Auto-balance
              </button>
              {hasTeamChanges && (
                <button className="btn btn-secondary" onClick={resetSimTeam}>
                  <RotateCcw size={14} /> Reset Team
                </button>
              )}
            </div>
          </div>
          <p className="settings-desc">
            Edit existing team members or add new ones to simulate capacity changes. Auto-balance scales each member's quarterly days so total capacity matches demand. You can then adjust manually.
          </p>
          <SimTeamTable
            simTeam={simTeam}
            updateMember={updateSimMember}
            removeMember={removeSimMember}
            addMember={addSimMember}
          />
        </>
      )}

      {simTab === 'financial' && (
        <FinancialSummary
          data={financialData}
          hasTeamChanges={hasTeamChanges}
          hasSimProjects={hasSimProjects}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

interface FinancialData {
  totalRevenue: number;
  totalDeployRev: number;
  totalRunRev: number;
  teamCost: number;
  baseTeamCost: number;
  simMargin: number;
  baseMargin: number;
  quarterlyData: { quarter: string; revenue: number; simCost: number; baseCost: number; simMargin: number; baseMargin: number }[];
  accountBreakdown: { account: string; revenue: number; cost: number; margin: number }[];
}

function FinancialSummary({ data, hasTeamChanges, hasSimProjects }: { data: FinancialData; hasTeamChanges: boolean; hasSimProjects: boolean }) {
  const hasChanges = hasTeamChanges || hasSimProjects;
  const marginDelta = data.simMargin - data.baseMargin;

  return (
    <>
      {/* KPI summary */}
      <div className="projection-global" style={{ marginBottom: 24 }}>
        <div className="projection-global-card">
          <h4>Margin Forecast {hasChanges ? '(Simulated)' : '(Baseline)'}</h4>
          <div className="projection-kpi-row">
            <div className="projection-kpi">
              <span className="projection-kpi-label">Total Revenue</span>
              <span className="projection-kpi-value">{formatCurrency(data.totalRevenue)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Team Cost</span>
              <span className="projection-kpi-value">{formatCurrency(data.teamCost)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Margin</span>
              <span className={`projection-kpi-value ${data.simMargin >= 0 ? 'healthy' : 'unhealthy'}`}>
                {data.simMargin}%
              </span>
            </div>
            {hasChanges && (
              <div className="projection-kpi">
                <span className="projection-kpi-label">vs Baseline</span>
                <span className={`projection-kpi-value ${marginDelta >= 0 ? 'healthy' : 'unhealthy'}`}>
                  {marginDelta >= 0 ? '+' : ''}{marginDelta.toFixed(1)}pp
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quarterly margin chart */}
      <h3>Quarterly Margin Forecast</h3>
      <div className="chart-container chart-full-width">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={data.quarterlyData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="eur" tickFormatter={v => formatCurrency(v as number)} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
            <Tooltip formatter={(value, name) => {
              if (String(name).includes('Margin')) return [`${Number(value).toFixed(1)}%`, name];
              return [formatCurrency(value as number), name];
            }} />
            <Legend />
            <Bar yAxisId="eur" dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="eur" dataKey="simCost" name="Sim. Team Cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            {hasChanges && <Bar yAxisId="eur" dataKey="baseCost" name="Base Team Cost" fill="#cbd5e1" radius={[4, 4, 0, 0]} />}
            <Line yAxisId="pct" dataKey="simMargin" name="Sim. Margin %" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
            {hasChanges && <Line yAxisId="pct" dataKey="baseMargin" name="Base Margin %" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Quarterly table */}
      <h3>Quarterly Breakdown</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Quarter</th>
              <th className="right">Revenue</th>
              <th className="right">{hasChanges ? 'Sim. Cost' : 'Team Cost'}</th>
              {hasChanges && <th className="right">Base Cost</th>}
              <th className="right">{hasChanges ? 'Sim. Margin' : 'Margin'}</th>
              {hasChanges && <th className="right">Base Margin</th>}
            </tr>
          </thead>
          <tbody>
            {data.quarterlyData.map(q => (
              <tr key={q.quarter}>
                <td><strong>{q.quarter}</strong></td>
                <td className="right">{formatCurrency(q.revenue)}</td>
                <td className="right">{formatCurrency(q.simCost)}</td>
                {hasChanges && <td className="right">{formatCurrency(q.baseCost)}</td>}
                <td className="right">
                  <span className={`badge ${q.simMargin >= 0 ? 'healthy' : 'unhealthy'}`}>{q.simMargin}%</span>
                </td>
                {hasChanges && (
                  <td className="right">
                    <span className={`badge ${q.baseMargin >= 0 ? 'healthy' : 'unhealthy'}`}>{q.baseMargin}%</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Annual</strong></td>
              <td className="right"><strong>{formatCurrency(data.totalRevenue)}</strong></td>
              <td className="right"><strong>{formatCurrency(data.teamCost)}</strong></td>
              {hasChanges && <td className="right"><strong>{formatCurrency(data.baseTeamCost)}</strong></td>}
              <td className="right">
                <strong><span className={`badge ${data.simMargin >= 0 ? 'healthy' : 'unhealthy'}`}>{data.simMargin}%</span></strong>
              </td>
              {hasChanges && (
                <td className="right">
                  <strong><span className={`badge ${data.baseMargin >= 0 ? 'healthy' : 'unhealthy'}`}>{data.baseMargin}%</span></strong>
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Account margin breakdown */}
      <h3>Margin by Account (Simulated Cost Allocation)</h3>
      <div className="chart-container chart-full-width">
        <ResponsiveContainer width="100%" height={Math.max(300, data.accountBreakdown.length * 32)}>
          <BarChart data={data.accountBreakdown} layout="vertical" margin={{ top: 5, right: 30, left: 140, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
            <YAxis type="category" dataKey="account" width={130} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Margin']} />
            <Legend />
            <ReferenceLine x={0} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={2} label={{ value: 'Break-even', position: 'top', fontSize: 12 }} />
            <Bar dataKey="margin" name="Forecast Margin" radius={[0, 4, 4, 0]}>
              {data.accountBreakdown.map((entry, i) => (
                <Cell key={i} fill={entry.margin >= 0 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Account detail table */}
      <div className="table-wrapper" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th className="right">Revenue</th>
              <th className="right">Allocated Cost</th>
              <th className="right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {data.accountBreakdown.map(row => (
              <tr key={row.account}>
                <td className="customer-name">{row.account}</td>
                <td className="right">{formatCurrency(row.revenue)}</td>
                <td className="right">{formatCurrency(row.cost)}</td>
                <td className="right">
                  <span className={`badge ${row.margin >= 0 ? 'healthy' : 'unhealthy'}`}>{row.margin}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SimTeamTable({ simTeam, updateMember, removeMember, addMember }: {
  simTeam: SimTeamMember[];
  updateMember: (m: SimTeamMember) => void;
  removeMember: (id: string) => void;
  addMember: (m: SimTeamMember) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SimTeamMember | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState<SimTeamMember>({
    id: '', name: '', role: 'CSM', q1Days: 0, q2Days: 0, q3Days: 0, q4Days: 0, dailyRate: 400, isNew: true,
  });

  const startEdit = (m: SimTeamMember) => { setEditingId(m.id); setEditForm({ ...m }); };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };
  const saveEdit = () => { if (editForm) { updateMember(editForm); cancelEdit(); } };

  const handleAdd = () => {
    if (!newForm.name.trim()) return;
    addMember({ ...newForm, id: `sim-tm-${Date.now().toString(36)}` });
    setNewForm({ id: '', name: '', role: 'CSM', q1Days: 0, q2Days: 0, q3Days: 0, q4Days: 0, dailyRate: 400, isNew: true });
    setShowAddForm(false);
  };

  const totalDays = simTeam.reduce((s, m) => s + m.q1Days + m.q2Days + m.q3Days + m.q4Days, 0);
  const totalCost = simTeam.reduce((s, m) => s + (m.q1Days + m.q2Days + m.q3Days + m.q4Days) * m.dailyRate, 0);

  return (
    <>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th className="right">Q1</th>
              <th className="right">Q2</th>
              <th className="right">Q3</th>
              <th className="right">Q4</th>
              <th className="right">Total Days</th>
              <th className="right">Rate/day</th>
              <th className="right">Total Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {simTeam.map(m => {
              const isEditing = editingId === m.id;
              const ef = editForm!;
              const total = m.q1Days + m.q2Days + m.q3Days + m.q4Days;

              if (isEditing && ef) {
                const efTotal = ef.q1Days + ef.q2Days + ef.q3Days + ef.q4Days;
                return (
                  <tr key={m.id} className="editing-row">
                    <td><input className="input input-table" value={ef.name} onChange={e => setEditForm({ ...ef, name: e.target.value })} /></td>
                    <td>
                      <select className="input input-table" value={ef.role} onChange={e => setEditForm({ ...ef, role: e.target.value as Role })}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.q1Days} onChange={e => setEditForm({ ...ef, q1Days: Number(e.target.value) })} style={{ width: 50 }} /></td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.q2Days} onChange={e => setEditForm({ ...ef, q2Days: Number(e.target.value) })} style={{ width: 50 }} /></td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.q3Days} onChange={e => setEditForm({ ...ef, q3Days: Number(e.target.value) })} style={{ width: 50 }} /></td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.q4Days} onChange={e => setEditForm({ ...ef, q4Days: Number(e.target.value) })} style={{ width: 50 }} /></td>
                    <td className="right">{efTotal}</td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.dailyRate} onChange={e => setEditForm({ ...ef, dailyRate: Number(e.target.value) })} style={{ width: 60 }} /></td>
                    <td className="right">{formatCurrency(efTotal * ef.dailyRate)}</td>
                    <td className="actions-cell">
                      <button className="btn-icon btn-icon-success" onClick={saveEdit} title="Save"><Check size={14} /></button>
                      <button className="btn-icon" onClick={cancelEdit} title="Cancel"><X size={14} /></button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={m.id} className={m.isNew ? 'sim-new-row' : ''}>
                  <td className="customer-name">
                    {m.name}
                    {m.isNew && <span className="badge" style={{ marginLeft: 6, background: '#dbeafe', color: '#1d4ed8' }}>New</span>}
                  </td>
                  <td><span className="badge role-badge">{m.role}</span></td>
                  <td className="right">{m.q1Days}</td>
                  <td className="right">{m.q2Days}</td>
                  <td className="right">{m.q3Days}</td>
                  <td className="right">{m.q4Days}</td>
                  <td className="right">{total}</td>
                  <td className="right">{formatCurrency(m.dailyRate)}</td>
                  <td className="right">{formatCurrency(total * m.dailyRate)}</td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => startEdit(m)} title="Edit"><Edit2 size={14} /></button>
                    {m.isNew && (
                      <button className="btn-icon" onClick={() => removeMember(m.id)} title="Remove"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total ({simTeam.length})</strong></td>
              <td></td>
              <td className="right"><strong>{simTeam.reduce((s, m) => s + m.q1Days, 0)}</strong></td>
              <td className="right"><strong>{simTeam.reduce((s, m) => s + m.q2Days, 0)}</strong></td>
              <td className="right"><strong>{simTeam.reduce((s, m) => s + m.q3Days, 0)}</strong></td>
              <td className="right"><strong>{simTeam.reduce((s, m) => s + m.q4Days, 0)}</strong></td>
              <td className="right"><strong>{totalDays}</strong></td>
              <td className="right"><strong>{totalDays > 0 ? formatCurrency(Math.round(totalCost / totalDays)) : '\u2014'}</strong></td>
              <td className="right"><strong>{formatCurrency(totalCost)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showAddForm ? (
        <div className="add-member-form">
          <input className="input" placeholder="Name" value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} />
          <select className="input" value={newForm.role} onChange={e => setNewForm({ ...newForm, role: e.target.value as Role })}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className="input input-sm" type="number" placeholder="Q1" min={0} value={newForm.q1Days || ''} onChange={e => setNewForm({ ...newForm, q1Days: Number(e.target.value) })} />
          <input className="input input-sm" type="number" placeholder="Q2" min={0} value={newForm.q2Days || ''} onChange={e => setNewForm({ ...newForm, q2Days: Number(e.target.value) })} />
          <input className="input input-sm" type="number" placeholder="Q3" min={0} value={newForm.q3Days || ''} onChange={e => setNewForm({ ...newForm, q3Days: Number(e.target.value) })} />
          <input className="input input-sm" type="number" placeholder="Q4" min={0} value={newForm.q4Days || ''} onChange={e => setNewForm({ ...newForm, q4Days: Number(e.target.value) })} />
          <input className="input input-sm" type="number" placeholder="Rate" min={0} value={newForm.dailyRate || ''} onChange={e => setNewForm({ ...newForm, dailyRate: Number(e.target.value) })} />
          <button className="btn btn-primary" onClick={handleAdd} disabled={!newForm.name.trim()}>
            <Check size={14} /> Add
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
            <X size={14} /> Cancel
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)} style={{ marginTop: 8 }}>
          <Plus size={14} /> Add Simulated Member
        </button>
      )}
    </>
  );
}

function AddSimProjectForm({ onAdd }: { onAdd: (sp: SimulatedProject) => void }) {
  const [name, setName] = useState('');
  const [deployRevenue, setDeployRevenue] = useState(0);
  const [runRevenue, setRunRevenue] = useState(0);
  const [kickOff, setKickOff] = useState('');
  const [goLive, setGoLive] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({
      id: `sim-${Date.now().toString(36)}`,
      name: name.trim(),
      deployRevenue,
      runRevenue,
      kickOff,
      goLive,
    });
    setName('');
    setDeployRevenue(0);
    setRunRevenue(0);
    setKickOff('');
    setGoLive('');
  };

  return (
    <div className="add-sim-project-form">
      <div className="sim-project-fields">
        <input
          type="text"
          placeholder="Project name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="number"
          placeholder="Deploy (€)"
          value={deployRevenue || ''}
          onChange={e => setDeployRevenue(Number(e.target.value))}
          className="input input-sm"
        />
        <input
          type="number"
          placeholder="RUN (€)"
          value={runRevenue || ''}
          onChange={e => setRunRevenue(Number(e.target.value))}
          className="input input-sm"
        />
        <label className="date-field">
          <span>Kick-off</span>
          <input
            type="date"
            value={kickOff}
            onChange={e => setKickOff(e.target.value)}
            className="input input-sm"
          />
        </label>
        <label className="date-field">
          <span>Go-live</span>
          <input
            type="date"
            value={goLive}
            onChange={e => setGoLive(e.target.value)}
            className="input input-sm"
          />
        </label>
        <button className="btn btn-primary" onClick={handleAdd} disabled={!name.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

function DemandCapacityChart({ demand, capacity, updateMonthLabel }: { demand: MonthlyAggregate[]; capacity: MonthlyAggregate[]; updateMonthLabel?: string | null }) {
  const chartData = demand.map(d => {
    const cAgg = capacity.find(a => a.month === d.month);
    return { month: d.label, demand: d.total, capacity: cAgg?.total || 0 };
  });

  if (chartData.length === 0) {
    return <div className="empty-state">No data to display. Import projects and add team members.</div>;
  }

  return (
    <div className="chart-container chart-full-width">
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={v => `${v}`} tick={{ fontSize: 12 }} label={{ value: 'JH', angle: -90, position: 'insideLeft', fontSize: 12 }} />
          <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)} JH`, String(name) === 'Demand' ? 'Demand' : 'Capacity']} />
          <Legend />
          <Bar dataKey="demand" name="Demand" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          <Line dataKey="capacity" name="Capacity" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
          {updateMonthLabel && (
            <ReferenceLine x={updateMonthLabel} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" label={{ value: 'Update date', position: 'top', fontSize: 11, fill: '#ef4444' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
