import { useState, useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets, Role, MonthField } from '../types';
import { ROLES, MONTH_KEYS, MONTH_LABELS_SHORT, totalDays as memberTotalDays } from '../types';
import {
  formatCurrency,
  isDeployComplete,
} from '../utils/margins';
import {
  computeTeamCapacityByMonth,
  computeTotalDemandByMonth,
  computeProjections,
} from '../utils/simulation';
import type { MonthlyAggregate, ProjectProjection } from '../utils/simulation';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line, ReferenceLine,
  BarChart, Cell,
} from 'recharts';
import { RotateCcw, Users, Plus, Trash2, Edit2, Check, X, Zap, Save, Download, TrendingUp, BarChart3 } from 'lucide-react';

const SHORT_MONTHS = MONTH_LABELS_SHORT;

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

interface SimTeamMember extends TeamMember {
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

type SimTab = 'capacity' | 'margins' | 'financial';

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
      for (const mk of MONTH_KEYS) {
        if (sm[mk] !== orig[mk]) return true;
      }
      return sm.dailyRate !== orig.dailyRate || sm.role !== orig.role || sm.name !== orig.name;
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

  const MAX_JH_PER_MONTH = 20;
  const PROTECTED_ROLES: Role[] = ['CSM', 'PMO'];
  const ADJUSTABLE_ROLES: Role[] = ROLES.filter(r => !PROTECTED_ROLES.includes(r));

