import type { CustomerMargin } from '../types';
import { formatCurrency, formatPercent } from '../utils/margins';
import { useSort } from '../hooks/useSort';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface MarginTableProps {
  margins: CustomerMargin[];
}

export function MarginTable({ margins }: MarginTableProps) {
  const { sorted, toggle, sortIndicator } = useSort(margins);

  if (margins.length === 0) {
    return <div className="empty-state">No data yet. Import a project file to see margins.</div>;
  }

  const hasProjects = margins.some(m => m.project);

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th onClick={() => toggle('account')}>Account{sortIndicator('account')}</th>
            {hasProjects && <th onClick={() => toggle('project')}>Project{sortIndicator('project')}</th>}
            <th className="right" onClick={() => toggle('deployRevenue')}>Deploy Revenue{sortIndicator('deployRevenue')}</th>
            <th className="right" onClick={() => toggle('deployCost')}>Deploy Cost{sortIndicator('deployCost')}</th>
            <th className="right" onClick={() => toggle('deployMargin')}>Deploy Margin{sortIndicator('deployMargin')}</th>
            <th className="right" onClick={() => toggle('runRevenue')}>RUN Revenue{sortIndicator('runRevenue')}</th>
            <th className="right" onClick={() => toggle('runCost')}>RUN Cost{sortIndicator('runCost')}</th>
            <th className="right" onClick={() => toggle('runMargin')}>RUN Margin{sortIndicator('runMargin')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => (
            <tr key={hasProjects ? `${m.account}-${m.project}-${i}` : m.account}>
              <td className="customer-name">{m.account}</td>
              {hasProjects && <td>{m.project || '—'}</td>}
              <td className="right">{formatCurrency(m.deployRevenue)}</td>
              <td className="right">{formatCurrency(m.deployCost)}</td>
              <td className={`right margin-cell ${m.deployRevenue > 0 ? (m.deployHealthy ? 'healthy' : 'unhealthy') : ''}`}>
                {m.deployRevenue > 0 ? (
                  <>
                    {m.deployHealthy ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {formatPercent(m.deployMargin)}
                  </>
                ) : '—'}
              </td>
              <td className="right">{formatCurrency(m.runRevenue)}</td>
              <td className="right">{formatCurrency(m.runCost)}</td>
              <td className={`right margin-cell ${m.runRevenue > 0 ? (m.runHealthy ? 'healthy' : 'unhealthy') : ''}`}>
                {m.runRevenue > 0 ? (
                  <>
                    {m.runHealthy ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {formatPercent(m.runMargin)}
                  </>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            {hasProjects && <td></td>}
            <td className="right"><strong>{formatCurrency(margins.reduce((s, m) => s + m.deployRevenue, 0))}</strong></td>
            <td className="right"><strong>{formatCurrency(margins.reduce((s, m) => s + m.deployCost, 0))}</strong></td>
            <td className="right">
              <strong>
                {(() => {
                  const rev = margins.reduce((s, m) => s + m.deployRevenue, 0);
                  const cost = margins.reduce((s, m) => s + m.deployCost, 0);
                  return rev > 0 ? formatPercent(((rev - cost) / rev) * 100) : '—';
                })()}
              </strong>
            </td>
            <td className="right"><strong>{formatCurrency(margins.reduce((s, m) => s + m.runRevenue, 0))}</strong></td>
            <td className="right"><strong>{formatCurrency(margins.reduce((s, m) => s + m.runCost, 0))}</strong></td>
            <td className="right">
              <strong>
                {(() => {
                  const rev = margins.reduce((s, m) => s + m.runRevenue, 0);
                  const cost = margins.reduce((s, m) => s + m.runCost, 0);
                  return rev > 0 ? formatPercent(((rev - cost) / rev) * 100) : '—';
                })()}
              </strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
