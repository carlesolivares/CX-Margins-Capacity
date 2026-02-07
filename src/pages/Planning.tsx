import { useMemo, useState } from 'react';
import type { ProjectRow } from '../types';
import { Filter, ChevronLeft, ChevronRight } from 'lucide-react';

interface PlanningProps {
  projects: ProjectRow[];
}

interface TimelineProject {
  id: string;
  account: string;
  project: string;
  status: string;
  kickOff: Date | null;
  goLive: Date | null;
  contractEnd: Date | null;
  deployStart: Date | null;
  deployEnd: Date | null;
  runStart: Date | null;
  runEnd: Date | null;
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  const match = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

const STATUS_COLORS: Record<string, string> = {
  'Phase 1': '#3b82f6',
  'Phase 2': '#10b981',
  'Completed': '#6b7280',
  'On Hold': '#f59e0b',
  'At Risk': '#ef4444',
};

function getStatusColor(status: string): string {
  if (!status) return '#94a3b8';
  for (const [key, color] of Object.entries(STATUS_COLORS)) {
    if (status.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#8b5cf6';
}

export function Planning({ projects }: PlanningProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewYear, setViewYear] = useState(2026);

  // Dynamic year end based on viewYear
  const yearStart = new Date(viewYear, 0, 1);
  const yearEnd = new Date(viewYear, 11, 31);

  const statuses = useMemo(() => {
    const set = new Set(projects.map(p => p.status).filter(Boolean));
    return [...set].sort();
  }, [projects]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return projects;
    return projects.filter(p => p.status === statusFilter);
  }, [projects, statusFilter]);

  const timeline = useMemo((): TimelineProject[] => {
    return filtered.map(p => {
      const kickOff = parseDate(p.kickOff);
      const goLive = parseDate(p.goLive);
      const contractEnd = parseDate(p.contractEnd);

      // If no go-live, project is already in RUN (no deploy bar)
      // RUN for all of 2026: Jan 1 → Dec 31
      const deployStart = goLive ? kickOff : null;
      const deployEnd = goLive ? goLive : null;

      let runStart: Date | null = null;
      let runEnd: Date | null = null;
      if (goLive) {
        runStart = goLive;
        runEnd = (contractEnd && contractEnd <= yearEnd) ? contractEnd : yearEnd;
      } else {
        // No go-live → already in RUN for the full year
        runStart = new Date(viewYear, 0, 1);
        runEnd = (contractEnd && contractEnd <= yearEnd) ? contractEnd : yearEnd;
      }

      return {
        id: p.id,
        account: p.account,
        project: p.project,
        status: p.status,
        kickOff,
        goLive,
        contractEnd,
        deployStart,
        deployEnd,
        runStart,
        runEnd,
      };
    }).sort((a, b) => {
      const aStart = a.deployStart || a.runStart;
      const bStart = b.deployStart || b.runStart;
      if (!aStart && !bStart) return 0;
      if (!aStart) return 1;
      if (!bStart) return -1;
      return aStart.getTime() - bStart.getTime();
    });
  }, [filtered, viewYear, yearEnd]);

  // Filter to only show projects that have bars overlapping the view window
  const visibleTimeline = useMemo(() => {
    return timeline.filter(p => {
      const start = p.deployStart || p.runStart;
      const end = p.runEnd || p.deployEnd;
      if (!start || !end) return false;
      return start <= yearEnd && end >= yearStart;
    });
  }, [timeline, yearStart, yearEnd]);

  // Compute timeline boundaries — clamp to the view year
  const { minDate, maxDate } = useMemo(() => {
    let min = yearStart;
    let max = yearEnd;
    for (const p of visibleTimeline) {
      const dates = [p.deployStart, p.deployEnd, p.runStart, p.runEnd].filter(Boolean) as Date[];
      for (const d of dates) {
        if (d < min) min = d;
        if (d > max) max = d;
      }
    }
    return { minDate: min, maxDate: max };
  }, [visibleTimeline, yearStart, yearEnd]);

  const totalDays = Math.max(1, Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));

