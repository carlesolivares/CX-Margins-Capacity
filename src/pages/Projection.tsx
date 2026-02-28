import { useState, useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets } from '../types';
import { MONTH_KEYS, MONTH_LABELS_SHORT } from '../types';
import type { RevenueLineItem } from '../utils/fileParser';
import { formatCurrency, isDeployComplete } from '../utils/margins';
import {
  computeProjections,
  computeTotalDemandByMonth,
  computeTeamCapacityByMonth,
  computeDeploySimulation,
  computeRunSimulation,
  computeCashflowByMonth,
  getProjectColor,
} from '../utils/simulation';
import type { ProjectProjection, ProjectMonthlyJH, MonthlyAggregate } from '../utils/simulation';
import { useSort } from '../hooks/useSort';
import { SlidersHorizontal, Rocket, Play } from 'lucide-react';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, ReferenceLine, Cell,
  ComposedChart, Line, Legend, Area,
} from 'recharts';

type ProjTab = 'margins' | 'deploy-sim' | 'run-sim' | 'demand' | 'cashflow';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Convert ISO date "2026-02-19" → short month label "Feb" */
function dateToMonthLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = Number(iso.split('-')[1]);
  return m >= 1 && m <= 12 ? SHORT_MONTHS[m - 1] : null;
}

interface ProjectionProps {
  projects: ProjectRow[];
  members: TeamMember[];
  targets: Targets;
  updateDate?: string;
  revenueItems?: RevenueLineItem[];
}

