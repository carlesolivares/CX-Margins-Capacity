import { useState, useMemo } from 'react';
import type { RevenueLineItem } from '../utils/fileParser';
import { parseRevenueFileDetailed } from '../utils/fileParser';
import { FileUpload } from '../components/FileUpload';
import { formatCurrency } from '../utils/margins';
import { Receipt, Trash2, Filter } from 'lucide-react';

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
}

type SortKey = 'account' | 'project' | 'total' | number; // number = year

export function Revenue({ revenueItems, importRevenue, clearRevenue }: RevenueProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'deploy' | 'run'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('account');
  const [sortAsc, setSortAsc] = useState(true);

  const handleFile = async (file: File) => {
    const parsed = await parseRevenueFileDetailed(file);
    if (parsed.length === 0) {
      throw new Error('No valid revenue rows found in file');
    }
    importRevenue(parsed);
  };

  // Collect all years present in the data
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const item of revenueItems) {
      for (const y of Object.keys(item.yearAmounts)) {
        set.add(Number(y));
      }
    }
    return [...set].sort();
  }, [revenueItems]);

  // Filter by type then aggregate by account+project
  const aggregated = useMemo(() => {
    const filtered = typeFilter === 'all'
      ? revenueItems
      : revenueItems.filter(r => r.type === typeFilter);

    const map = new Map<string, AggregatedRow>();

    for (const item of filtered) {
      const key = `${item.account}|||${item.project}`;
      if (!map.has(key)) {
        map.set(key, { account: item.account, project: item.project, yearAmounts: {}, total: 0 });
      }
      const row = map.get(key)!;
      for (const [y, amount] of Object.entries(item.yearAmounts)) {
        const year = Number(y);
        row.yearAmounts[year] = (row.yearAmounts[year] || 0) + amount;
        row.total += amount;
      }
    }

    return Array.from(map.values());
  }, [revenueItems, typeFilter]);

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
      } else {
        // year
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
      setSortAsc(key === 'account' || key === 'project');
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

  return (
    <div className="page">
      <h2>Revenue</h2>

      <FileUpload
        label="Import Revenue File"
        description="CSV/Excel with payment lines: Account/Program, Type (licenses=RUN, setup=Deploy), and year columns (2025, 2026, 2027...)"
        accept=".csv,.xlsx,.xls"
        onFile={handleFile}
      />

      {revenueItems.length > 0 && (
        <>
          <div className="section-header">
            <h3>
              <Receipt size={18} />
              Revenue by Project ({aggregated.length} projects, {revenueItems.length} lines)
            </h3>
            <div className="header-actions">
              <div className="filter-group">
                <Filter size={14} />
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value as 'all' | 'deploy' | 'run')}
                  className="filter-select"
                >
                  <option value="all">All types ({revenueItems.length})</option>
                  <option value="deploy">Deploy / Setup ({typeCounts.deploy})</option>
                  <option value="run">RUN / Licenses ({typeCounts.run})</option>
                </select>
              </div>
              <button className="btn btn-danger" onClick={clearRevenue}>
                <Trash2 size={14} /> Clear
              </button>
            </div>
          </div>

          <div className="summary-grid-4">
            {years.map(y => (
              <div className="summary-card neutral-card" key={y}>
                <span className="summary-label">{y}</span>
                <span className="summary-value">{formatCurrency(yearTotals.byYear[y] || 0)}</span>
              </div>
            ))}
            <div className="summary-card deployment">
              <span className="summary-label">Grand Total</span>
              <span className="summary-value">{formatCurrency(yearTotals.grandTotal)}</span>
            </div>
          </div>

          {aggregated.length > 0 && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('account')}>Account{indicator('account')}</th>
                    <th onClick={() => toggleSort('project')}>Project{indicator('project')}</th>
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
