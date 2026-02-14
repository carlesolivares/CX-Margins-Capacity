import { useState, useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets } from '../types';
import { formatCurrency, isDeployComplete } from '../utils/margins';
import {
  computeProjections,
  computeTotalDemandByMonth,
  computeTeamCapacityByMonth,
  computeDeploySimulation,
  computeRunSimulation,
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

type ProjTab = 'margins' | 'deploy-sim' | 'run-sim' | 'demand';

interface ProjectionProps {
  projects: ProjectRow[];
  members: TeamMember[];
  targets: Targets;
}

export function Projection({ projects, members, targets }: ProjectionProps) {
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
    () => computeDeploySimulation(projects, targets),
    [projects, targets],
  );
  const runSim = useMemo(
    () => computeRunSimulation(projects, targets),
    [projects, targets],
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
  const runProjects = adjustedProjections.filter(p => p.runRevenue > 0);

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

  return (
    <div className="page">
      <h2>Projection</h2>
      <p className="settings-desc">
        Extrapolates current consumption to the end of each phase based on elapsed time.
        Deploy: Kick-off &rarr; Go-live. RUN: Go-live &rarr; Dec 31, 2026.
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

          {/* RUN Projection */}
          <div className="sim-header">
            <h3>RUN &mdash; Projected Margin</h3>
            {phase1ProjectIds.size > 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowOverridePanel(o => !o)}
              >
                <SlidersHorizontal size={14} />
                {showOverridePanel ? 'Hide' : 'Adjust'} Phase 1 RUN Margin
              </button>
            )}
          </div>

          {showOverridePanel && phase1ProjectIds.size > 0 && (
            <RunMarginOverridePanel
              projections={adjustedProjections}
              phase1Ids={phase1ProjectIds}
              overrides={runMarginOverrides}
              defaultMargin={targets.runMargin}
              onChange={(id, val) => setRunMarginOverrides(prev => ({ ...prev, [id]: val }))}
              onReset={() => setRunMarginOverrides({})}
              highlightedId={highlightedProjectId}
              clearHighlight={() => setHighlightedProjectId(null)}
            />
          )}

          <ProjectionChart
            projections={adjustedProjections}
            type="run"
            threshold={targets.runMargin}
            onBarClick={(id) => {
              if (phase1ProjectIds.has(id)) {
                setShowOverridePanel(true);
                setHighlightedProjectId(id);
              }
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
        />
      )}

      {tab === 'run-sim' && (
        <DeployRunTab
          title="RUN Simulation"
          subtitle="RUN JH per project spread by month (Go-live &rarr; Dec 31). First 3 months weighted 3x/2x/1.5x (hypercare)."
          perProject={runSim.perProject}
          aggregated={runSim.aggregated}
          emptyMessage="No projects with valid go-live date and RUN revenue."
        />
      )}

      {tab === 'demand' && (
        <DemandCapacityTab projects={projects} members={members} targets={targets} />
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function RunMarginOverridePanel({
  projections, phase1Ids, overrides, defaultMargin, onChange, onReset,
  highlightedId, clearHighlight,
}: {
  projections: ProjectProjection[];
  phase1Ids: Set<string>;
  overrides: Record<string, number>;
  defaultMargin: number;
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
        <span>Set RUN margin % for projects still in Phase 1 (Deploy). Default: {defaultMargin}%</span>
        {hasOverrides && (
          <button className="btn btn-secondary btn-sm" onClick={onReset}>Reset All</button>
        )}
      </div>
      <div className="override-grid">
        {sorted.map(p => {
          const val = overrides[p.id] ?? defaultMargin;
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

function DemandCapacityTab({ projects, members, targets }: { projects: ProjectRow[]; members: TeamMember[]; targets: Targets }) {
  const demand = useMemo(() => computeTotalDemandByMonth(projects, targets), [projects, targets]);
  const capacity = useMemo(() => computeTeamCapacityByMonth(members), [members]);

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
        accumDemand: Math.round(accumDemand * 10) / 10,
        accumCapacity: Math.round(accumCapacity * 10) / 10,
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
            <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)} JH`, name === 'demand' ? 'Demand' : 'Capacity']} />
            <Legend />
            <Bar dataKey="demand" name="Demand" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Line dataKey="capacity" name="Capacity" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
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
              `${Number(value).toFixed(1)} JH`,
              name === 'accumDemand' ? 'Accumulated Demand' : 'Accumulated Capacity',
            ]} />
            <Legend />
            <Area dataKey="accumCapacity" name="Accumulated Capacity" fill="#dbeafe" stroke="#3b82f6" strokeWidth={2} />
            <Area dataKey="accumDemand" name="Accumulated Demand" fill="#fef3c7" stroke="#f59e0b" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
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
                  <td className="right">{row.demand.toFixed(1)}</td>
                  <td className="right">{row.capacity.toFixed(1)}</td>
                  <td className="right">
                    <span className={monthDelta >= 0 ? 'text-success' : 'text-danger'}>
                      {monthDelta >= 0 ? '+' : ''}{monthDelta.toFixed(1)}
                    </span>
                  </td>
                  <td className="right">{row.accumDemand.toFixed(1)}</td>
                  <td className="right">{row.accumCapacity.toFixed(1)}</td>
                  <td className="right">
                    <span className={accumDelta >= 0 ? 'text-success' : 'text-danger'}>
                      {accumDelta >= 0 ? '+' : ''}{accumDelta.toFixed(1)}
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

interface DeployRunTabProps {
  title: string;
  subtitle: string;
  perProject: ProjectMonthlyJH[];
  aggregated: MonthlyAggregate[];
  emptyMessage: string;
}

function DeployRunTab({ title, subtitle, perProject, aggregated, emptyMessage }: DeployRunTabProps) {
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
                return [`${Number(value).toFixed(1)} JH`, entry?.name || name];
              }}
            />
            {projectEntries.map(entry => (
              <Bar key={entry.id} dataKey={entry.id} name={entry.id} stackId="projects" fill={entry.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3>Breakdown by Project</h3>
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
                      {(pp.months[a.month] || 0) > 0 ? (pp.months[a.month]).toFixed(1) : '—'}
                    </td>
                  ))}
                  <td className="right"><strong>{entry.totalJH.toFixed(1)}</strong></td>
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
                <td key={a.month} className="right"><strong>{a.total.toFixed(1)}</strong></td>
              ))}
              <td className="right">
                <strong>{aggregated.reduce((s, a) => s + a.total, 0).toFixed(1)}</strong>
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
