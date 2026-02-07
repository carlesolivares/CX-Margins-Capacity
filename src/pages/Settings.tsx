import { useState } from 'react';
import type { Targets } from '../types';
import { DEFAULT_TARGETS } from '../types';
import { Settings as SettingsIcon, RotateCcw, Info } from 'lucide-react';

interface SettingsProps {
  targets: Targets;
  updateTargets: (t: Targets) => void;
}

export function Settings({ targets, updateTargets }: SettingsProps) {
  const [deploy, setDeploy] = useState(targets.deployMargin);
  const [run, setRun] = useState(targets.runMargin);

  const hasChanges = deploy !== targets.deployMargin || run !== targets.runMargin;
  const isDefault = deploy === DEFAULT_TARGETS.deployMargin && run === DEFAULT_TARGETS.runMargin;

  const apply = () => {
    updateTargets({ deployMargin: deploy, runMargin: run });
  };

  const resetDefaults = () => {
    setDeploy(DEFAULT_TARGETS.deployMargin);
    setRun(DEFAULT_TARGETS.runMargin);
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
            <span className="assumption-desc">Default daily rate of 400 EUR/JH is used for JH conversions.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Deploy JH Formula</span>
            <span className="assumption-desc">DEPLOY JH = DEPLOY Revenue (EUR) x (100 - Deploy Margin %) / 100 / 400</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">RUN JH Formula</span>
            <span className="assumption-desc">RUN JH = RUN Revenue (EUR) x (100 - RUN Margin %) / 100 / 400</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Hypercare</span>
            <span className="assumption-desc">The first 3 months after Go-live have elevated RUN JH demand: 3x, 2x, 1.5x weighting compared to later months. Total JH is preserved.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Projection Extrapolation</span>
            <span className="assumption-desc">Projected cost = Actual consumption x (Total phase days / Elapsed days). Phase 1 projects use the target margin % to estimate RUN cost.</span>
          </div>
          <div className="assumption-item">
            <span className="assumption-title">Team Capacity</span>
            <span className="assumption-desc">Quarterly days per team member are split evenly across the 3 months of each quarter (Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec).</span>
          </div>
        </div>
      </div>
    </div>
  );
}
