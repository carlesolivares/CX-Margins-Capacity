import { useState, useMemo } from 'react';
import type { RevenueLineItem } from '../utils/fileParser';
import { parseRevenueFileDetailed } from '../utils/fileParser';
import { FileUpload } from '../components/FileUpload';
import { formatCurrency } from '../utils/margins';
import { Receipt, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface RevenueProps {
  revenueItems: RevenueLineItem[];
  importRevenue: (items: RevenueLineItem[]) => void;
  clearRevenue: () => void;
}

interface AggregatedRow {
  account: string;
  project: string;
  yearAmounts: Record<number, number>;
  total: number;
  startDate: string;
  endDate: string;
}

type SortKey = 'account' | 'project' | 'total' | 'startDate' | 'endDate' | number;
type ViewMode = 'setup' | 'licenses';

export function Revenue({ revenueItems, importRevenue, clearRevenue }: RevenueProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('licenses');
  const [sortKey, setSortKey] = useState<SortKey>('account');
  const [sortAsc, setSortAsc] = useState(true);

  const handleFile = async (file: File) => {
    const parsed = await parseRevenueFileDetailed(file);
    if (parsed.length === 0) {
      throw new Error('No valid revenue rows found in file');
    }
    importRevenue(parsed);
  };

  const typeFilter = viewMode === 'setup' ? 'deploy' : 'run';

  // Collect all years present in filtered data
  const filteredItems = useMemo(
    () => revenueItems.filter(r => r.type === typeFilter),
    [revenueItems, typeFilter],
  );

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const item of filteredItems) {
      for (const y of Object.keys(item.yearAmounts)) {
        set.add(Number(y));
      }
    }
    return [...set].sort();
  }, [filteredItems]);

  // Aggregate by account+project
  const aggregated = useMemo(() => {
    const map = new Map<string, AggregatedRow>();

    for (const item of filteredItems) {
      const key = `${item.account}|||${item.project}`;
      if (!map.has(key)) {
        map.set(key, {
          account: item.account,
          project: item.project,
          yearAmounts: {},
          total: 0,
          startDate: item.startDate || '',
          endDate: item.endDate || '',
        });
      }
      const row = map.get(key)!;
      for (const [y, amount] of Object.entries(item.yearAmounts)) {
        const year = Number(y);
        row.yearAmounts[year] = (row.yearAmounts[year] || 0) + amount;
        row.total += amount;
      }
      // Keep earliest start, latest end
      if (item.startDate && (!row.startDate || item.startDate < row.startDate)) {
        row.startDate = item.startDate;
      }
      if (item.endDate && (!row.endDate || item.endDate > row.endDate)) {
        row.endDate = item.endDate;
      }
    }

    return Array.from(map.values());
  }, [filteredItems]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...aggregated];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'account') {
        cmp = a.account.localeCompare(b.account);
      } else if (sortKey === 'project') {
        cmp = a.project.localeCompare(b.project);
      } else if (sortKey === 'total') {
        cmp = a.total - b.total;
      } else if (sortKey === 'startDate') {
        cmp = (a.startDate || '').localeCompare(b.startDate || '');
      } else if (sortKey === 'endDate') {
        cmp = (a.endDate || '').localeCompare(b.endDate || '');
      } else {
        cmp = (a.yearAmounts[sortKey] || 0) - (b.yearAmounts[sortKey] || 0);
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [aggregated, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'account' || key === 'project' || key === 'startDate' || key === 'endDate');
    }
  };

  const indicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="sort-indicator">{sortAsc ? ' ▲' : ' ▼'}</span>;
  };

  // Year totals
  const yearTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    let grandTotal = 0;
    for (const y of years) {
      totals[y] = 0;
    }
    for (const row of aggregated) {
      for (const y of years) {
        totals[y] += row.yearAmounts[y] || 0;
      }
      grandTotal += row.total;
    }
    return { byYear: totals, grandTotal };
  }, [aggregated, years]);

  // Type counts
  const typeCounts = useMemo(() => {
    let deploy = 0, run = 0;
    for (const item of revenueItems) {
      if (item.type === 'deploy') deploy++;
      else if (item.type === 'run') run++;
    }
    return { deploy, run };
  }, [revenueItems]);

  const isLicenses = viewMode === 'licenses';

  return (
    <div className="page">
      <h2>Revenue</h2>

      <FileUpload
        label="Import Revenue File"
        description="CSV/Excel with payment lines: Account/Program, Type (licenses=RUN, setup=Deploy), year columns, and optionally Date début / Date fin for licenses."
        accept=".csv,.xlsx,.xls"
        onFile={handleFile}
      />

      {revenueItems.length > 0 && (
        <>
          <div className="section-header">
            <h3>
              <Receipt size={18} />
              {isLicenses ? 'Licenses' : 'Setup'} ({aggregated.length} projects)
            </h3>
            <div className="header-actions">
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${viewMode === 'setup' ? 'active' : ''}`}
                  onClick={() => setViewMode('setup')}
                >
                  Setup ({typeCounts.deploy})
                </button>
                <button
                  className={`toggle-btn ${viewMode === 'licenses' ? 'active' : ''}`}
                  onClick={() => setViewMode('licenses')}
                >
                  Licenses ({typeCounts.run})
                </button>
              </div>
              <button className="btn btn-danger" onClick={clearRevenue}>
                <Trash2 size={14} /> Clear
              </button>
            </div>
          </div>

          {years.length > 0 && (
            <div className="chart-container chart-full-width">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={years.map(y => ({ year: String(y), amount: yearTotals.byYear[y] || 0 }))}
                  margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 13 }} />
                  <YAxis tickFormatter={v => formatCurrency(v as number)} tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={(value) => [formatCurrency(value as number), isLicenses ? 'Licenses' : 'Setup']} />
                  <Bar dataKey="amount" fill={isLicenses ? '#6366f1' : '#10b981'} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginTop: 4 }}>
                Grand Total: <strong>{formatCurrency(yearTotals.grandTotal)}</strong>
              </div>
            </div>
          )}

          {aggregated.length > 0 && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('account')}>Account{indicator('account')}</th>
                    <th onClick={() => toggleSort('project')}>Project{indicator('project')}</th>
                    {isLicenses && (
                      <>
                        <th className="date-cell" onClick={() => toggleSort('startDate')}>Début{indicator('startDate')}</th>
                        <th className="date-cell" onClick={() => toggleSort('endDate')}>Fin{indicator('endDate')}</th>
                      </>
                    )}
                    {years.map(y => (
                      <th key={y} className="right" onClick={() => toggleSort(y)}>
                        {y}{indicator(y)}
                      </th>
                    ))}
                    <th className="right" onClick={() => toggleSort('total')}>Total{indicator('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr key={i}>
                      <td className="customer-name">{row.account}</td>
                      <td>{row.project || '—'}</td>
                      {isLicenses && (
                        <>
                          <td className="date-cell">{row.startDate || '—'}</td>
                          <td className="date-cell">{row.endDate || '—'}</td>
                        </>
                      )}
                      {years.map(y => {
                        const val = row.yearAmounts[y] || 0;
                        return (
                          <td key={y} className="right">
                            {val > 0 ? formatCurrency(val) : '—'}
                          </td>
                        );
                      })}
                      <td className="right"><strong>{formatCurrency(row.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td><strong>Total</strong></td>
                    <td></td>
                    {isLicenses && (
                      <>
                        <td></td>
                        <td></td>
                      </>
                    )}
                    {years.map(y => (
                      <td key={y} className="right">
                        <strong>{formatCurrency(yearTotals.byYear[y] || 0)}</strong>
                      </td>
                    ))}
                    <td className="right"><strong>{formatCurrency(yearTotals.grandTotal)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