  const getPercent = (d: Date): number => {
    const clamped = d < minDate ? minDate : d > maxDate ? maxDate : d;
    const days = Math.round((clamped.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    return (days / totalDays) * 100;
  };

  // Generate month labels for the timeline header
  const monthLabels = useMemo(() => {
    const labels: { label: string; left: number; width: number }[] = [];
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    while (cursor <= maxDate) {
      const monthStart = new Date(cursor);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const effectiveStart = monthStart < minDate ? minDate : monthStart;
      const effectiveEnd = monthEnd > maxDate ? maxDate : monthEnd;
      const left = getPercent(effectiveStart);
      const right = getPercent(effectiveEnd);
      labels.push({
        label: `${months[cursor.getMonth()]} ${cursor.getFullYear() % 100}`,
        left,
        width: right - left,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return labels;
  }, [minDate, maxDate, totalDays]);

  // Today marker
  const today = new Date();
  const todayPct = today >= minDate && today <= maxDate ? getPercent(today) : null;

  // Detect available years from project data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of projects) {
      for (const dateStr of [p.kickOff, p.goLive, p.contractEnd]) {
        const d = parseDate(dateStr);
        if (d) years.add(d.getFullYear());
      }
    }
    // Always include 2025 and 2026
    years.add(2025);
    years.add(2026);
    return [...years].sort();
  }, [projects]);

  if (projects.length === 0) {
    return (
      <div className="page">
        <h2>Planning</h2>
        <div className="empty-state">Import projects to see the planning timeline.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="section-header">
        <h2 style={{ marginBottom: 0 }}>Planning</h2>
        <div className="header-actions">
          {/* Year navigation */}
          <div className="planning-year-nav">
            <button
              className="btn-icon"
              onClick={() => setViewYear(y => Math.max(availableYears[0], y - 1))}
              disabled={viewYear <= availableYears[0]}
              title="Previous year"
            >
              <ChevronLeft size={16} />
            </button>
            <select
              value={viewYear}
              onChange={e => setViewYear(Number(e.target.value))}
              className="filter-select"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              className="btn-icon"
              onClick={() => setViewYear(y => Math.min(availableYears[availableYears.length - 1], y + 1))}
              disabled={viewYear >= availableYears[availableYears.length - 1]}
              title="Next year"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {statuses.length > 0 && (
            <div className="filter-group">
              <Filter size={14} />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">All statuses ({projects.length})</option>
                {statuses.map(s => (
                  <option key={s} value={s}>
                    {s} ({projects.filter(p => p.status === s).length})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <p className="settings-desc">
        Timeline view of project phases. Deploy (blue): Kick-off &rarr; Go-live. RUN (green): Go-live &rarr; Contract end (or Dec 31, {viewYear}).
        Projects without a Go-live date are considered already in RUN for the full year.
      </p>

      {/* Legend */}
      <div className="planning-legend">
        <span className="planning-legend-item">
          <span className="planning-legend-color" style={{ background: '#3b82f6' }} /> Deploy
        </span>
        <span className="planning-legend-item">
          <span className="planning-legend-color" style={{ background: '#10b981' }} /> RUN
        </span>
        <span className="planning-legend-item">
          <span className="planning-legend-color" style={{ background: '#ef4444', width: 2, height: 14 }} /> Today
        </span>
      </div>

      <div className="planning-container">
        {/* Timeline header */}
        <div className="planning-header">
          <div className="planning-label-col">Project</div>
          <div className="planning-timeline-col">
            <div className="planning-months">
              {monthLabels.map((m, i) => (
                <div
                  key={i}
                  className="planning-month"
                  style={{ left: `${m.left}%`, width: `${m.width}%` }}
                >
                  {m.width > 2 ? m.label : ''}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline rows */}
        <div className="planning-body">
          {visibleTimeline.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No projects with activity in {viewYear}.
            </div>
          )}
          {visibleTimeline.map(p => (
            <div key={p.id} className="planning-row">
              <div className="planning-label-col">
                <div className="planning-project-info">
                  <span className="planning-account">{p.account}</span>
                  <span className="planning-project-name">{p.project}</span>
                </div>
                {p.status && (
                  <span
                    className="badge planning-status"
                    style={{ background: `${getStatusColor(p.status)}20`, color: getStatusColor(p.status) }}
                  >
                    {p.status}
                  </span>
                )}
              </div>
              <div className="planning-timeline-col">
                <div className="planning-bar-area">
                  {/* Deploy bar */}
                  {p.deployStart && p.deployEnd && p.deployEnd >= minDate && p.deployStart <= maxDate && (
                    <div
                      className="planning-bar planning-bar-deploy"
                      style={{
                        left: `${getPercent(p.deployStart)}%`,
                        width: `${Math.max(0.5, getPercent(p.deployEnd) - getPercent(p.deployStart))}%`,
                      }}
                      title={`Deploy: ${p.deployStart.toLocaleDateString()} \u2192 ${p.deployEnd.toLocaleDateString()}`}
                    />
                  )}
                  {/* RUN bar */}
                  {p.runStart && p.runEnd && p.runEnd >= minDate && p.runStart <= maxDate && (
                    <div
                      className="planning-bar planning-bar-run"
                      style={{
                        left: `${getPercent(p.runStart)}%`,
                        width: `${Math.max(0.5, getPercent(p.runEnd) - getPercent(p.runStart))}%`,
                      }}
                      title={`RUN: ${p.runStart.toLocaleDateString()} \u2192 ${p.runEnd.toLocaleDateString()}`}
                    />
                  )}
                  {/* Go-live marker */}
                  {p.goLive && p.goLive >= minDate && p.goLive <= maxDate && (
                    <div
                      className="planning-marker"
                      style={{ left: `${getPercent(p.goLive)}%` }}
                      title={`Go-live: ${p.goLive.toLocaleDateString()}`}
                    />
                  )}
                  {/* Today line */}
                  {todayPct !== null && (
                    <div className="planning-today" style={{ left: `${todayPct}%` }} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary table */}
      <h3 style={{ marginTop: 32 }}>Project Dates</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Project</th>
              <th>Status</th>
              <th>Kick-off</th>
              <th>Go-live</th>
              <th>Contract End</th>
              <th>Deploy Duration</th>
              <th>RUN Duration</th>
            </tr>
          </thead>
          <tbody>
            {visibleTimeline.map(p => {
              const deployDays = p.deployStart && p.deployEnd
                ? Math.round((p.deployEnd.getTime() - p.deployStart.getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const runDays = p.runStart && p.runEnd
                ? Math.round((p.runEnd.getTime() - p.runStart.getTime()) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <tr key={p.id}>
                  <td className="customer-name">{p.account}</td>
                  <td>{p.project}</td>
                  <td>
                    {p.status ? (
                      <span
                        className="badge"
                        style={{ background: `${getStatusColor(p.status)}20`, color: getStatusColor(p.status) }}
                      >
                        {p.status}
                      </span>
                    ) : '\u2014'}
                  </td>
                  <td className="date-cell">{p.kickOff?.toLocaleDateString() || '\u2014'}</td>
                  <td className="date-cell">{p.goLive?.toLocaleDateString() || '\u2014'}</td>
                  <td className="date-cell">{p.contractEnd?.toLocaleDateString() || '\u2014'}</td>
                  <td className="right">{deployDays != null ? `${deployDays}d` : '\u2014'}</td>
                  <td className="right">{runDays != null ? `${runDays}d` : '\u2014'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