export function Projection({ projects, members, targets, updateDate, revenueItems = [] }: ProjectionProps) {
  const [tab, setTab] = useState<ProjTab>('margins');
  const [runMarginOverrides, setRunMarginOverrides] = useState<Record<string, number>>({});
  const [showOverridePanel, setShowOverridePanel] = useState(false);
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null);

  const projections = useMemo(
    () => computeProjections(projects, targets),
    [projects, targets],
  );

  // Apply per-project RUN margin overrides for Phase 1 projects
  const adjustedProjections = useMemo(() => {
    return projections.map(p => {
      const override = runMarginOverrides[p.id];
      if (override === undefined || p.runRevenue <= 0) return p;
      const runProjected = Math.round(p.runRevenue * (100 - override) / 100);
      const runMarginProjected = Math.round(((p.runRevenue - runProjected) / p.runRevenue) * 1000) / 10;
      return { ...p, runProjected, runMarginProjected };
    });
  }, [projections, runMarginOverrides]);

  // Identify Phase 1 projects (deploy not complete)
  const phase1ProjectIds = useMemo(() => {
    const ids = new Set<string>();
    projects.forEach(p => {
      if (!isDeployComplete(p) && p.runRevenue > 0) ids.add(p.id);
    });
    return ids;
  }, [projects]);

  // Filter deploy-complete projects out of deploy views
  const deployProjections = useMemo(
    () => adjustedProjections.filter(p => {
      const orig = projects.find(o => o.id === p.id);
      return orig && !isDeployComplete(orig);
    }),
    [adjustedProjections, projects],
  );

  // Deploy & RUN simulations (stacked bar charts)
  const deploySim = useMemo(
    () => computeDeploySimulation(projects, targets, updateDate),
    [projects, targets, updateDate],
  );
  const runSim = useMemo(
    () => computeRunSimulation(projects, targets, updateDate),
    [projects, targets, updateDate],
  );

  if (projects.length === 0) {
    return (
      <div className="page">
        <h2>Projection</h2>
        <div className="empty-state">Import projects to see consumption projections.</div>
      </div>
    );
  }

  // Global margin KPIs
  const deployProjects = deployProjections.filter(p => p.deployRevenue > 0);
  const runProjects = adjustedProjections.filter(p => p.runRevenue > 0 && phase1ProjectIds.has(p.id));

  const totalDeployRev = deployProjects.reduce((s, p) => s + p.deployRevenue, 0);
  const totalDeployProjected = deployProjects.reduce((s, p) => s + p.deployProjected, 0);
  const globalDeployMargin = totalDeployRev > 0
    ? Math.round(((totalDeployRev - totalDeployProjected) / totalDeployRev) * 1000) / 10
    : 0;
  const deployHealthyCount = deployProjects.filter(p => p.deployMarginProjected >= targets.deployMargin).length;

  const totalRunRev = runProjects.reduce((s, p) => s + p.runRevenue, 0);
  const totalRunProjected = runProjects.reduce((s, p) => s + p.runProjected, 0);
  const globalRunMargin = totalRunRev > 0
    ? Math.round(((totalRunRev - totalRunProjected) / totalRunRev) * 1000) / 10
    : 0;
  const runHealthyCount = runProjects.filter(p => p.runMarginProjected >= targets.runMargin).length;

  const updateMonthLabel = dateToMonthLabel(updateDate);

  return (
    <div className="page">
      <div className="sim-header">
        <h2 style={{ marginBottom: 0 }}>Projection</h2>
        {updateDate && (
          <div className="update-date-badge">
            <span className="update-date-label">Data as of</span>
            <span className="update-date-value">{updateDate}</span>
          </div>
        )}
      </div>
      <p className="settings-desc">
        Extrapolates current consumption to the end of each phase based on elapsed time.
        Deploy: Kick-off &rarr; Go-live. RUN: Go-live &rarr; Dec 31, 2026.
        {updateDate && <> Consumed JH is real up to the update date; remaining budget is spread equally after.</>}
      </p>

      {/* Tab navigation */}
      <div className="sim-tabs">
        <button
          className={`sim-tab ${tab === 'margins' ? 'active' : ''}`}
          onClick={() => setTab('margins')}
        >
          Margins
        </button>
        <button
          className={`sim-tab ${tab === 'deploy-sim' ? 'active' : ''}`}
          onClick={() => setTab('deploy-sim')}
        >
          <Rocket size={14} /> Deploy Simulation
        </button>
        <button
          className={`sim-tab ${tab === 'run-sim' ? 'active' : ''}`}
          onClick={() => setTab('run-sim')}
        >
          <Play size={14} /> RUN Simulation
        </button>
        <button
          className={`sim-tab ${tab === 'demand' ? 'active' : ''}`}
          onClick={() => setTab('demand')}
        >
          Demand vs Capacity
        </button>
        <button
          className={`sim-tab ${tab === 'cashflow' ? 'active' : ''}`}
          onClick={() => setTab('cashflow')}
        >
          Cashflow
        </button>
      </div>

      {tab === 'margins' && (
        <>
          {/* Global Margin Dashboard */}
          <div className="projection-global">
            <div className="projection-global-card">
              <h4>Deploy &mdash; Global Projected Margin</h4>
              <div className="projection-kpi-row">
                <div className="projection-kpi">
                  <span className="projection-kpi-label">Revenue</span>
                  <span className="projection-kpi-value">{formatCurrency(totalDeployRev)}</span>
                </div>
                <div className="projection-kpi">
                  <span className="projection-kpi-label">Projected Cost</span>
                  <span className="projection-kpi-value">{formatCurrency(totalDeployProjected)}</span>
                </div>
                <div className="projection-kpi">
                  <span className="projection-kpi-label">Projected Margin</span>
                  <span className={`projection-kpi-value ${globalDeployMargin >= targets.deployMargin ? 'healthy' : globalDeployMargin >= 0 ? 'warning' : 'unhealthy'}`}>
                    {globalDeployMargin}%
                  </span>
                  <span className="projection-kpi-sub">Target: {targets.deployMargin}%</span>
                </div>
                <div className="projection-kpi">
                  <span className="projection-kpi-label">Projects</span>
                  <span className="projection-kpi-value">{deployProjects.length}</span>
                  <span className="projection-kpi-sub">{deployHealthyCount} healthy / {deployProjects.length - deployHealthyCount} at risk</span>
                </div>
              </div>
            </div>

            <div className="projection-global-card">
              <h4>RUN &mdash; Global Projected Margin</h4>
              <div className="projection-kpi-row">
                <div className="projection-kpi">
                  <span className="projection-kpi-label">Revenue</span>
                  <span className="projection-kpi-value">{formatCurrency(totalRunRev)}</span>
                </div>
                <div className="projection-kpi">
                  <span className="projection-kpi-label">Projected Cost</span>
                  <span className="projection-kpi-value">{formatCurrency(totalRunProjected)}</span>
                </div>
                <div className="projection-kpi">
                  <span className="projection-kpi-label">Projected Margin</span>
                  <span className={`projection-kpi-value ${globalRunMargin >= targets.runMargin ? 'healthy' : globalRunMargin >= 0 ? 'warning' : 'unhealthy'}`}>
                    {globalRunMargin}%
                  </span>
                  <span className="projection-kpi-sub">Target: {targets.runMargin}%</span>
                </div>
                <div className="projection-kpi">
                  <span className="projection-kpi-label">Projects</span>
                  <span className="projection-kpi-value">{runProjects.length}</span>
                  <span className="projection-kpi-sub">{runHealthyCount} healthy / {runProjects.length - runHealthyCount} at risk</span>
                </div>
              </div>
            </div>
          </div>

          {/* Deploy Projection */}
          <h3>Deploy &mdash; Projected Margin</h3>
          <ProjectionChart
            projections={deployProjections}
            type="deploy"
            threshold={targets.deployMargin}
          />

          {/* RUN Projection (Phase 1 only) */}
          <div className="sim-header">
            <h3>RUN &mdash; Projected Margin (Phase 1)</h3>
            {runProjects.length > 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowOverridePanel(o => !o)}
              >
                <SlidersHorizontal size={14} />
                {showOverridePanel ? 'Hide' : 'Adjust'} RUN Margin
              </button>
            )}
          </div>

          {showOverridePanel && runProjects.length > 0 && (
            <RunMarginOverridePanel
              projections={adjustedProjections}
              baseProjections={projections}
              phase1Ids={phase1ProjectIds}
              overrides={runMarginOverrides}
              onChange={(id, val) => setRunMarginOverrides(prev => ({ ...prev, [id]: val }))}
              onReset={() => setRunMarginOverrides({})}
              highlightedId={highlightedProjectId}
              clearHighlight={() => setHighlightedProjectId(null)}
            />
          )}

          <ProjectionChart
            projections={adjustedProjections.filter(p => phase1ProjectIds.has(p.id))}
            type="run"
            threshold={targets.runMargin}
            onBarClick={(id) => {
              setShowOverridePanel(true);
              setHighlightedProjectId(id);
            }}
          />

          {/* Detail table */}
          <h3>Detail</h3>
          <ProjectionTable projections={adjustedProjections} targets={targets} />
        </>
      )}

      {tab === 'deploy-sim' && (
        <DeployRunTab
          title="Deploy Simulation"
          subtitle="Deploy JH per project spread by month (Kick-off &rarr; Go-live)"
          perProject={deploySim.perProject}
          aggregated={deploySim.aggregated}
          emptyMessage="No projects with valid kick-off and go-live dates and deploy revenue."
          updateMonthLabel={updateMonthLabel}
        />
      )}

      {tab === 'run-sim' && (
        <DeployRunTab
          title="RUN Simulation"
          subtitle="RUN JH per project spread by month (Go-live &rarr; Dec 31). First 3 months weighted 3x/2x/1.5x (hypercare)."
          perProject={runSim.perProject}
          aggregated={runSim.aggregated}
          emptyMessage="No projects with valid go-live date and RUN revenue."
          updateMonthLabel={updateMonthLabel}
        />
      )}

      {tab === 'demand' && (
        <DemandCapacityTab projects={projects} members={members} targets={targets} updateDate={updateDate} updateMonthLabel={updateMonthLabel} />
      )}

      {tab === 'cashflow' && (
        <CashflowTab projects={projects} targets={targets} updateDate={updateDate} updateMonthLabel={updateMonthLabel} revenueItems={revenueItems} />
      )}
    </div>
  );
}