  /** Auto-balance: adjust non-protected roles so capacity ≈ demand.
   *  Rules:
   *  - Past and current months are frozen (only future months change)
   *  - CSM and PMO are never reduced
   *  - Cap at 20 JH/person/month */
  const autoBalance = () => {
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-based

    // Sum capacity from non-adjustable (protected) roles per month
    const nonAdjCap = new Array(12).fill(0);
    for (const m of simTeam) {
      if (PROTECTED_ROLES.includes(m.role)) {
        for (let i = 0; i < 12; i++) {
          nonAdjCap[i] += m[MONTH_KEYS[i]];
        }
      }
    }

    // Target adjustable capacity per month
    const targetAdjCap = new Array(12).fill(0).map((_, i) =>
      Math.max(0, (demandByMonth[i]?.total || 0) - nonAdjCap[i])
    );

    const adjustableIds = simTeam
      .filter(m => ADJUSTABLE_ROLES.includes(m.role))
      .map(m => m.id);
    if (adjustableIds.length === 0) return;

    // Build a map of new values
    const newValues: Record<string, Record<string, number>> = {};
    for (const id of adjustableIds) {
      const m = simTeam.find(t => t.id === id)!;
      const vals: Record<string, number> = {};
      for (const mk of MONTH_KEYS) vals[mk] = m[mk];
      newValues[id] = vals;
    }

    // Only adjust future months
    for (let mi = 0; mi < 12; mi++) {
      const mk = MONTH_KEYS[mi];
      if (mi <= currentMonth) continue; // past and current month: frozen

      // Sort by current days descending
      const sorted = [...adjustableIds].sort((a, b) => {
        const aVal = simTeam.find(t => t.id === a)![mk as MonthField];
        const bVal = simTeam.find(t => t.id === b)![mk as MonthField];
        return bVal - aVal;
      });

      let remaining = targetAdjCap[mi];
      for (const id of sorted) {
        if (remaining <= 0) {
          newValues[id][mk] = 0;
        } else {
          const give = Math.min(MAX_JH_PER_MONTH, remaining);
          newValues[id][mk] = Math.round(give);
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
          m1: vals.m1, m2: vals.m2, m3: vals.m3,
          m4: vals.m4, m5: vals.m5, m6: vals.m6,
          m7: vals.m7, m8: vals.m8, m9: vals.m9,
          m10: vals.m10, m11: vals.m11, m12: vals.m12,
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

  // Financial summary data — monthly breakdown
  const financialData = useMemo(() => {
    const totalDeployRev = allProjects.reduce((s, p) => s + p.deployRevenue, 0);
    const totalRunRev = allProjects.reduce((s, p) => s + p.runRevenue, 0);
    const totalRevenue = totalDeployRev + totalRunRev;

    const teamCost = simTeamAsMembers.reduce((s, m) => s + memberTotalDays(m) * m.dailyRate, 0);
    const baseTeamCost = members.reduce((s, m) => s + memberTotalDays(m) * m.dailyRate, 0);

    // Monthly breakdown
    const monthlyData = MONTH_LABELS_SHORT.map((label, mi) => {
      const mk = MONTH_KEYS[mi];
      const simCost = simTeamAsMembers.reduce((s, m) => s + m[mk] * m.dailyRate, 0);
      const baseCost = members.reduce((s, m) => s + m[mk] * m.dailyRate, 0);
      const mDemand = demandByMonth[mi]?.total || 0;
      const totalDemand = demandByMonth.reduce((s, d) => s + d.total, 0);
      const mRevShare = totalDemand > 0 ? mDemand / totalDemand : 1 / 12;
      const mRevenue = totalRevenue * mRevShare;
      return {
        month: label,
        revenue: Math.round(mRevenue),
        simCost: Math.round(simCost),
        baseCost: Math.round(baseCost),
        simMargin: mRevenue > 0 ? Math.round(((mRevenue - simCost) / mRevenue) * 1000) / 10 : 0,
        baseMargin: mRevenue > 0 ? Math.round(((mRevenue - baseCost) / mRevenue) * 1000) / 10 : 0,
      };
    });

    const simMargin = totalRevenue > 0 ? Math.round(((totalRevenue - teamCost) / totalRevenue) * 1000) / 10 : 0;
    const baseMargin = totalRevenue > 0 ? Math.round(((totalRevenue - baseTeamCost) / totalRevenue) * 1000) / 10 : 0;

    return {
      totalRevenue, totalDeployRev, totalRunRev,
      teamCost, baseTeamCost,
      simMargin, baseMargin,
      monthlyData,
    };
  }, [allProjects, simTeamAsMembers, members, demandByMonth]);

  // Margin projections (same logic as Projection page but with simulated data)
  const simProjections = useMemo(
    () => computeProjections(allProjects, targets),
    [allProjects, targets],
  );

  const deployProjections = useMemo(
    () => simProjections.filter(p => {
      const orig = allProjects.find(o => o.id === p.id);
      return orig && !isDeployComplete(orig);
    }),
    [simProjections, allProjects],
  );

  const baseProjections = useMemo(
    () => computeProjections(projects, targets),
    [projects, targets],
  );

  return (
    <div className="page">
      <div className="sim-header">
        <h2 style={{ marginBottom: 0 }}>Simulation</h2>
        {updateDate && (
          <div className="update-date-badge">
            <span className="update-date-label">Import date</span>
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
        <button className={`sim-tab ${simTab === 'margins' ? 'active' : ''}`} onClick={() => setSimTab('margins')}>
          <BarChart3 size={14} /> Margins
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
          <DemandCapacityChart demand={demandByMonth} capacity={capacityForChart} updateMonthLabel={dateToMonthLabel(updateDate)} updateDate={updateDate} />

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
              <button className="btn btn-primary" onClick={autoBalance} title="Scale team days so capacity matches demand per month">
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
            Edit existing team members or add new ones to simulate capacity changes. Auto-balance scales each member's monthly days so total capacity matches demand. You can then adjust manually.
          </p>
          <SimTeamTable
            simTeam={simTeam}
            updateMember={updateSimMember}
            removeMember={removeSimMember}
            addMember={addSimMember}
          />
        </>
      )}

      {simTab === 'margins' && (
        <SimMarginsDashboard
          simProjections={simProjections}
          baseProjections={baseProjections}
          deployProjections={deployProjections}
          allProjects={allProjects}
          projects={projects}
          targets={targets}
          hasAnyChanges={hasAnyChanges}
        />
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
  monthlyData: { month: string; revenue: number; simCost: number; baseCost: number; simMargin: number; baseMargin: number }[];
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

      {/* Monthly margin chart */}
      <h3>Monthly Margin Forecast</h3>
      <div className="chart-container chart-full-width">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={data.monthlyData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
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

      {/* Monthly table */}
      <h3>Monthly Breakdown</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="right">Revenue</th>
              <th className="right">{hasChanges ? 'Sim. Cost' : 'Team Cost'}</th>
              {hasChanges && <th className="right">Base Cost</th>}
              <th className="right">{hasChanges ? 'Sim. Margin' : 'Margin'}</th>
              {hasChanges && <th className="right">Base Margin</th>}
            </tr>
          </thead>
          <tbody>
            {data.monthlyData.map(row => (
              <tr key={row.month}>
                <td><strong>{row.month}</strong></td>
                <td className="right">{formatCurrency(row.revenue)}</td>
                <td className="right">{formatCurrency(row.simCost)}</td>
                {hasChanges && <td className="right">{formatCurrency(row.baseCost)}</td>}
                <td className="right">
                  <span className={`badge ${row.simMargin >= 0 ? 'healthy' : 'unhealthy'}`}>{row.simMargin}%</span>
                </td>
                {hasChanges && (
                  <td className="right">
                    <span className={`badge ${row.baseMargin >= 0 ? 'healthy' : 'unhealthy'}`}>{row.baseMargin}%</span>
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

    </>
  );
}

function SimMarginsDashboard({ simProjections, baseProjections, deployProjections, allProjects, projects, targets, hasAnyChanges }: {
  simProjections: ProjectProjection[];
  baseProjections: ProjectProjection[];
  deployProjections: ProjectProjection[];
  allProjects: ProjectRow[];
  projects: ProjectRow[];
  targets: Targets;
  hasAnyChanges: boolean;
}) {
  const phase1Ids = useMemo(() => {
    const ids = new Set<string>();
    allProjects.forEach(p => {
      if (!isDeployComplete(p) && p.runRevenue > 0) ids.add(p.id);
    });
    return ids;
  }, [allProjects]);

  // Sim projections
  const simDeployProjects = deployProjections.filter(p => p.deployRevenue > 0);
  const simRunProjects = simProjections.filter(p => p.runRevenue > 0 && phase1Ids.has(p.id));

  const simDeployRev = simDeployProjects.reduce((s, p) => s + p.deployRevenue, 0);
  const simDeployProjected = simDeployProjects.reduce((s, p) => s + p.deployProjected, 0);
  const simDeployMargin = simDeployRev > 0 ? Math.round(((simDeployRev - simDeployProjected) / simDeployRev) * 1000) / 10 : 0;
  const simDeployHealthy = simDeployProjects.filter(p => p.deployMarginProjected >= targets.deployMargin).length;

  const simRunRev = simRunProjects.reduce((s, p) => s + p.runRevenue, 0);
  const simRunProjected = simRunProjects.reduce((s, p) => s + p.runProjected, 0);
  const simRunMargin = simRunRev > 0 ? Math.round(((simRunRev - simRunProjected) / simRunRev) * 1000) / 10 : 0;
  const simRunHealthy = simRunProjects.filter(p => p.runMarginProjected >= targets.runMargin).length;

  // Combined global margin
  const allMarginProjects = simProjections.filter(p => p.deployRevenue > 0 || p.runRevenue > 0);
  const totalGlobalRev = simDeployRev + simRunRev;
  const totalGlobalProjected = simDeployProjected + simRunProjected;
  const combinedGlobalMargin = totalGlobalRev > 0 ? Math.round(((totalGlobalRev - totalGlobalProjected) / totalGlobalRev) * 1000) / 10 : 0;
  const globalHealthyCount = allMarginProjects.filter(p => {
    const rev = p.deployRevenue + p.runRevenue;
    const cost = p.deployProjected + p.runProjected;
    const margin = rev > 0 ? ((rev - cost) / rev) * 100 : 0;
    return margin >= targets.globalMargin;
  }).length;

  // Baseline projections (for comparison)
  const basePhase1Ids = useMemo(() => {
    const ids = new Set<string>();
    projects.forEach(p => {
      if (!isDeployComplete(p) && p.runRevenue > 0) ids.add(p.id);
    });
    return ids;
  }, [projects]);

  const baseDeployProjects = baseProjections.filter(p => {
    const orig = projects.find(o => o.id === p.id);
    return orig && !isDeployComplete(orig) && p.deployRevenue > 0;
  });
  const baseRunProjects = baseProjections.filter(p => p.runRevenue > 0 && basePhase1Ids.has(p.id));
  const baseDeployRev = baseDeployProjects.reduce((s, p) => s + p.deployRevenue, 0);
  const baseDeployProjected = baseDeployProjects.reduce((s, p) => s + p.deployProjected, 0);
  const baseDeployMargin = baseDeployRev > 0 ? Math.round(((baseDeployRev - baseDeployProjected) / baseDeployRev) * 1000) / 10 : 0;
  const baseRunRev = baseRunProjects.reduce((s, p) => s + p.runRevenue, 0);
  const baseRunProjected = baseRunProjects.reduce((s, p) => s + p.runProjected, 0);
  const baseRunMargin = baseRunRev > 0 ? Math.round(((baseRunRev - baseRunProjected) / baseRunRev) * 1000) / 10 : 0;
  const baseGlobalRev = baseDeployRev + baseRunRev;
  const baseGlobalProjected = baseDeployProjected + baseRunProjected;
  const baseGlobalMargin = baseGlobalRev > 0 ? Math.round(((baseGlobalRev - baseGlobalProjected) / baseGlobalRev) * 1000) / 10 : 0;

  // Chart data for per-project global margin
  const globalChartData = allMarginProjects
    .map(p => {
      const rev = p.deployRevenue + p.runRevenue;
      const cost = p.deployProjected + p.runProjected;
      const margin = rev > 0 ? Math.round(((rev - cost) / rev) * 1000) / 10 : 0;
      return {
        id: p.id,
        name: p.account,
        margin,
        healthy: margin >= targets.globalMargin,
      };
    })
    .sort((a, b) => b.margin - a.margin);

  const marginDelta = (m1: number, m2: number) => {
    const d = m1 - m2;
    if (d === 0) return null;
    return <span style={{ fontSize: 11, color: d >= 0 ? '#10b981' : '#ef4444', marginLeft: 6 }}>({d >= 0 ? '+' : ''}{d.toFixed(1)}pp vs baseline)</span>;
  };

  return (
    <>
      {/* Combined Global Margin Dashboard */}
      <div className="projection-global" style={{ marginBottom: 8 }}>
        <div className="projection-global-card" style={{ borderLeft: '4px solid #6366f1' }}>
          <h4>Global &mdash; Combined Projected Margin {hasAnyChanges ? '(Simulated)' : '(Baseline)'}</h4>
          <div className="projection-kpi-row">
            <div className="projection-kpi">
              <span className="projection-kpi-label">Total Revenue</span>
              <span className="projection-kpi-value">{formatCurrency(totalGlobalRev)}</span>
              <span className="projection-kpi-sub">Deploy: {formatCurrency(simDeployRev)} · RUN: {formatCurrency(simRunRev)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Total Projected Cost</span>
              <span className="projection-kpi-value">{formatCurrency(totalGlobalProjected)}</span>
              <span className="projection-kpi-sub">Deploy: {formatCurrency(simDeployProjected)} · RUN: {formatCurrency(simRunProjected)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Combined Margin</span>
              <span className={`projection-kpi-value ${combinedGlobalMargin >= targets.globalMargin ? 'healthy' : combinedGlobalMargin >= 0 ? 'warning' : 'unhealthy'}`}>
                {combinedGlobalMargin}%
              </span>
              <span className="projection-kpi-sub">
                Target: {targets.globalMargin}% · Deploy: {simDeployMargin}% · RUN: {simRunMargin}%
                {hasAnyChanges && marginDelta(combinedGlobalMargin, baseGlobalMargin)}
              </span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Projects</span>
              <span className="projection-kpi-value">{allMarginProjects.length}</span>
              <span className="projection-kpi-sub">{globalHealthyCount} healthy / {allMarginProjects.length - globalHealthyCount} at risk</span>
            </div>
          </div>
        </div>
      </div>

      {/* Deploy & RUN Margin Dashboard */}
      <div className="projection-global">
        <div className="projection-global-card">
          <h4>Deploy &mdash; Projected Margin {hasAnyChanges ? '(Simulated)' : ''}</h4>
          <div className="projection-kpi-row">
            <div className="projection-kpi">
              <span className="projection-kpi-label">Revenue</span>
              <span className="projection-kpi-value">{formatCurrency(simDeployRev)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Projected Cost</span>
              <span className="projection-kpi-value">{formatCurrency(simDeployProjected)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Projected Margin</span>
              <span className={`projection-kpi-value ${simDeployMargin >= targets.deployMargin ? 'healthy' : simDeployMargin >= 0 ? 'warning' : 'unhealthy'}`}>
                {simDeployMargin}%
              </span>
              <span className="projection-kpi-sub">
                Target: {targets.deployMargin}%
                {hasAnyChanges && marginDelta(simDeployMargin, baseDeployMargin)}
              </span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Projects</span>
              <span className="projection-kpi-value">{simDeployProjects.length}</span>
              <span className="projection-kpi-sub">{simDeployHealthy} healthy / {simDeployProjects.length - simDeployHealthy} at risk</span>
            </div>
          </div>
        </div>

        <div className="projection-global-card">
          <h4>RUN &mdash; Projected Margin {hasAnyChanges ? '(Simulated)' : ''}</h4>
          <div className="projection-kpi-row">
            <div className="projection-kpi">
              <span className="projection-kpi-label">Revenue</span>
              <span className="projection-kpi-value">{formatCurrency(simRunRev)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Projected Cost</span>
              <span className="projection-kpi-value">{formatCurrency(simRunProjected)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Projected Margin</span>
              <span className={`projection-kpi-value ${simRunMargin >= targets.runMargin ? 'healthy' : simRunMargin >= 0 ? 'warning' : 'unhealthy'}`}>
                {simRunMargin}%
              </span>
              <span className="projection-kpi-sub">
                Target: {targets.runMargin}%
                {hasAnyChanges && marginDelta(simRunMargin, baseRunMargin)}
              </span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Projects</span>
              <span className="projection-kpi-value">{simRunProjects.length}</span>
              <span className="projection-kpi-sub">{simRunHealthy} healthy / {simRunProjects.length - simRunHealthy} at risk</span>
            </div>
          </div>
        </div>
      </div>

      {/* Global margin per-project chart */}
      {globalChartData.length > 0 && (
        <>
          <h3>Global Margin by Project</h3>
          <div className="chart-container chart-full-width">
            <ResponsiveContainer width="100%" height={Math.max(300, globalChartData.length * 28)}>
              <BarChart data={globalChartData} layout="vertical" margin={{ top: 5, right: 20, left: 140, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Projected Margin']} />
                <ReferenceLine x={targets.globalMargin} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `${targets.globalMargin}%`, position: 'top', fontSize: 11 }} />
                <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                  {globalChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.healthy ? '#10b981' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Detail table */}
      <h3>Detail</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Project</th>
              <th className="right">Deploy Revenue</th>
              <th className="right">Deploy Projected</th>
              <th className="right">Deploy Margin</th>
              <th className="right">RUN Revenue</th>
              <th className="right">RUN Projected</th>
              <th className="right">RUN Margin</th>
            </tr>
          </thead>
          <tbody>
            {simProjections.filter(p => p.deployRevenue > 0 || p.runRevenue > 0).map(p => (
              <tr key={p.id}>
                <td className="customer-name">{p.account}</td>
                <td>{p.project}</td>
                <td className="right">{formatCurrency(p.deployRevenue)}</td>
                <td className="right">{formatCurrency(p.deployProjected)}</td>
                <td className="right">
                  <span className={`badge ${p.deployRevenue > 0 ? (p.deployMarginProjected >= targets.deployMargin ? 'healthy' : p.deployMarginProjected >= 0 ? 'warning' : 'unhealthy') : ''}`}>
                    {p.deployRevenue > 0 ? `${p.deployMarginProjected}%` : '\u2014'}
                  </span>
                </td>
                <td className="right">{formatCurrency(p.runRevenue)}</td>
                <td className="right">{formatCurrency(p.runProjected)}</td>
                <td className="right">
                  <span className={`badge ${p.runRevenue > 0 ? (p.runMarginProjected >= targets.runMargin ? 'healthy' : p.runMarginProjected >= 0 ? 'warning' : 'unhealthy') : ''}`}>
                    {p.runRevenue > 0 ? `${p.runMarginProjected}%` : '\u2014'}
                  </span>
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
    id: '', name: '', role: 'CSM',
    m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0,
    m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0,
    dailyRate: 400, isNew: true,
  });

  const startEdit = (m: SimTeamMember) => { setEditingId(m.id); setEditForm({ ...m }); };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };
  const saveEdit = () => { if (editForm) { updateMember(editForm); cancelEdit(); } };

  const handleAdd = () => {
    if (!newForm.name.trim()) return;
    addMember({ ...newForm, id: `sim-tm-${Date.now().toString(36)}` });
    setNewForm({
      id: '', name: '', role: 'CSM',
      m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0,
      m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0,
      dailyRate: 400, isNew: true,
    });
    setShowAddForm(false);
  };

  const td = simTeam.reduce((s, m) => s + memberTotalDays(m), 0);
  const totalCost = simTeam.reduce((s, m) => s + memberTotalDays(m) * m.dailyRate, 0);

  return (
    <>
      <div className="table-wrapper">
        <table className="data-table team-monthly-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              {MONTH_KEYS.map((mk, i) => (
                <th key={mk} className="right">{SHORT_MONTHS[i]}</th>
              ))}
              <th className="right">Total</th>
              <th className="right">Rate</th>
              <th className="right">Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {simTeam.map(m => {
              const isEditing = editingId === m.id;
              const ef = editForm!;
              const total = memberTotalDays(m);

              if (isEditing && ef) {
                const efTotal = memberTotalDays(ef);
                return (
                  <tr key={m.id} className="editing-row">
                    <td><input className="input input-table" value={ef.name} onChange={e => setEditForm({ ...ef, name: e.target.value })} /></td>
                    <td>
                      <select className="input input-table" value={ef.role} onChange={e => setEditForm({ ...ef, role: e.target.value as Role })}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    {MONTH_KEYS.map(mk => (
                      <td key={mk} className="right"><input className="input input-table input-sm" type="number" min={0} value={ef[mk]} onChange={e => setEditForm({ ...ef, [mk]: Number(e.target.value) })} style={{ width: 42 }} /></td>
                    ))}
                    <td className="right">{Math.round(efTotal)}</td>
                    <td className="right"><input className="input input-table input-sm" type="number" min={0} value={ef.dailyRate} onChange={e => setEditForm({ ...ef, dailyRate: Number(e.target.value) })} style={{ width: 60 }} /></td>
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
                  {MONTH_KEYS.map(mk => (
                    <td key={mk} className="right">{Math.round(m[mk])}</td>
                  ))}
                  <td className="right">{Math.round(total)}</td>
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
              {MONTH_KEYS.map(mk => (
                <td key={mk} className="right"><strong>{Math.round(simTeam.reduce((s, m) => s + m[mk], 0))}</strong></td>
              ))}
              <td className="right"><strong>{Math.round(td)}</strong></td>
              <td className="right"><strong>{td > 0 ? formatCurrency(Math.round(totalCost / td)) : '\u2014'}</strong></td>
              <td className="right"><strong>{formatCurrency(totalCost)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showAddForm ? (
        <div className="add-member-form add-member-monthly">
          <input className="input" placeholder="Name" value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} />
          <select className="input" value={newForm.role} onChange={e => setNewForm({ ...newForm, role: e.target.value as Role })}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {MONTH_KEYS.map((mk, i) => (
            <input key={mk} className="input input-sm" type="number" placeholder={SHORT_MONTHS[i]} min={0} value={newForm[mk] || ''} onChange={e => setNewForm({ ...newForm, [mk]: Number(e.target.value) })} />
          ))}
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

/** Classify a month label as actual or forecast relative to the update date */
function monthCategory(monthLabel: string, updateDate?: string): 'actual' | 'forecast' | null {
  if (!updateDate) return null;
  const updateMonthIdx = Number(updateDate.split('-')[1]) - 1;
  const monthIdx = SHORT_MONTHS.indexOf(monthLabel);
  if (monthIdx < 0) return null;
  return monthIdx <= updateMonthIdx ? 'actual' : 'forecast';
}

function DemandCapacityChart({ demand, capacity, updateMonthLabel, updateDate }: { demand: MonthlyAggregate[]; capacity: MonthlyAggregate[]; updateMonthLabel?: string | null; updateDate?: string }) {
  const chartData = demand.map(d => {
    const cAgg = capacity.find(a => a.month === d.month);
    const cat = monthCategory(d.label, updateDate);
    return {
      month: d.label,
      demand: d.total,
      actualDemand: cat === 'forecast' ? 0 : d.total,
      forecastDemand: cat === 'forecast' ? d.total : 0,
      capacity: cAgg?.total || 0,
    };
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
          <Tooltip
            formatter={(value, name) => {
              const v = Math.round(Number(value));
              if (v === 0) return [null, null];
              return [`${v} JH`, name];
            }}
            labelFormatter={(label) => {
              const cat = monthCategory(String(label), updateDate);
              return cat ? `${label} (${cat === 'actual' ? 'Actual' : 'Forecast'})` : String(label);
            }}
          />
          <Legend />
          {updateDate ? (
            <>
              <Bar dataKey="actualDemand" name="Consumption" stackId="demand" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="forecastDemand" name="Forecast" stackId="demand" fill="#fcd34d" radius={[4, 4, 0, 0]} />
            </>
          ) : (
            <Bar dataKey="demand" name="Demand" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          )}
          <Line dataKey="capacity" name="Capacity" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
          {updateMonthLabel && (
            <ReferenceLine x={updateMonthLabel} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" label={{ value: 'Update date', position: 'top', fontSize: 11, fill: '#ef4444' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
