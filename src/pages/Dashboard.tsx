import { useState, useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets } from '../types';
import { calculateMargins, calculateProjectMargins, calculateTeamCapacity, getConsumedStats, isDeployComplete } from '../utils/margins';
import { computeTotalDemandByMonth } from '../utils/simulation';
import { KPICards } from '../components/KPICards';
import { MarginChart } from '../components/MarginChart';
import { MarginTable } from '../components/MarginTable';
import { CapacityChart } from '../components/CapacityChart';
import { Filter, ChevronDown } from 'lucide-react';

interface DashboardProps {
  projects: ProjectRow[];
  members: TeamMember[];
  targets: Targets;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className="collapsible-header" onClick={() => setOpen(o => !o)}>
        <ChevronDown size={16} className={`collapsible-chevron ${open ? '' : 'collapsed'}`} />
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      {open && children}
    </div>
  );
}

export function Dashboard({ projects, members, targets }: DashboardProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const statuses = useMemo(() => {
    const set = new Set(projects.map(p => p.status).filter(Boolean));
    return [...set].sort();
  }, [projects]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return projects;
    return projects.filter(p => p.status === statusFilter);
  }, [projects, statusFilter]);

  // Filter out deploy-complete (2025 go-live) projects for deploy views
  const deployFiltered = useMemo(() => filtered.filter(p => !isDeployComplete(p)), [filtered]);

  // Account-level margins for KPI cards and charts
  const accountMargins = calculateMargins(filtered, 1, targets);
  const deployAccountMargins = calculateMargins(deployFiltered, 1, targets);
  // Project-level margins for table
  const projectMargins = calculateProjectMargins(filtered, 1, targets);
  const capacity = calculateTeamCapacity(members);
  const consumed = getConsumedStats(filtered, targets);

  // Compute accumulated demand (JH) from projection
  const totalDemandJH = useMemo(() => {
    const demand = computeTotalDemandByMonth(filtered, targets);
    return Math.round(demand.reduce((s, d) => s + d.total, 0));
  }, [filtered, targets]);

  return (
    <div className="page">
      <div className="section-header">
        <h2 style={{ marginBottom: 0 }}>Dashboard</h2>
        {statuses.length > 0 && (
          <div className="header-actions">
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
          </div>
        )}
      </div>

      <Section title="KPIs">
        <KPICards margins={accountMargins} capacity={capacity} consumed={consumed} targets={targets} totalDemandJH={totalDemandJH} />
      </Section>

      <Section title="Global Margin (by Account)">
        <MarginChart margins={accountMargins} type="global" targets={targets} />
      </Section>

      <Section title="Margin Charts (by Account)">
        <div className="charts-row">
          <MarginChart margins={deployAccountMargins} type="deployment" targets={targets} />
          <MarginChart margins={accountMargins} type="run" targets={targets} />
        </div>
      </Section>

      <Section title="Capacity Overview">
        <CapacityChart capacity={capacity} consumed={consumed} />
      </Section>

      <Section title={`Margin Details by Project (${projectMargins.length})`}>
        <MarginTable margins={projectMargins} />
      </Section>
    </div>
  );
}
