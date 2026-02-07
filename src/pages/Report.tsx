import { useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets } from '../types';
import { formatCurrency, isDeployComplete, calculateProjectMargins } from '../utils/margins';
import { computeProjections, computeTotalDemandByMonth, computeTeamCapacityByMonth } from '../utils/simulation';
import type { ProjectProjection } from '../utils/simulation';
import {
  FileText, AlertTriangle, CheckCircle, TrendingDown, Users,
} from 'lucide-react';

interface ReportProps {
  projects: ProjectRow[];
  members: TeamMember[];
  targets: Targets;
}

export function Report({ projects, members, targets }: ReportProps) {
  const projections = useMemo(
    () => computeProjections(projects, targets),
    [projects, targets],
  );

  const projectMargins = useMemo(
    () => calculateProjectMargins(projects, 1, targets),
    [projects, targets],
  );

  // Status breakdown
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      const s = p.status || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [projects]);

  // Deploy analysis (exclude completed deploys)
  const deployAnalysis = useMemo(() => {
    const active = projections.filter(p => {
      const orig = projects.find(o => o.id === p.id);
      return orig && !isDeployComplete(orig) && p.deployRevenue > 0;
    });
    const atRisk = active.filter(p => p.deployMarginProjected < targets.deployMargin)
      .sort((a, b) => a.deployMarginProjected - b.deployMarginProjected);
    const healthy = active.filter(p => p.deployMarginProjected >= targets.deployMargin)
      .sort((a, b) => b.deployMarginProjected - a.deployMarginProjected);
    const totalRev = active.reduce((s, p) => s + p.deployRevenue, 0);
    const totalProj = active.reduce((s, p) => s + p.deployProjected, 0);
    const globalMargin = totalRev > 0 ? Math.round(((totalRev - totalProj) / totalRev) * 1000) / 10 : 0;
    return { active, atRisk, healthy, totalRev, totalProj, globalMargin };
  }, [projections, projects, targets]);

  // RUN analysis
  const runAnalysis = useMemo(() => {
    const active = projections.filter(p => p.runRevenue > 0);
    const atRisk = active.filter(p => p.runMarginProjected < targets.runMargin)
      .sort((a, b) => a.runMarginProjected - b.runMarginProjected);
    const healthy = active.filter(p => p.runMarginProjected >= targets.runMargin)
      .sort((a, b) => b.runMarginProjected - a.runMarginProjected);
    const totalRev = active.reduce((s, p) => s + p.runRevenue, 0);
    const totalProj = active.reduce((s, p) => s + p.runProjected, 0);
    const globalMargin = totalRev > 0 ? Math.round(((totalRev - totalProj) / totalRev) * 1000) / 10 : 0;
    return { active, atRisk, healthy, totalRev, totalProj, globalMargin };
  }, [projections, targets]);

  // Capacity vs demand
  const capacityDemand = useMemo(() => {
    const demand = computeTotalDemandByMonth(projects, targets);
    const capacity = computeTeamCapacityByMonth(members);
    let totalDemand = 0;
    let totalCapacity = 0;
    const deficits: { month: string; gap: number }[] = [];

    demand.forEach((d, i) => {
      const cap = capacity[i]?.total || 0;
      totalDemand += d.total;
      totalCapacity += cap;
      if (d.total > cap && d.total > 0) {
        deficits.push({ month: d.label, gap: Math.round((d.total - cap) * 10) / 10 });
      }
    });

    return {
      totalDemand: Math.round(totalDemand),
      totalCapacity: Math.round(totalCapacity),
      delta: Math.round(totalCapacity - totalDemand),
      deficits,
    };
  }, [projects, members, targets]);

  // Stable projects (both deploy and RUN margins meet targets)
  const stableProjects = useMemo(() => {
    return projectMargins.filter(p => {
      const deployOk = p.deployRevenue === 0 || p.deployHealthy;
      const runOk = p.runRevenue === 0 || p.runHealthy;
      return deployOk && runOk && (p.deployRevenue > 0 || p.runRevenue > 0);
    });
  }, [projectMargins]);

  if (projects.length === 0) {
    return (
      <div className="page">
        <h2>Report</h2>
        <div className="empty-state">Import projects to generate the report.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Report</h2>
      <p className="settings-desc">
        Executive summary of portfolio health, actionable recommendations, and capacity analysis.
      </p>

      {/* ── 1. Status Summary ── */}
      <div className="report-section">
        <h3><FileText size={18} /> Portfolio Summary</h3>
        <div className="report-kpi-grid">
          <div className="report-kpi-card">
            <span className="report-kpi-label">Total Projects</span>
            <span className="report-kpi-value">{projects.length}</span>
          </div>
          <div className="report-kpi-card">
            <span className="report-kpi-label">Deploy Margin</span>
            <span className={`report-kpi-value ${deployAnalysis.globalMargin >= targets.deployMargin ? 'healthy' : 'unhealthy'}`}>
              {deployAnalysis.globalMargin}%
            </span>
            <span className="report-kpi-sub">Target: {targets.deployMargin}%</span>
          </div>
          <div className="report-kpi-card">
            <span className="report-kpi-label">RUN Margin</span>
            <span className={`report-kpi-value ${runAnalysis.globalMargin >= targets.runMargin ? 'healthy' : 'unhealthy'}`}>
              {runAnalysis.globalMargin}%
            </span>
            <span className="report-kpi-sub">Target: {targets.runMargin}%</span>
          </div>
          <div className="report-kpi-card">
            <span className="report-kpi-label">Capacity Balance</span>
            <span className={`report-kpi-value ${capacityDemand.delta >= 0 ? 'healthy' : 'unhealthy'}`}>
              {capacityDemand.delta >= 0 ? '+' : ''}{capacityDemand.delta} JH
            </span>
            <span className="report-kpi-sub">{capacityDemand.delta >= 0 ? 'Surplus' : 'Deficit'}</span>
          </div>
        </div>

        {statusCounts.length > 0 && (
          <div className="report-status-breakdown">
            <h4>Status Breakdown</h4>
            <div className="report-status-chips">
              {statusCounts.map(([status, count]) => (
                <span key={status} className="report-status-chip">
                  {status}: <strong>{count}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Margin Recommendations ── */}
      <div className="report-section">
        <h3><AlertTriangle size={18} /> Recommendations to Improve Margins</h3>

        {deployAnalysis.atRisk.length > 0 && (
          <div className="report-subsection">
            <h4>
              <TrendingDown size={14} />
              Deploy at Risk ({deployAnalysis.atRisk.length} project{deployAnalysis.atRisk.length > 1 ? 's' : ''})
            </h4>
            <p className="report-hint">
              Projects with projected Deploy margin below {targets.deployMargin}%. Consider reviewing scope, renegotiating, or optimizing delivery costs.
            </p>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Project</th>
                    <th className="right">Revenue</th>
                    <th className="right">Projected Cost</th>
                    <th className="right">Projected Margin</th>
                    <th className="right">Gap to Target</th>
                    <th>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {deployAnalysis.atRisk.map(p => (
                    <RecommendationRow key={p.id} proj={p} type="deploy" target={targets.deployMargin} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {runAnalysis.atRisk.length > 0 && (
          <div className="report-subsection">
            <h4>
              <TrendingDown size={14} />
              RUN at Risk ({runAnalysis.atRisk.length} project{runAnalysis.atRisk.length > 1 ? 's' : ''})
            </h4>
            <p className="report-hint">
              Projects with projected RUN margin below {targets.runMargin}%. Consider automating support, adjusting staffing, or reviewing contract terms.
            </p>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Project</th>
                    <th className="right">Revenue</th>
                    <th className="right">Projected Cost</th>
                    <th className="right">Projected Margin</th>
                    <th className="right">Gap to Target</th>
                    <th>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {runAnalysis.atRisk.map(p => (
                    <RecommendationRow key={p.id} proj={p} type="run" target={targets.runMargin} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {deployAnalysis.atRisk.length === 0 && runAnalysis.atRisk.length === 0 && (
          <div className="report-all-good">
            <CheckCircle size={20} />
            All projects are meeting their margin targets.
          </div>
        )}
      </div>

      {/* ── 3. Stable Projects ── */}
      <div className="report-section">
        <h3><CheckCircle size={18} /> Stable Projects</h3>
        <p className="report-hint">
          Projects meeting both Deploy ({targets.deployMargin}%) and RUN ({targets.runMargin}%) margin targets.
        </p>

        {stableProjects.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Project</th>
                  <th className="right">Deploy Margin</th>
                  <th className="right">RUN Margin</th>
                  <th className="right">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stableProjects.map(p => (
                  <tr key={`${p.account}-${p.project}`}>
                    <td className="customer-name">{p.account}</td>
                    <td>{p.project || '\u2014'}</td>
                    <td className="right">
                      {p.deployRevenue > 0 ? (
                        <span className="badge healthy">{p.deployMargin}%</span>
                      ) : '\u2014'}
                    </td>
                    <td className="right">
                      {p.runRevenue > 0 ? (
                        <span className="badge healthy">{p.runMargin}%</span>
                      ) : '\u2014'}
                    </td>
                    <td className="right">{formatCurrency(p.deployRevenue + p.runRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="report-warning-box">
            No projects are currently meeting both margin targets.
          </div>
        )}
      </div>

      {/* ── 4. Capacity vs Demand ── */}
      <div className="report-section">
        <h3><Users size={18} /> Capacity vs Demand Adjustment</h3>

        <div className="report-kpi-grid report-kpi-grid-3">
          <div className="report-kpi-card">
            <span className="report-kpi-label">Total Demand</span>
            <span className="report-kpi-value">{capacityDemand.totalDemand} JH</span>
          </div>
          <div className="report-kpi-card">
            <span className="report-kpi-label">Total Capacity</span>
            <span className="report-kpi-value">{capacityDemand.totalCapacity} JH</span>
          </div>
          <div className="report-kpi-card">
            <span className="report-kpi-label">Balance</span>
            <span className={`report-kpi-value ${capacityDemand.delta >= 0 ? 'healthy' : 'unhealthy'}`}>
              {capacityDemand.delta >= 0 ? '+' : ''}{capacityDemand.delta} JH
            </span>
          </div>
        </div>

        {capacityDemand.delta < 0 && (
          <div className="report-action-box danger">
            <AlertTriangle size={16} />
            <div>
              <strong>Capacity deficit of {Math.abs(capacityDemand.delta)} JH detected.</strong>
              <p>Consider the following actions:</p>
              <ul>
                <li>Add team members to cover the {Math.abs(capacityDemand.delta)} JH gap</li>
                <li>Increase quarterly availability for existing team members</li>
                <li>Prioritize and defer lower-priority projects</li>
                <li>Outsource or use contractors for peak periods</li>
              </ul>
            </div>
          </div>
        )}

        {capacityDemand.delta >= 0 && capacityDemand.delta < capacityDemand.totalCapacity * 0.1 && (
          <div className="report-action-box warning">
            <AlertTriangle size={16} />
            <div>
              <strong>Capacity surplus is thin ({capacityDemand.delta} JH, {capacityDemand.totalCapacity > 0 ? Math.round(capacityDemand.delta / capacityDemand.totalCapacity * 100) : 0}% buffer).</strong>
              <p>Any new projects or scope increases could create a deficit. Monitor closely.</p>
            </div>
          </div>
        )}

        {capacityDemand.delta >= capacityDemand.totalCapacity * 0.1 && (
          <div className="report-action-box success">
            <CheckCircle size={16} />
            <div>
              <strong>Healthy capacity buffer of {capacityDemand.delta} JH ({capacityDemand.totalCapacity > 0 ? Math.round(capacityDemand.delta / capacityDemand.totalCapacity * 100) : 0}%).</strong>
              <p>Team has room for new projects or scope increases.</p>
            </div>
          </div>
        )}

        {capacityDemand.deficits.length > 0 && (
          <div className="report-subsection">
            <h4>Monthly Deficit Months</h4>
            <p className="report-hint">
              Months where projected demand exceeds team capacity.
            </p>
            <div className="report-deficit-chips">
              {capacityDemand.deficits.map(d => (
                <span key={d.month} className="report-deficit-chip">
                  {d.month}: <strong>-{d.gap} JH</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helper Components ─── */

function RecommendationRow({ proj, type, target }: { proj: ProjectProjection; type: 'deploy' | 'run'; target: number }) {
  const revenue = type === 'deploy' ? proj.deployRevenue : proj.runRevenue;
  const projected = type === 'deploy' ? proj.deployProjected : proj.runProjected;
  const margin = type === 'deploy' ? proj.deployMarginProjected : proj.runMarginProjected;
  const gap = Math.round((target - margin) * 10) / 10;

  // Cost reduction needed to hit target
  const targetCost = revenue * (100 - target) / 100;
  const costReduction = projected - targetCost;

  let recommendation = '';
  if (margin < 0) {
    recommendation = 'Critical: costs exceed revenue. Immediate scope review and renegotiation needed.';
  } else if (gap > 20) {
    recommendation = `Significant gap. Reduce costs by ${formatCurrency(costReduction)} or renegotiate scope.`;
  } else if (gap > 10) {
    recommendation = `Moderate gap. Optimize delivery efficiency or adjust resource allocation (${formatCurrency(costReduction)} savings needed).`;
  } else {
    recommendation = `Close to target. Fine-tune resource usage to save ${formatCurrency(costReduction)}.`;
  }

  return (
    <tr>
      <td className="customer-name">{proj.account}</td>
      <td>{proj.project}</td>
      <td className="right">{formatCurrency(revenue)}</td>
      <td className="right">{formatCurrency(projected)}</td>
      <td className="right">
        <span className={`badge ${margin < 0 ? 'unhealthy' : 'warning'}`}>{margin}%</span>
      </td>
      <td className="right">
        <span className="text-danger">-{gap}pp</span>
      </td>
      <td className="report-recommendation">{recommendation}</td>
    </tr>
  );
}
