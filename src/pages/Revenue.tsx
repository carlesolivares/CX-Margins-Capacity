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

interface DisplayRow {
  account: string;
  project: string;
  type: string;
  yearAmounts: Record<number, number>;
  total: number;
  startDate: string;
  endDate: string;
}

type SortKey = 'account' | 'project' | 'type' | 'total' | 'startDate' | 'endDate' | number;

function typeLabel(t: string): string {
  if (t === 'run') return 'License';
  if (t === 'deploy') return 'Setup';
  return t;
}

export function Revenue({ revenueItems, importRevenue, clearRevenue }: RevenueProps) {
  const [sortKey, setSortKey] = useState<SortKey>('account');
  const [sortAsc, setSortAsc] = useState(true);

  const handleFile = async (file: File) => {
    const parsed = await parseRevenueFileDetailed(file);
    if (parsed.length === 0) {
      throw new Error('No valid revenue rows found in file');
    }
    importRevenue(parsed);
  };

  // Build display rows (one per imported line)
  const displayRows = useMemo((): DisplayRow[] => {
    return revenueItems.map(item => {
      const total = Object.values(item.yearAmounts).reduce((s, v) => s + v, 0);
      return {
        account: item.account,
        project: item.project,
        type: item.type,
        yearAmounts: item.yearAmounts,
        total,
        startDate: item.startDate || '',
        endDate: item.endDate || '',
      };
    });
  }, [revenueItems]);

  // Collect all years
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const row of displayRows) {
      for (const y of Object.keys(row.yearAmounts)) {
        set.add(Number(y));
      }
    }
    return [...set].sort();
  }, [displayRows]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...displayRows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'account') {
        cmp = a.account.localeCompare(b.account);
      } else if (sortKey === 'project') {
        cmp = a.project.localeCompare(b.project);
      } else if (sortKey === 'type') {
        cmp = a.type.localeCompare(b.type);
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
  }, [displayRows, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'account' || key === 'project' || key === 'type' || key === 'startDate' || key === 'endDate');
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
    for (const row of displayRows) {
      for (const y of years) {
        totals[y] += row.yearAmounts[y] || 0;
      }
      grandTotal += row.total;
    }
    return { byYear: totals, grandTotal };
  }, [displayRows, years]);

  return (
    <div className="page">
      <h2>Revenue</h2>

      <FileUpload
        label="Import Revenue File"
        description="CSV/Excel: Account, Program, Type (license/setup), year columns, Date début / Date fin (licenses), Invoice date / Payment delay (setup)."
        accept=".csv,.xlsx,.xls"
        onFile={handleFile}
      />

      {revenueItems.length > 0 && (
        <>
          <div className="section-header">
            <h3>
              <Receipt size={18} />
              Revenue ({displayRows.length} lines)
            </h3>
            <div className="header-actions">
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
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'Revenue']} />
                  <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginTop: 4 }}>
                Grand Total: <strong>{formatCurrency(yearTotals.grandTotal)}</strong>
              </div>
            </div>
          )}

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('account')}>Account{indicator('account')}</th>
                  <th onClick={() => toggleSort('project')}>Program{indicator('project')}</th>
                  <th onClick={() => toggleSort('type')}>Type{indicator('type')}</th>
                  <th className="date-cell" onClick={() => toggleSort('startDate')}>Début{indicator('startDate')}</th>
                  <th className="date-cell" onClick={() => toggleSort('endDate')}>Fin{indicator('endDate')}</th>
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
                    <td><span className={`badge ${row.type === 'run' ? 'healthy' : row.type === 'deploy' ? 'warning' : ''}`}>{typeLabel(row.type)}</span></td>
                    <td className="date-cell">{row.startDate || '—'}</td>
                    <td className="date-cell">{row.endDate || '—'}</td>
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
                  <td></td>
                  <td></td>
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
        </>
      )}
    </div>
  );
}