/* ─── Helpers ─── */

const MONTH_SHORT = MONTH_LABELS_SHORT;

interface MonthlyRow {
  projectId: string;
  account: string;
  project: string;
  color: string;
  months: number[]; // 12 values
  total: number;
}

function aggregateMonthlyRows(perProject: ProjectMonthlyJH[], year: number = 2026): MonthlyRow[] {
  return perProject.map((pp, i) => {
    const months = new Array(12).fill(0);
    for (const [mk, jh] of Object.entries(pp.months)) {
      const [y, mStr] = mk.split('-');
      if (Number(y) !== year) continue;
      const mIdx = Number(mStr) - 1;
      months[mIdx] += jh;
    }
    return {
      projectId: pp.projectId,
      account: pp.account,
      project: pp.project,
      color: getProjectColor(i),
      months: months.map(v => Math.round(v)),
      total: Math.round(months.reduce((s, v) => s + v, 0)),
    };
  });
}

function MonthlyTable({ rows, title }: { rows: MonthlyRow[]; title: string }) {
  const totals = new Array(12).fill(0);
  for (const r of rows) { for (let i = 0; i < 12; i++) totals[i] += r.months[i]; }
  const grandTotal = totals.reduce((s, v) => s + v, 0);

  return (
    <>
      <h3>{title}</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Account</th>
              <th>Project</th>
              {MONTH_SHORT.map(m => <th key={m} className="right">{m}</th>)}
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.projectId}>
                <td><span className="color-dot" style={{ backgroundColor: row.color }} /></td>
                <td className="customer-name">{row.account}</td>
                <td>{row.project}</td>
                {row.months.map((v, i) => <td key={i} className="right">{v > 0 ? v : '—'}</td>)}
                <td className="right"><strong>{row.total}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td><strong>Total ({rows.length})</strong></td>
              <td></td>
              {totals.map((v, i) => <td key={i} className="right"><strong>{Math.round(v)}</strong></td>)}
              <td className="right"><strong>{Math.round(grandTotal)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

/* ─── Sub-components ─── */

function RunMarginOverridePanel({
  projections, baseProjections, phase1Ids, overrides, onChange, onReset,
  highlightedId, clearHighlight,
}: {
  projections: ProjectProjection[];
  baseProjections: ProjectProjection[];
  phase1Ids: Set<string>;
  overrides: Record<string, number>;
  onChange: (id: string, val: number) => void;
  onReset: () => void;
  highlightedId?: string | null;
  clearHighlight?: () => void;
}) {
  const phase1Projects = projections.filter(p => phase1Ids.has(p.id) && p.runRevenue > 0);
  if (phase1Projects.length === 0) return null;

  const hasOverrides = Object.keys(overrides).length > 0;

  // Sort: put highlighted project first so it's immediately visible
  const sorted = highlightedId
    ? [...phase1Projects].sort((a, b) => {
        if (a.id === highlightedId) return -1;
        if (b.id === highlightedId) return 1;
        return 0;
      })
    : phase1Projects;

  return (
    <div className="override-panel">
      <div className="override-panel-header">
        <span>Adjust RUN margin % for Phase 1 projects. Defaults to each project's projected margin.</span>
        {hasOverrides && (
          <button className="btn btn-secondary btn-sm" onClick={onReset}>Reset All</button>
        )}
      </div>
      <div className="override-grid">
        {sorted.map(p => {
          const baseMargin = baseProjections.find(b => b.id === p.id)?.runMarginProjected ?? 0;
          const val = overrides[p.id] ?? baseMargin;
          const isHighlighted = p.id === highlightedId;
          return (
            <div
              key={p.id}
              className={`override-item${isHighlighted ? ' override-item-highlight' : ''}`}
              onClick={() => { if (isHighlighted && clearHighlight) clearHighlight(); }}
            >
              <span className="override-label">{p.account} &mdash; {p.project}</span>
              <div className="slider-row">
                <input
                  type="range" min={0} max={100} step={1} value={val}
                  onChange={e => onChange(p.id, Number(e.target.value))}
                />
                <span className="slider-value">{val}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DemandCapacityTab({ projects, members, targets, updateDate, updateMonthLabel }: { projects: ProjectRow[]; members: TeamMember[]; targets: Targets; updateDate?: string; updateMonthLabel?: string | null }) {
  const demand = useMemo(() => computeTotalDemandByMonth(projects, targets, 2026, updateDate), [projects, targets, updateDate]);
  const capacity = useMemo(() => computeTeamCapacityByMonth(members), [members]);

  const deploySim = useMemo(() => computeDeploySimulation(projects, targets, updateDate), [projects, targets, updateDate]);
  const runSim = useMemo(() => computeRunSimulation(projects, targets, updateDate), [projects, targets, updateDate]);

  const chartData = useMemo(() => {
    let accumDemand = 0;
    let accumCapacity = 0;
    return demand.map((d, i) => {
      const cap = capacity[i]?.total || 0;
      accumDemand += d.total;
      accumCapacity += cap;
      return {
        month: d.label,
        demand: d.total,
        capacity: cap,
        accumDemand: Math.round(accumDemand),
        accumCapacity: Math.round(accumCapacity),
      };
    });
  }, [demand, capacity]);

  const totalDemand = chartData.length > 0 ? chartData[chartData.length - 1].accumDemand : 0;
  const totalCapacity = chartData.length > 0 ? chartData[chartData.length - 1].accumCapacity : 0;
  const delta = totalCapacity - totalDemand;

  return (
    <>
      <div className="projection-global" style={{ marginBottom: 24 }}>
        <div className="projection-global-card">
          <h4>Accumulated Demand vs Capacity (JH)</h4>
          <div className="projection-kpi-row">
            <div className="projection-kpi">
              <span className="projection-kpi-label">Total Demand</span>
              <span className="projection-kpi-value">{Math.round(totalDemand)} JH</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Total Capacity</span>
              <span className="projection-kpi-value">{Math.round(totalCapacity)} JH</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Delta</span>
              <span className={`projection-kpi-value ${delta >= 0 ? 'healthy' : 'unhealthy'}`}>
                {delta >= 0 ? '+' : ''}{Math.round(delta)} JH
              </span>
              <span className="projection-kpi-sub">{delta >= 0 ? 'Surplus' : 'Deficit'}</span>
            </div>
          </div>
        </div>
      </div>

      <h3>Monthly (non-accumulated)</h3>
      <div className="chart-container chart-full-width">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `${v}`} tick={{ fontSize: 12 }} label={{ value: 'JH', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <Tooltip formatter={(value, name) => [`${Math.round(Number(value))} JH`, name === 'demand' ? 'Demand' : 'Capacity']} />
            <Legend />
            <Bar dataKey="demand" name="Demand" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Line dataKey="capacity" name="Capacity" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
            {updateMonthLabel && (
              <ReferenceLine x={updateMonthLabel} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" label={{ value: 'Update date', position: 'top', fontSize: 11, fill: '#ef4444' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <h3>Accumulated</h3>
      <div className="chart-container chart-full-width">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `${v}`} tick={{ fontSize: 12 }} label={{ value: 'JH', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <Tooltip formatter={(value, name) => [
              `${Math.round(Number(value))} JH`,
              name === 'accumDemand' ? 'Accumulated Demand' : 'Accumulated Capacity',
            ]} />
            <Legend />
            <Area dataKey="accumCapacity" name="Accumulated Capacity" fill="#dbeafe" stroke="#3b82f6" strokeWidth={2} />
            <Area dataKey="accumDemand" name="Accumulated Demand" fill="#fef3c7" stroke="#f59e0b" strokeWidth={2} />
            {updateMonthLabel && (
              <ReferenceLine x={updateMonthLabel} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" label={{ value: 'Update date', position: 'top', fontSize: 11, fill: '#ef4444' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Demand vs Capacity monthly summary */}
      <h3>Demand vs Capacity by Month</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              {MONTH_SHORT.map(m => <th key={m} className="right">{m}</th>)}
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const mCap = new Array(12).fill(0);
              for (const m of members) {
                for (let i = 0; i < 12; i++) mCap[i] += m[MONTH_KEYS[i]];
              }
              const mDeploy = deploySim.aggregated.map(a => a.total);
              const mRun = runSim.aggregated.map(a => a.total);
              const mDemand = mDeploy.map((d, i) => d + (mRun[i] || 0));
              const mDelta = mCap.map((c, i) => c - (mDemand[i] || 0));
              const fmt = (v: number) => String(Math.round(v));
              const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);

              return (
                <>
                  <tr>
                    <td><strong>Deploy Demand</strong></td>
                    {mDeploy.map((v, i) => <td key={i} className="right">{fmt(v)}</td>)}
                    <td className="right"><strong>{fmt(sum(mDeploy))}</strong></td>
                  </tr>
                  <tr>
                    <td><strong>RUN Demand</strong></td>
                    {mRun.map((v, i) => <td key={i} className="right">{fmt(v)}</td>)}
                    <td className="right"><strong>{fmt(sum(mRun))}</strong></td>
                  </tr>
                  <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                    <td><strong>Total Demand</strong></td>
                    {mDemand.map((v, i) => <td key={i} className="right"><strong>{fmt(v)}</strong></td>)}
                    <td className="right"><strong>{fmt(sum(mDemand))}</strong></td>
                  </tr>
                  <tr>
                    <td><strong>Capacity</strong></td>
                    {mCap.map((v, i) => <td key={i} className="right">{fmt(v)}</td>)}
                    <td className="right"><strong>{fmt(sum(mCap))}</strong></td>
                  </tr>
                  <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                    <td><strong>Delta</strong></td>
                    {mDelta.map((v, i) => (
                      <td key={i} className="right">
                        <span className={v >= 0 ? 'text-success' : 'text-danger'}>
                          <strong>{v >= 0 ? '+' : ''}{fmt(v)}</strong>
                        </span>
                      </td>
                    ))}
                    <td className="right">
                      <span className={sum(mDelta) >= 0 ? 'text-success' : 'text-danger'}>
                        <strong>{sum(mDelta) >= 0 ? '+' : ''}{fmt(sum(mDelta))}</strong>
                      </span>
                    </td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      </div>

      {/* Monthly breakdown table */}
      <h3>Monthly Breakdown</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="right">Demand (JH)</th>
              <th className="right">Capacity (JH)</th>
              <th className="right">Delta</th>
              <th className="right">Accum. Demand</th>
              <th className="right">Accum. Capacity</th>
              <th className="right">Accum. Delta</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map(row => {
              const monthDelta = (capacity.find(c => c.label === row.month)?.total || 0) - row.demand;
              const accumDelta = row.accumCapacity - row.accumDemand;
              return (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td className="right">{Math.round(row.demand)}</td>
                  <td className="right">{Math.round(row.capacity)}</td>
                  <td className="right">
                    <span className={monthDelta >= 0 ? 'text-success' : 'text-danger'}>
                      {monthDelta >= 0 ? '+' : ''}{Math.round(monthDelta)}
                    </span>
                  </td>
                  <td className="right">{Math.round(row.accumDemand)}</td>
                  <td className="right">{Math.round(row.accumCapacity)}</td>
                  <td className="right">
                    <span className={accumDelta >= 0 ? 'text-success' : 'text-danger'}>
                      {accumDelta >= 0 ? '+' : ''}{Math.round(accumDelta)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CashflowTab({ projects, targets, updateDate, updateMonthLabel, revenueItems = [] }: { projects: ProjectRow[]; targets: Targets; updateDate?: string; updateMonthLabel?: string | null; revenueItems?: RevenueLineItem[] }) {
  const [selectedAccount, setSelectedAccount] = useState<string>('__global__');

  const accounts = useMemo(() => {
    const set = new Set(projects.map(p => p.account));
    return [...set].sort();
  }, [projects]);

  // Monthly cashflow time-series
  const monthly = useMemo(() =>
    computeCashflowByMonth(projects, targets, updateDate, selectedAccount === '__global__' ? undefined : selectedAccount, 2026, revenueItems),
  [projects, targets, updateDate, selectedAccount, revenueItems]);

  // Totals from accumulated last month
  const totals = useMemo(() => {
    const last = monthly[monthly.length - 1];
    if (!last) return { revenue: 0, conso: 0, cashflow: 0, margin: 0 };
    const rev = last.accumRevenue;
    const conso = last.accumConsumption;
    return {
      revenue: rev,
      conso,
      cashflow: rev - conso,
      margin: rev > 0 ? Math.round(((rev - conso) / rev) * 1000) / 10 : 0,
    };
  }, [monthly]);

  if (projects.length === 0) {
    return (
      <>
        <h3>Cashflow</h3>
        <div className="empty-state">No project data to compute cashflow.</div>
      </>
    );
  }

  return (
    <>
      {/* Account selector */}
      <div className="sim-header" style={{ marginBottom: 16 }}>
        <div className="filter-group">
          <select
            value={selectedAccount}
            onChange={e => setSelectedAccount(e.target.value)}
            className="filter-select"
          >
            <option value="__global__">Global ({accounts.length} accounts)</option>
            {accounts.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI summary */}
      <div className="projection-global" style={{ marginBottom: 24 }}>
        <div className="projection-global-card">
          <h4>
            {selectedAccount === '__global__' ? 'Global' : selectedAccount} &mdash; Cashflow (Revenue &minus; Consumption)
          </h4>
          <div className="projection-kpi-row">
            <div className="projection-kpi">
              <span className="projection-kpi-label">Revenue</span>
              <span className="projection-kpi-value">{formatCurrency(totals.revenue)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Consumption</span>
              <span className="projection-kpi-value">{formatCurrency(totals.conso)}</span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Cashflow</span>
              <span className={`projection-kpi-value ${totals.cashflow >= 0 ? 'healthy' : 'unhealthy'}`}>
                {formatCurrency(totals.cashflow)}
              </span>
            </div>
            <div className="projection-kpi">
              <span className="projection-kpi-label">Margin</span>
              <span className={`projection-kpi-value ${totals.margin >= 0 ? 'healthy' : 'unhealthy'}`}>
                {totals.margin}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly cashflow chart */}
      <h3>Monthly Cashflow</h3>
      <div className="chart-container chart-full-width">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={monthly} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => formatCurrency(v as number)} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [formatCurrency(value as number), '']} />
            <Legend />
            <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="consumption" name="Consumption" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Line dataKey="cashflow" name="Cashflow" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            {updateMonthLabel && (
              <ReferenceLine x={updateMonthLabel} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" label={{ value: 'Update date', position: 'top', fontSize: 11, fill: '#ef4444' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Accumulated cashflow chart */}
      <h3>Accumulated Cashflow</h3>
      <div className="chart-container chart-full-width">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={monthly} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => formatCurrency(v as number)} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [formatCurrency(value as number), '']} />
            <Legend />
            <Area dataKey="accumRevenue" name="Accum. Revenue" fill="#dbeafe" stroke="#3b82f6" strokeWidth={2} />
            <Area dataKey="accumConsumption" name="Accum. Consumption" fill="#fef3c7" stroke="#f59e0b" strokeWidth={2} />
            <Line dataKey="accumCashflow" name="Accum. Cashflow" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
            {updateMonthLabel && (
              <ReferenceLine x={updateMonthLabel} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" label={{ value: 'Update date', position: 'top', fontSize: 11, fill: '#ef4444' }} />
            )}
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
              <th className="right">Consumption</th>
              <th className="right">Cashflow</th>
              <th className="right">Accum. Revenue</th>
              <th className="right">Accum. Consumption</th>
              <th className="right">Accum. Cashflow</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map(row => (
              <tr key={row.month}>
                <td>{row.label}</td>
                <td className="right">{formatCurrency(row.revenue)}</td>
                <td className="right">{formatCurrency(row.consumption)}</td>
                <td className="right">
                  <span className={row.cashflow >= 0 ? 'text-success' : 'text-danger'}>
                    {formatCurrency(row.cashflow)}
                  </span>
                </td>
                <td className="right">{formatCurrency(row.accumRevenue)}</td>
                <td className="right">{formatCurrency(row.accumConsumption)}</td>
                <td className="right">
                  <span className={row.accumCashflow >= 0 ? 'text-success' : 'text-danger'}>
                    {formatCurrency(row.accumCashflow)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td className="right"><strong>{formatCurrency(totals.revenue)}</strong></td>
              <td className="right"><strong>{formatCurrency(totals.conso)}</strong></td>
              <td className="right">
                <strong className={totals.cashflow >= 0 ? 'text-success' : 'text-danger'}>
                  {formatCurrency(totals.cashflow)}
                </strong>
              </td>
              <td className="right" colSpan={3}>
                <strong>Margin: <span className={`badge ${totals.margin >= 0 ? 'healthy' : 'unhealthy'}`}>{totals.margin}%</span></strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

interface DeployRunTabProps {
  title: string;
  subtitle: string;
  perProject: ProjectMonthlyJH[];
  aggregated: MonthlyAggregate[];
  emptyMessage: string;
  updateMonthLabel?: string | null;
}

function DeployRunTab({ title, subtitle, perProject, aggregated, emptyMessage, updateMonthLabel }: DeployRunTabProps) {
  if (perProject.length === 0) {
    return (
      <>
        <h3>{title}</h3>
        <div className="empty-state">{emptyMessage}</div>
      </>
    );
  }

  const chartData = aggregated.map(agg => {
    const row: Record<string, string | number> = { month: agg.label, total: agg.total };
    for (const pp of perProject) {
      row[pp.projectId] = pp.months[agg.month] || 0;
    }
    return row;
  });

  const projectEntries = perProject.map((pp, i) => ({
    id: pp.projectId,
    name: `${pp.account} — ${pp.project}`,
    color: getProjectColor(i),
    totalJH: Object.values(pp.months).reduce((s, v) => s + v, 0),
  }));

  return (
    <>
      <h3>{title}</h3>
      <p className="settings-desc">{subtitle}</p>

      <div className="chart-container chart-full-width">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `${v}`} tick={{ fontSize: 12 }} label={{ value: 'JH', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <Tooltip
              formatter={(value, name) => {
                const entry = projectEntries.find(e => e.id === name);
                return [`${Math.round(Number(value))} JH`, entry?.name || name];
              }}
            />
            {projectEntries.map(entry => (
              <Bar key={entry.id} dataKey={entry.id} name={entry.id} stackId="projects" fill={entry.color} />
            ))}
            {updateMonthLabel && (
              <ReferenceLine x={updateMonthLabel} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" label={{ value: 'Update date', position: 'top', fontSize: 11, fill: '#ef4444' }} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <MonthlyTable rows={aggregateMonthlyRows(perProject)} title="JH by Month" />

      <h3>Breakdown by Month</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Account</th>
              <th>Project</th>
              {aggregated.map(a => (
                <th key={a.month} className="right">{a.label}</th>
              ))}
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {projectEntries.map(entry => {
              const pp = perProject.find(p => p.projectId === entry.id)!;
              return (
                <tr key={entry.id}>
                  <td><span className="color-dot" style={{ backgroundColor: entry.color }} /></td>
                  <td className="customer-name">{pp.account}</td>
                  <td>{pp.project}</td>
                  {aggregated.map(a => (
                    <td key={a.month} className="right">
                      {(pp.months[a.month] || 0) > 0 ? Math.round(pp.months[a.month]) : '—'}
                    </td>
                  ))}
                  <td className="right"><strong>{Math.round(entry.totalJH)}</strong></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td><strong>Total</strong></td>
              <td></td>
              {aggregated.map(a => (
                <td key={a.month} className="right"><strong>{Math.round(a.total)}</strong></td>
              ))}
              <td className="right">
                <strong>{Math.round(aggregated.reduce((s, a) => s + a.total, 0))}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function ProjectionTable({ projections, targets }: { projections: ProjectProjection[]; targets: Targets }) {
  const { sorted, toggle, sortIndicator } = useSort(projections);

  const totals = useMemo(() => {
    const tDeployRev = projections.reduce((s, p) => s + p.deployRevenue, 0);
    const tDeployConso = projections.reduce((s, p) => s + p.deployConso, 0);
    const tDeployProj = projections.reduce((s, p) => s + p.deployProjected, 0);
    const tDeployMargin = tDeployRev > 0
      ? Math.round(((tDeployRev - tDeployProj) / tDeployRev) * 1000) / 10 : 0;
    const tRunRev = projections.reduce((s, p) => s + p.runRevenue, 0);
    const tRunConso = projections.reduce((s, p) => s + p.runConso, 0);
    const tRunProj = projections.reduce((s, p) => s + p.runProjected, 0);
    const tRunMargin = tRunRev > 0
      ? Math.round(((tRunRev - tRunProj) / tRunRev) * 1000) / 10 : 0;
    return { tDeployRev, tDeployConso, tDeployProj, tDeployMargin, tRunRev, tRunConso, tRunProj, tRunMargin };
  }, [projections]);

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th onClick={() => toggle('account')}>Account{sortIndicator('account')}</th>
            <th onClick={() => toggle('project')}>Project{sortIndicator('project')}</th>
            <th onClick={() => toggle('status')}>Status{sortIndicator('status')}</th>
            <th className="right" onClick={() => toggle('deployRevenue')}>Deploy Revenue{sortIndicator('deployRevenue')}</th>
            <th className="right" onClick={() => toggle('deployConso')}>Deploy Conso{sortIndicator('deployConso')}</th>
            <th className="right" onClick={() => toggle('deployProjected')}>Deploy Projected{sortIndicator('deployProjected')}</th>
            <th className="right" onClick={() => toggle('deployMarginProjected')}>Deploy Margin{sortIndicator('deployMarginProjected')}</th>
            <th className="right" onClick={() => toggle('deployProgress')}>Progress{sortIndicator('deployProgress')}</th>
            <th className="right" onClick={() => toggle('runRevenue')}>RUN Revenue{sortIndicator('runRevenue')}</th>
            <th className="right" onClick={() => toggle('runConso')}>RUN Conso{sortIndicator('runConso')}</th>
            <th className="right" onClick={() => toggle('runProjected')}>RUN Projected{sortIndicator('runProjected')}</th>
            <th className="right" onClick={() => toggle('runMarginProjected')}>RUN Margin{sortIndicator('runMarginProjected')}</th>
            <th className="right" onClick={() => toggle('runProgress')}>Progress{sortIndicator('runProgress')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.id}>
              <td className="customer-name">{p.account}</td>
              <td>{p.project}</td>
              <td><span className="badge">{p.status || '\u2014'}</span></td>
              <td className="right">{formatCurrency(p.deployRevenue)}</td>
              <td className="right">{formatCurrency(p.deployConso)}</td>
              <td className="right">{formatCurrency(p.deployProjected)}</td>
              <td className="right">
                <span className={marginClass(p.deployMarginProjected, targets.deployMargin)}>
                  {p.deployRevenue > 0 ? `${p.deployMarginProjected}%` : '\u2014'}
                </span>
              </td>
              <td className="right">
                <ProgressBar pct={p.deployProgress} />
              </td>
              <td className="right">{formatCurrency(p.runRevenue)}</td>
              <td className="right">{formatCurrency(p.runConso)}</td>
              <td className="right">{formatCurrency(p.runProjected)}</td>
              <td className="right">
                <span className={marginClass(p.runMarginProjected, targets.runMargin)}>
                  {p.runRevenue > 0 ? `${p.runMarginProjected}%` : '\u2014'}
                </span>
              </td>
              <td className="right">
                <ProgressBar pct={p.runProgress} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total ({projections.length})</strong></td>
            <td></td>
            <td></td>
            <td className="right"><strong>{formatCurrency(totals.tDeployRev)}</strong></td>
            <td className="right"><strong>{formatCurrency(totals.tDeployConso)}</strong></td>
            <td className="right"><strong>{formatCurrency(totals.tDeployProj)}</strong></td>
            <td className="right">
              <strong className={marginClass(totals.tDeployMargin, targets.deployMargin)}>
                {totals.tDeployRev > 0 ? `${totals.tDeployMargin}%` : '\u2014'}
              </strong>
            </td>
            <td></td>
            <td className="right"><strong>{formatCurrency(totals.tRunRev)}</strong></td>
            <td className="right"><strong>{formatCurrency(totals.tRunConso)}</strong></td>
            <td className="right"><strong>{formatCurrency(totals.tRunProj)}</strong></td>
            <td className="right">
              <strong className={marginClass(totals.tRunMargin, targets.runMargin)}>
                {totals.tRunRev > 0 ? `${totals.tRunMargin}%` : '\u2014'}
              </strong>
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function marginClass(margin: number, target: number): string {
  if (margin >= target) return 'badge healthy';
  if (margin >= 0) return 'badge warning';
  return 'badge unhealthy';
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="progress-bar-mini">
      <div className="progress-bar-mini-fill" style={{ width: `${pct}%` }} />
      <span className="progress-bar-mini-label">{pct}%</span>
    </div>
  );
}

interface ProjectionChartProps {
  projections: ProjectProjection[];
  type: 'deploy' | 'run';
  threshold: number;
  onBarClick?: (projectId: string) => void;
}

function ProjectionChart({ projections, type, threshold, onBarClick }: ProjectionChartProps) {
  const data = projections
    .filter(p => type === 'deploy' ? p.deployRevenue > 0 : p.runRevenue > 0)
    .map(p => ({
      id: p.id,
      name: p.account,
      margin: type === 'deploy' ? p.deployMarginProjected : p.runMarginProjected,
      healthy: type === 'deploy'
        ? p.deployMarginProjected >= threshold
        : p.runMarginProjected >= threshold,
    }))
    .sort((a, b) => b.margin - a.margin);

  if (data.length === 0) return null;

  const handleClick = (_: unknown, index: number) => {
    if (onBarClick && data[index]) {
      onBarClick(data[index].id);
    }
  };

  return (
    <div className="chart-container chart-full-width">
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 140, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Projected Margin']} />
          <ReferenceLine x={threshold} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `${threshold}%`, position: 'top', fontSize: 11 }} />
          <Bar dataKey="margin" radius={[0, 4, 4, 0]} onClick={handleClick} style={{ cursor: onBarClick ? 'pointer' : undefined }}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.healthy ? '#10b981' : '#f59e0b'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
