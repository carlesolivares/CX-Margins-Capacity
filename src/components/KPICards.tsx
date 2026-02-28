import type { CustomerMargin, TeamCapacity, Targets } from '../types';
import { formatCurrency, formatPercent } from '../utils/margins';
import { TrendingUp, TrendingDown, Users, Target } from 'lucide-react';

interface KPICardsProps {
  margins: CustomerMargin[];
  capacity: TeamCapacity;
  consumed: { deployEur: number; runEur: number; deployJH: number; runJH: number };
  targets: Targets;
  totalDemandJH?: number;
}

export function KPICards({ margins, capacity, consumed, targets, totalDemandJH }: KPICardsProps) {
  const totalDeployRev = margins.reduce((s, m) => s + m.deployRevenue, 0);
  const totalDeployCost = margins.reduce((s, m) => s + m.deployCost, 0);
  const totalRunRev = margins.reduce((s, m) => s + m.runRevenue, 0);
  const totalRunCost = margins.reduce((s, m) => s + m.runCost, 0);

  const deployMargin = totalDeployRev > 0
    ? ((totalDeployRev - totalDeployCost) / totalDeployRev) * 100 : 0;
  const runMargin = totalRunRev > 0
    ? ((totalRunRev - totalRunCost) / totalRunRev) * 100 : 0;

  const deployOnTarget = deployMargin >= targets.deployMargin;
  const runOnTarget = runMargin >= targets.runMargin;
  const deployGap = targets.deployMargin - deployMargin;
  const runGap = targets.runMargin - runMargin;

  const healthyDeploy = margins.filter(m => m.deployRevenue > 0 && m.deployHealthy).length;
  const totalWithDeploy = margins.filter(m => m.deployRevenue > 0).length;
  const healthyRun = margins.filter(m => m.runRevenue > 0 && m.runHealthy).length;
  const totalWithRun = margins.filter(m => m.runRevenue > 0).length;

  const demandJH = Math.round((totalDemandJH ?? (consumed.deployJH + consumed.runJH)) * 10) / 10;
  const capacityDelta = Math.round((capacity.totalAvailableDays - demandJH) * 10) / 10;

  // Max cost to hit target margin
  const deployMaxCost = totalDeployRev * (1 - targets.deployMargin / 100);
  const runMaxCost = totalRunRev * (1 - targets.runMargin / 100);

  return (
    <div className="kpi-grid">
      <div className={`kpi-card ${deployOnTarget ? 'healthy' : 'unhealthy'}`}>
        <div className="kpi-icon">
          {deployOnTarget ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
        </div>
        <div className="kpi-content">
          <span className="kpi-label">Deploy Margin {'\u2014'} target {'\u2265'} {targets.deployMargin}%</span>
          <span className="kpi-value">{formatPercent(deployMargin)}</span>
          <div className="kpi-target-bar">
            <div className="target-bar-bg">
              <div
                className={`target-bar-fill ${deployOnTarget ? 'on-target' : 'off-target'}`}
                style={{ width: `${Math.min(100, (deployMargin / targets.deployMargin) * 100)}%` }}
              />
              <div className="target-bar-mark" style={{ left: '100%' }} />
            </div>
          </div>
          <span className="kpi-detail">
            {formatCurrency(totalDeployCost)} cost / {formatCurrency(deployMaxCost)} max
          </span>
          {!deployOnTarget && totalDeployCost > deployMaxCost && (
            <span className="kpi-warning">
              {formatPercent(deployGap)} below target {'\u2014'} reduce cost by {formatCurrency(totalDeployCost - deployMaxCost)}
            </span>
          )}
          {deployOnTarget && (
            <span className="kpi-success">On target</span>
          )}
          <span className="kpi-sub">{healthyDeploy}/{totalWithDeploy} accounts on target</span>
        </div>
      </div>

      <div className={`kpi-card ${runOnTarget ? 'healthy' : 'unhealthy'}`}>
        <div className="kpi-icon">
          {runOnTarget ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
        </div>
        <div className="kpi-content">
          <span className="kpi-label">RUN Margin {'\u2014'} target {'\u2265'} {targets.runMargin}%</span>
          <span className="kpi-value">{formatPercent(runMargin)}</span>
          <div className="kpi-target-bar">
            <div className="target-bar-bg">
              <div
                className={`target-bar-fill ${runOnTarget ? 'on-target' : 'off-target'}`}
                style={{ width: `${Math.min(100, (runMargin / targets.runMargin) * 100)}%` }}
              />
              <div className="target-bar-mark" style={{ left: '100%' }} />
            </div>
          </div>
          <span className="kpi-detail">
            {formatCurrency(totalRunCost)} cost / {formatCurrency(runMaxCost)} max
          </span>
          {!runOnTarget && totalRunCost > runMaxCost && (
            <span className="kpi-warning">
              {formatPercent(runGap)} below target {'\u2014'} reduce cost by {formatCurrency(totalRunCost - runMaxCost)}
            </span>
          )}
          {runOnTarget && (
            <span className="kpi-success">On target</span>
          )}
          <span className="kpi-sub">{healthyRun}/{totalWithRun} accounts on target</span>
        </div>
      </div>

      <div className={`kpi-card ${capacityDelta >= 0 ? 'healthy' : 'unhealthy'}`}>
        <div className="kpi-icon"><Users size={24} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Demand vs Capacity</span>
          <span className="kpi-value">{demandJH} / {capacity.totalAvailableDays} JH</span>
          <span className="kpi-detail">
            {capacityDelta >= 0 ? `+${capacityDelta} JH surplus` : `${capacityDelta} JH deficit`}
          </span>
          <span className="kpi-sub">{formatCurrency(capacity.totalCost)} total team cost</span>
        </div>
      </div>

      <div className="kpi-card neutral">
        <div className="kpi-icon"><Target size={24} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Total Revenue</span>
          <span className="kpi-value">{formatCurrency(totalDeployRev + totalRunRev)}</span>
          <span className="kpi-detail">{formatCurrency(totalDeployRev)} deploy + {formatCurrency(totalRunRev)} run</span>
          <span className="kpi-sub">{margins.length} accounts</span>
        </div>
      </div>
    </div>
  );
}
