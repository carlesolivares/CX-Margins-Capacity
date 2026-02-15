import { useState, useMemo } from 'react';
import type { RevenueLineItem } from '../utils/fileParser';
import { parseRevenueFileDetailed } from '../utils/fileParser';
import { FileUpload } from '../components/FileUpload';
import { formatCurrency } from '../utils/margins';
import { Receipt, Trash2, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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

interface ConsolidatedRow {
  account: string;
  project: string;
  yearAmounts: Record<number, number>;
  total: number;
  lines: number;
}

type ViewMode = 'detail' | 'consolidated';
type TypeFilter = 'all' | 'deploy' | 'run';
type SortKey = 'account' | 'project' | 'type' | 'total' | 'startDate' | 'endDate' | 'lines' | number;

function typeLabel(t: string): string {
  if (t === 'run') return 'License';
  if (t === 'deploy') return 'Setup';
  return t;
}

export function Revenue({ revenueItems, importRevenue, clearRevenue }: RevenueProps) {
  const [view, setView] = useState<ViewMode>('consolidated');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('account');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const switchView = (v: ViewMode) => { setView(v); setSelectedRow(null); };
  const switchFilter = (f: TypeFilter) => { setTypeFilter(f); setSelectedRow(null); };

  const handleFile = async (file: File) => {
    const parsed = await parseRevenueFileDetailed(file);
    if (parsed.length === 0) {
      throw new Error('No valid revenue rows found in file');
    }
    importRevenue(parsed);
  };

  // Filter by type
  const filteredItems = useMemo(() => {
    if (typeFilter === 'all') return revenueItems;
    return revenueItems.filter(item => item.type === typeFilter);
  }, [revenueItems, typeFilter]);

  // Build display rows (one per imported line)
  const displayRows = useMemo((): DisplayRow[] => {
    return filteredItems.map(item => {
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
  }, [filteredItems]);

  // Build consolidated rows (one per program)
  const consolidatedRows = useMemo((): ConsolidatedRow[] => {
    const map = new Map<string, ConsolidatedRow>();
    for (const item of filteredItems) {
      const key = item.project || item.account;
      const existing = map.get(key);
      if (existing) {
        for (const [y, v] of Object.entries(item.yearAmounts)) {
          existing.yearAmounts[Number(y)] = (existing.yearAmounts[Number(y)] || 0) + v;
        }
        existing.total += Object.values(item.yearAmounts).reduce((s, v) => s + v, 0);
        existing.lines += 1;
        // Use first account found
      } else {
        const yearAmounts: Record<number, number> = {};
        for (const [y, v] of Object.entries(item.yearAmounts)) {
          yearAmounts[Number(y)] = v;
        }
        map.set(key, {
          account: item.account,
          project: item.project,
          yearAmounts,
          total: Object.values(item.yearAmounts).reduce((s, v) => s + v, 0),
          lines: 1,
        });
      }
    }
    return [...map.values()];
  }, [filteredItems]);

  // Collect all years (from filtered items)
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const item of filteredItems) {
      for (const y of Object.keys(item.yearAmounts)) {
        set.add(Number(y));
      }
    }
    return [...set].sort();
  }, [filteredItems]);

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
      } else if (typeof sortKey === 'number') {
        cmp = (a.yearAmounts[sortKey] || 0) - (b.yearAmounts[sortKey] || 0);
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [displayRows, sortKey, sortAsc]);

  // Sort consolidated
  const sortedConsolidated = useMemo(() => {
    const copy = [...consolidatedRows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'account') {
        cmp = a.account.localeCompare(b.account);
      } else if (sortKey === 'project') {
        cmp = a.project.localeCompare(b.project);
      } else if (sortKey === 'total') {
        cmp = a.total - b.total;
      } else if (sortKey === 'lines') {
        cmp = a.lines - b.lines;
      } else if (typeof sortKey === 'number') {
        cmp = (a.yearAmounts[sortKey] || 0) - (b.yearAmounts[sortKey] || 0);
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [consolidatedRows, sortKey, sortAsc]);

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

  // Year totals (all rows)
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

  // Chart data: if a row is selected, show only that row; otherwise show totals
  const chartAmounts = useMemo(() => {
    if (selectedRow === null) return yearTotals;
    const activeRows = view === 'detail' ? sorted : sortedConsolidated;
    const row = activeRows[selectedRow];
    if (!row) return yearTotals;
    const byYear: Record<number, number> = {};
    for (const y of years) {
      byYear[y] = row.yearAmounts[y] || 0;
    }
    const grandTotal = Object.values(byYear).reduce((s, v) => s + v, 0);
    return { byYear, grandTotal };
  }, [selectedRow, yearTotals, view, sorted, sortedConsolidated, years]);

  const selectedRowLabel = useMemo(() => {
    if (selectedRow === null) return null;
    const activeRows = view === 'detail' ? sorted : sortedConsolidated;
    const row = activeRows[selectedRow];
    if (!row) return null;
    return row.project || row.account;
  }, [selectedRow, view, sorted, sortedConsolidated]);

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
              Revenue ({view === 'detail' ? `${displayRows.length} lines` : `${consolidatedRows.length} programs`})
            </h3>
            <div className="header-actions">
              <div className="toggle-group">
                <button className={`toggle-btn ${view === 'detail' ? 'active' : ''}`} onClick={() => switchView('detail')}>Detail</button>
                <button className={`toggle-btn ${view === 'consolidated' ? 'active' : ''}`} onClick={() => switchView('consolidated')}>Consolidated</button>
              </div>
              <div className="toggle-group">
                <button className={`toggle-btn ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => switchFilter('all')}>
                  <Filter size={12} /> All
                </button>
                <button className={`toggle-btn ${typeFilter === 'deploy' ? 'active' : ''}`} onClick={() => switchFilter('deploy')}>Setup</button>
                <button className={`toggle-btn ${typeFilter === 'run' ? 'active' : ''}`} onClick={() => switchFilter('run')}>License</button>
              </div>
              <button className="btn btn-danger" onClick={clearRevenue}>
                <Trash2 size={14} /> Clear
              </button>
            </div>
          </div>

          {years.length > 0 && (() => {
            const chartData = years.map(y => ({ year: String(y), yearNum: y, amount: chartAmounts.byYear[y] || 0 }));
            return (
              <div className="chart-container chart-full-width">
                {selectedRowLabel && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4, fontSize: 13, color: '#4338ca' }}>
                    <strong>{selectedRowLabel}</strong>
                    <button
                      onClick={() => setSelectedRow(null)}
                      style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
                    >
                      Show all
                    </button>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 13 }} />
                    <YAxis tickFormatter={v => formatCurrency(v as number)} tick={{ fontSize: 11 }} width={90} />
                    <Tooltip formatter={(value) => [formatCurrency(value as number), 'Revenue']} />
                    <Bar
                      dataKey="amount"
                      radius={[4, 4, 0, 0]}
                      style={{ cursor: 'pointer' }}
                      onClick={(_, index) => {
                        const yr = chartData[index]?.yearNum;
                        if (yr != null) setSelectedYear(prev => prev === yr ? null : yr);
                      }}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.year}
                          fill={selectedYear === entry.yearNum ? '#4338ca' : (selectedRow !== null ? '#818cf8' : '#6366f1')}
                          opacity={selectedYear && selectedYear !== entry.yearNum ? 0.4 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  {selectedRow !== null ? 'Selected' : 'Grand'} Total: <strong>{formatCurrency(chartAmounts.grandTotal)}</strong>
                  {selectedYear && (
                    <span style={{ marginLeft: 16 }}>
                      {selectedYear}: <strong>{formatCurrency(chartAmounts.byYear[selectedYear] || 0)}</strong>
                      <button
                        onClick={() => setSelectedYear(null)}
                        style={{ marginLeft: 8, background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 13 }}
                      >
                        (clear)
                      </button>
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {view === 'detail' ? (
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
                      <th key={y} className={`right${selectedYear === y ? ' col-highlight' : ''}`} onClick={() => toggleSort(y)}>
                        {y}{indicator(y)}
                      </th>
                    ))}
                    <th className="right" onClick={() => toggleSort('total')}>Total{indicator('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedRow(prev => prev === i ? null : i)}
                      className={selectedRow === i ? 'row-selected' : ''}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="customer-name">{row.account}</td>
                      <td>{row.project || '—'}</td>
                      <td><span className={`badge ${row.type === 'run' ? 'healthy' : row.type === 'deploy' ? 'warning' : ''}`}>{typeLabel(row.type)}</span></td>
                      <td className="date-cell">{row.startDate || '—'}</td>
                      <td className="date-cell">{row.endDate || '—'}</td>
                      {years.map(y => {
                        const val = row.yearAmounts[y] || 0;
                        return (
                          <td key={y} className={`right${selectedYear === y ? ' col-highlight' : ''}`}>
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
                      <td key={y} className={`right${selectedYear === y ? ' col-highlight' : ''}`}>
                        <strong>{formatCurrency(yearTotals.byYear[y] || 0)}</strong>
                      </td>
                    ))}
                    <td className="right"><strong>{formatCurrency(yearTotals.grandTotal)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('account')}>Account{indicator('account')}</th>
                    <th onClick={() => toggleSort('project')}>Program{indicator('project')}</th>
                    <th className="right" onClick={() => toggleSort('lines')}>Lines{indicator('lines')}</th>
                    {years.map(y => (
                      <th key={y} className={`right${selectedYear === y ? ' col-highlight' : ''}`} onClick={() => toggleSort(y)}>
                        {y}{indicator(y)}
                      </th>
                    ))}
                    <th className="right" onClick={() => toggleSort('total')}>Total{indicator('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedConsolidated.map((row, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedRow(prev => prev === i ? null : i)}
                      className={selectedRow === i ? 'row-selected' : ''}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="customer-name">{row.account}</td>
                      <td>{row.project || '—'}</td>
                      <td className="right">{row.lines}</td>
                      {years.map(y => {
                        const val = row.yearAmounts[y] || 0;
                        return (
                          <td key={y} className={`right${selectedYear === y ? ' col-highlight' : ''}`}>
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
                    <td className="right"><strong>{displayRows.length}</strong></td>
                    {years.map(y => (
                      <td key={y} className={`right${selectedYear === y ? ' col-highlight' : ''}`}>
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
