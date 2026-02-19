import { useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets } from '../types';
import { formatCurrency, isDeployComplete, calculateProjectMargins } from '../utils/margins';
import { computeProjections, computeTotalDemandByMonth, computeTeamCapacityByMonth } from '../utils/simulation';
import type { ProjectProjection } from '../utils/simulation';
import {
  FileText, AlertTriangle, CheckCircle, TrendingDown, Users, DollarSign,
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

  // Financial overview: available money (cost budget based on target margins) vs team cost
  const financials = useMemo(() => {
    const deployRev = deployAnalysis.totalRev;
    const deployAvailable = deployRev * (1 - targets.deployMargin / 100);

    const runRev = runAnalysis.totalRev;
    const runAvailable = runRev * (1 - targets.runMargin / 100);

    const combinedAvailable = deployAvailable + runAvailable;

    // Consumed costs from project data
    const deployConsumed = projects.reduce((s, p) => s + (p.deployConso || 0), 0);
    const runConsumed = projects.reduce((s, p) => s + (p.runConso || 0), 0);
    const totalConsumed = deployConsumed + runConsumed;

    // Remaining = available budget - already consumed
    const deployRemaining = deployAvailable - deployConsumed;
    const runRemaining = runAvailable - runConsumed;
    const combinedRemaining = deployRemaining + runRemaining;

    // Team cost forecast from today to Dec 31
    const today = new Date();
    const currentQ = Math.floor(today.getMonth() / 3); // 0=Q1, 1=Q2, 2=Q3, 3=Q4
    const qStartMonth = currentQ * 3;
    const qStartDate = new Date(today.getFullYear(), qStartMonth, 1);
    const qEndDate = new Date(today.getFullYear(), qStartMonth + 3, 0); // last day of quarter
    const qTotalMs = qEndDate.getTime() - qStartDate.getTime();
    const qElapsedMs = today.getTime() - qStartDate.getTime();
    const remainingPct = 1 - (qTotalMs > 0 ? qElapsedMs / qTotalMs : 0);

    const qKeys = ['q1Days', 'q2Days', 'q3Days', 'q4Days'] as const;
    const forecastTeamCost = members.reduce((s, m) => {
      let memberForecast = 0;
      for (let q = 0; q < 4; q++) {
        const days = m[qKeys[q]];
        if (q < currentQ) {
          // Past quarter: already consumed, skip
        } else if (q === currentQ) {
          // Current quarter: remaining portion
          memberForecast += days * remainingPct * m.dailyRate;
        } else {
          // Future quarter: full cost
          memberForecast += days * m.dailyRate;
        }
      }
      return s + memberForecast;
    }, 0);

    const forecastBalance = combinedRemaining - forecastTeamCost;

    return {
      deployAvailable, runAvailable, combinedAvailable,
      deployConsumed, runConsumed, totalConsumed,
      deployRemaining, runRemaining, combinedRemaining,
      forecastTeamCost, forecastBalance,
      currentQ, remainingPct,
    };
  }, [deployAnalysis, runAnalysis, members, targets, projects]);

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
        <div className="report-kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
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
            <span className="report-kpi-label">Total Margin</span>
            {(() => {
              const totalRev = deployAnalysis.totalRev + runAnalysis.totalRev;
              const totalProj = deployAnalysis.totalProj + runAnalysis.totalProj;
              const totalMargin = totalRev > 0 ? Math.round(((totalRev - totalProj) / totalRev) * 1000) / 10 : 0;
              return (
                <>
                  <span className={`report-kpi-value ${totalMargin >= 0 ? 'healthy' : 'unhealthy'}`}>
                    {totalMargin}%
                  </span>
                  <span className="report-kpi-sub">Deploy + RUN combined</span>
                </>
              );
            })()}
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

      {/* ── 2. Financial Overview ── */}
      <div className="report-section">
        <h3><DollarSign size={18} /> Financial Overview</h3>

        {/* Remaining Budget after Consumption */}
        <h4>Remaining Budget (Available &minus; Consumed)</h4>
        <p className="report-hint">
          How much of the cost budget is still available after subtracting actual consumed costs.
        </p>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th className="right">Available Money</th>
                <th className="right">Consumed</th>
                <th className="right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Deploy</strong></td>
                <td className="right">{formatCurrency(financials.deployAvailable)}</td>
                <td className="right">{formatCurrency(financials.deployConsumed)}</td>
                <td className="right">
                  <span className={financials.deployRemaining >= 0 ? 'text-success' : 'text-danger'}>
                    {formatCurrency(financials.deployRemaining)}
                  </span>
                </td>
              </tr>
              <tr>
                <td><strong>RUN</strong></td>
                <td className="right">{formatCurrency(financials.runAvailable)}</td>
                <td className="right">{formatCurrency(financials.runConsumed)}</td>
                <td className="right">
                  <span className={financials.runRemaining >= 0 ? 'text-success' : 'text-danger'}>
                    {formatCurrency(financials.runRemaining)}
                  </span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Combined</strong></td>
                <td className="right"><strong>{formatCurrency(financials.combinedAvailable)}</strong></td>
                <td className="right"><strong>{formatCurrency(financials.totalConsumed)}</strong></td>
                <td className="right">
                  <strong className={financials.combinedRemaining >= 0 ? 'text-success' : 'text-danger'}>
                    {formatCurrency(financials.combinedRemaining)}
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Forecast: Remaining Budget vs Team Cost to Year-End */}
        <h4 style={{ marginTop: 24 }}>Forecast: Remaining Budget vs Team Cost to Year-End</h4>
        <p className="report-hint">
          Team cost forecast from today (Q{financials.currentQ + 1}, {Math.round(financials.remainingPct * 100)}% remaining) through Q4.
          Compares remaining budget to upcoming team expenses.
        </p>

        <div className="report-kpi-grid report-kpi-grid-3" style={{ marginTop: 12 }}>
          <div className="report-kpi-card">
            <span className="report-kpi-label">Remaining Budget</span>
            <span className={`report-kpi-value ${financials.combinedRemaining >= 0 ? 'healthy' : 'unhealthy'}`}>
              {formatCurrency(financials.combinedRemaining)}
            </span>
            <span className="report-kpi-sub">Available &minus; consumed</span>
          </div>
          <div className="report-kpi-card">
            <span className="report-kpi-label">Team Cost (Remaining Year)</span>
            <span className="report-kpi-value">{formatCurrency(financials.forecastTeamCost)}</span>
            <span className="report-kpi-sub">Q{financials.currentQ + 1} ({Math.round(financials.remainingPct * 100)}%) + Q{Math.min(financials.currentQ + 2, 4)}&ndash;Q4</span>
          </div>
          <div className="report-kpi-card">
            <span className="report-kpi-label">Forecast Balance</span>
            <span className={`report-kpi-value ${financials.forecastBalance >= 0 ? 'healthy' : 'unhealthy'}`}>
              {formatCurrency(financials.forecastBalance)}
            </span>
            <span className="report-kpi-sub">{financials.forecastBalance >= 0 ? 'Sufficient' : 'Shortfall'}</span>
          </div>
        </div>

        {financials.forecastBalance < 0 && (
          <div className="report-action-box danger" style={{ marginTop: 12 }}>
            <AlertTriangle size={16} />
            <div>
              <strong>Budget shortfall of {formatCurrency(Math.abs(financials.forecastBalance))} projected for the remainder of the year.</strong>
              <p>You may need to reduce team capacity, lower rates, or increase project revenue to cover team costs through year-end.</p>
            </div>
          </div>
        )}

        {financials.forecastBalance >= 0 && (
          <div className="report-action-box success" style={{ marginTop: 12 }}>
            <CheckCircle size={16} />
            <div>
              <strong>Remaining budget covers team costs through year-end with {formatCurrency(financials.forecastBalance)} to spare.</strong>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Margin Recommendations ── */}

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

      {/* ── 4. Stable Projects ── */}
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
                  <th className="right">Total Margin</th>
                  <th className="right">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stableProjects.map(p => {
                  const totalRev = p.deployRevenue + p.runRevenue;
                  const totalCost = p.deployCost + p.runCost;
                  const totalMargin = totalRev > 0 ? Math.round(((totalRev - totalCost) / totalRev) * 1000) / 10 : 0;
                  return (
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
                      <td className="right">
                        <span className={`badge ${totalMargin >= 0 ? 'healthy' : 'unhealthy'}`}>{totalMargin}%</span>
                      </td>
                      <td className="right">{formatCurrency(totalRev)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="report-warning-box">
            No projects are currently meeting both margin targets.
          </div>
        )}
      </div>

      {/* ── 5. Capacity vs Demand ── */}
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
