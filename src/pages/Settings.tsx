import { useState, useMemo } from 'react';
import type { Targets, ProjectRow } from '../types';
import { DEFAULT_TARGETS } from '../types';
import type { ProjectToggle } from '../store/useStore';
import { Settings as SettingsIcon, RotateCcw, Info, Filter } from 'lucide-react';

interface SettingsProps {
  targets: Targets;
  updateTargets: (t: Targets) => void;
  projects?: ProjectRow[];
  getToggle?: (id: string) => ProjectToggle;
  setToggle?: (id: string, toggle: ProjectToggle) => void;
}

export function Settings({ targets, updateTargets, projects = [], getToggle, setToggle }: SettingsProps) {
  const [deploy, setDeploy] = useState(targets.deployMargin);
  const [run, setRun] = useState(targets.runMargin);
  const [global, setGlobal] = useState(targets.globalMargin);

  const hasChanges = deploy !== targets.deployMargin || run !== targets.runMargin || global !== targets.globalMargin;
  const isDefault = deploy === DEFAULT_TARGETS.deployMargin && run === DEFAULT_TARGETS.runMargin && global === DEFAULT_TARGETS.globalMargin;

  const apply = () => {
    updateTargets({ deployMargin: deploy, runMargin: run, globalMargin: global });
  };

  const resetDefaults = () => {
    setDeploy(DEFAULT_TARGETS.deployMargin);
    setRun(DEFAULT_TARGETS.runMargin);
    setGlobal(DEFAULT_TARGETS.globalMargin);
    updateTargets(DEFAULT_TARGETS);
  };

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="settings-section">
        <h3><SettingsIcon size={18} /> Margin Targets</h3>
        <p className="settings-desc">
          Adjust the margin thresholds used across all dashboards, simulations, and KPI cards.
        </p>

        <div className="settings-grid">
          <div className="settings-card">
            <label className="settings-label">Deploy Margin Target</label>
            <div className="settings-input-row">
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={deploy}
                onChange={e => setDeploy(Number(e.target.value))}
              />
              <div className="settings-value-group">
                <input
                  type="number"
                  className="input input-sm"
                  min={0}
                  max={100}
                  value={deploy}
                  onChange={e => setDeploy(Number(e.target.value))}
                />
                <span>%</span>
              </div>
            </div>
            <span className="settings-hint">
              Default: {DEFAULT_TARGETS.deployMargin}% — Current: {targets.deployMargin}%
            </span>
          </div>

          <div className="settings-card">
            <label className="settings-label">RUN Margin Target</label>
            <div className="settings-input-row">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={run}
                onChange={e => setRun(Number(e.target.value))}
              />
              <div className="settings-value-group">
                <input
                  type="number"
                  className="input input-sm"
                  min={0}
                  max={100}
                  value={run}
                  onChange={e => setRun(Number(e.target.value))}
                />
                <span>%</span>
              </div>
            </div>
            <span className="settings-hint">
              Default: {DEFAULT_TARGETS.runMargin}% — Current: {targets.runMargin}%
            </span>
          </div>

          <div className="settings-card">
            <label className="settings-label">Global Margin Target</label>
            <div className="settings-input-row">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={global}
                onChange={e => setGlobal(Number(e.target.value))}
              />
              <div className="settings-value-group">
                <input
                  type="number"
                  className="input input-sm"
                  min={0}
                  max={100}
                  value={global}
                  onChange={e => setGlobal(Number(e.target.value))}
                />
                <span>%</span>
              </div>
            </div>
            <span className="settings-hint">
              Default: {DEFAULT_TARGETS.globalMargin}% — Current: {targets.globalMargin}%
            </span>
          </div>
        </div>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={apply} disabled={!hasChanges}>
            Apply Changes
          </button>
          {!isDefault && (
            <button className="btn btn-secondary" onClick={resetDefaults}>
              <RotateCcw size={14} /> Reset to Defaults
            </button>
          )}
        </div>
      </div>

      {/* Project Toggles */}
      {projects.length > 0 && getToggle && setToggle && (
        <div className="settings-section" style={{ marginTop: 24 }}>
          <h3><Filter size={18} /> Project Scope</h3>
          <p className="settings-desc">
            Toggle Deploy and/or RUN per project. Only active phases are included in reports, projections, simulations, and dashboards.
          </p>
          <ProjectToggleTable
            projects={projects}
            getToggle={getToggle}
            setToggle={setToggle}
          />
        </div>
      )}

      {/* Assumptions section */}
      <div className="settings-section" style={{ marginTop: 24 }}>
        <h3><Info size={18} /> Assumptions</h3>
        <p className="settings-desc">
          The following assumptions are used across all calculations in the app.
        </p>
        <div className="assumptions-list">
          <div className="assumption-item">
            <span className="assumption-title">Deploy Phase</span>
            <span className="assumption-desc">Kick-off date to Go-live date. If a project went live before {new Date().getFullYear()} (e.g. 2025), it is excluded from Deploy dashboards and charts.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">RUN Phase</span>
            <span className="assumption-desc">Go-live date to December 31, 2026. If Go-live was before January 1, 2026, the RUN period starts counting from 01/01/2026 for projection purposes.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Default Go-live</span>
            <span className="assumption-desc">When no Go-live date is specified, 01/01/2025 is used as the default.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">JH Rate</span>
            <span className="assumption-desc">Default daily rate of 400 EUR/JH is used for JH conversions (demand JH &rarr; EUR consumption).</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Deploy JH Formula</span>
            <span className="assumption-desc">DEPLOY JH = DEPLOY Revenue (EUR) &times; (100 &minus; Deploy Margin %) / 100 / 400</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">RUN JH Formula</span>
            <span className="assumption-desc">RUN JH = RUN Revenue (EUR) &times; (100 &minus; RUN Margin %) / 100 / 400</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Hypercare</span>
            <span className="assumption-desc">The first 3 months after Go-live have elevated RUN JH demand: 3x, 2x, 1.5x weighting compared to later months. Total JH is preserved.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Projection Extrapolation</span>
            <span className="assumption-desc">Projected cost = Actual consumption &times; (Total phase days / Elapsed days). Phase 1 projects use the target margin % to estimate RUN cost.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Cashflow Revenue</span>
            <span className="assumption-desc">Revenue is recognized as a one-shot in the month of the start date (Date d&eacute;but) from the imported revenue file. Applies to both licenses (RUN) and setup (Deploy). If no revenue file is imported, fallback: Deploy at kick-off month, RUN at go-live + 2 months.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Cashflow Consumption</span>
            <span className="assumption-desc">Real consumption (EUR) is used up to the update date. For future months, consumption is projected from the JH demand simulation &times; 400 EUR/JH rate.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Team Capacity</span>
            <span className="assumption-desc">Quarterly days per team member are split evenly across the 3 months of each quarter (Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec).</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Simulation Financial Summary</span>
            <span className="assumption-desc">Margin forecast uses simulated team cost (quarterly days &times; daily rate) as consumption, compared against project revenue. Simulated projects are included in the forecast.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectToggleTable({ projects, getToggle, setToggle }: {
  projects: ProjectRow[];
  getToggle: (id: string) => ProjectToggle;
  setToggle: (id: string, toggle: ProjectToggle) => void;
}) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter) return projects;
    const q = filter.toLowerCase();
    return projects.filter(p =>
      p.account.toLowerCase().includes(q) || p.project.toLowerCase().includes(q)
    );
  }, [projects, filter]);

  const allDeployOn = filtered.every(p => getToggle(p.id).deploy);
  const allRunOn = filtered.every(p => getToggle(p.id).run);

  const toggleAllDeploy = (on: boolean) => {
    for (const p of filtered) {
      const t = getToggle(p.id);
      setToggle(p.id, { ...t, deploy: on });
    }
  };
  const toggleAllRun = (on: boolean) => {
    for (const p of filtered) {
      const t = getToggle(p.id);
      setToggle(p.id, { ...t, run: on });
    }
  };

  return (
    <>
      <input
        type="text"
        className="input"
        placeholder="Filter by account or project..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ marginBottom: 12, maxWidth: 400 }}
      />
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Project</th>
              <th className="center" style={{ cursor: 'pointer' }} onClick={() => toggleAllDeploy(!allDeployOn)}>
                Deploy {allDeployOn ? '\u2611' : '\u2610'}
              </th>
              <th className="center" style={{ cursor: 'pointer' }} onClick={() => toggleAllRun(!allRunOn)}>
                RUN {allRunOn ? '\u2611' : '\u2610'}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const t = getToggle(p.id);
              return (
                <tr key={p.id} className={!t.deploy && !t.run ? 'row-dimmed' : ''}>
                  <td className="customer-name">{p.account}</td>
                  <td>{p.project || '\u2014'}</td>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={t.deploy}
                      onChange={e => setToggle(p.id, { ...t, deploy: e.target.checked })}
                      disabled={p.deployRevenue <= 0}
                    />
                  </td>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={t.run}
                      onChange={e => setToggle(p.id, { ...t, run: e.target.checked })}
                      disabled={p.runRevenue <= 0}
                    />
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
