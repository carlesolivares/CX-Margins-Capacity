import { useState, useMemo } from 'react';
import type { ProjectRow, Targets } from '../types';
import { FileUpload } from '../components/FileUpload';
import { parseProjectFile, parseRevenueFile } from '../utils/fileParser';
import { formatCurrency, deployEurToJH, runEurToJH } from '../utils/margins';
import { useSort } from '../hooks/useSort';
import { Trash2, FolderOpen, Filter } from 'lucide-react';

interface ProjectsProps {
  projects: ProjectRow[];
  importProjects: (rows: ProjectRow[]) => void;
  updateProjects: (updater: (prev: ProjectRow[]) => ProjectRow[]) => void;
  clearProjects: () => void;
  deleteProject: (id: string) => void;
  targets: Targets;
}

export function Projects({ projects, importProjects, updateProjects, clearProjects, deleteProject, targets }: ProjectsProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [revenueResult, setRevenueResult] = useState<string>('');

  const handleFile = async (file: File) => {
    const parsed = await parseProjectFile(file);
    if (parsed.length === 0) {
      throw new Error('No valid project rows found in file');
    }
    importProjects(parsed);
    setStatusFilter('all');
  };

  const handleRevenueFile = async (file: File) => {
    const entries = await parseRevenueFile(file);
    if (entries.length === 0) {
      throw new Error('No valid revenue rows found in file');
    }

    // Match revenue entries to existing projects by account name (case-insensitive)
    let matched = 0;
    let unmatched = 0;
    const unmatchedNames: string[] = [];

    updateProjects(prev => {
      const updated = [...prev];
      for (const entry of entries) {
        const entryKey = entry.account.toLowerCase().trim();
        const idx = updated.findIndex(p => p.account.toLowerCase().trim() === entryKey);
        if (idx !== -1) {
          updated[idx] = {
            ...updated[idx],
            deployRevenue: entry.deployRevenue > 0 ? entry.deployRevenue : updated[idx].deployRevenue,
            runRevenue: entry.runRevenue > 0 ? entry.runRevenue : updated[idx].runRevenue,
          };
          matched++;
        } else {
          unmatched++;
          unmatchedNames.push(entry.account);
        }
      }
      return updated;
    });

    const msg = `Updated ${matched} project(s).` +
      (unmatched > 0 ? ` ${unmatched} not matched: ${unmatchedNames.join(', ')}` : '');
    setRevenueResult(msg);
  };

  const statuses = useMemo(() => {
    const set = new Set(projects.map(p => p.status).filter(Boolean));
    return [...set].sort();
  }, [projects]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return projects;
    return projects.filter(p => p.status === statusFilter);
  }, [projects, statusFilter]);

  const enriched = useMemo(() => filtered.map(p => ({
    ...p,
    deployJH: p.deployRevenue > 0 ? Math.round(deployEurToJH(p.deployRevenue, targets.deployMargin)) : 0,
    runJH: p.runRevenue > 0 ? Math.round(runEurToJH(p.runRevenue, targets.runMargin)) : 0,
  })), [filtered, targets]);

  const { sorted, toggle, sortIndicator } = useSort(enriched);

  const totalDeployRev = filtered.reduce((s, p) => s + p.deployRevenue, 0);
  const totalRunRev = filtered.reduce((s, p) => s + p.runRevenue, 0);
  const totalDeployConso = filtered.reduce((s, p) => s + p.deployConso, 0);
  const totalRunConso = filtered.reduce((s, p) => s + p.runConso, 0);

  return (
    <div className="page">
      <h2>Projects</h2>

      <FileUpload
        label="Import Project File"
        description="CSV/Excel: Accounts, Name, Status, DEPLOY (€), DEPLOY Conso (€), RUN 2026 (€), RUN conso 2026 (€), Go live date, Contract termination"
        accept=".csv,.xlsx,.xls"
        onFile={handleFile}
      />

      {projects.length > 0 && (
        <>
          <FileUpload
            label="Import Revenue File"
            description="CSV/Excel with payment lines: Account/Program, Type (licenses=RUN, setup=Deploy), CA year column(s) with amounts. Updates existing project revenues."
            accept=".csv,.xlsx,.xls"
            onFile={handleRevenueFile}
          />
          {revenueResult && (
            <div className="upload-message success" style={{ marginTop: -8, marginBottom: 12, fontSize: 13 }}>
              {revenueResult}
            </div>
          )}
        </>
      )}

      <div className="section-header">
        <h3>
          <FolderOpen size={18} />
          Projects ({filtered.length}{statusFilter !== 'all' ? ` of ${projects.length}` : ''})
        </h3>
        <div className="header-actions">
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
          {projects.length > 0 && (
            <button className="btn btn-danger" onClick={clearProjects}>
              <Trash2 size={14} /> Clear All
            </button>
          )}
        </div>
      </div>

      <div className="summary-grid-4">
        <div className="summary-card deployment">
          <span className="summary-label">Deploy Revenue</span>
          <span className="summary-value">{formatCurrency(totalDeployRev)}</span>
          <span className="summary-count">{Math.round(deployEurToJH(totalDeployRev, targets.deployMargin))} JH (€×{100 - targets.deployMargin}%/400)</span>
        </div>
        <div className="summary-card run">
          <span className="summary-label">RUN Revenue</span>
          <span className="summary-value">{formatCurrency(totalRunRev)}</span>
          <span className="summary-count">{Math.round(runEurToJH(totalRunRev, targets.runMargin))} JH (€×{100 - targets.runMargin}%/400)</span>
        </div>
        <div className="summary-card neutral-card">
          <span className="summary-label">Deploy Conso</span>
          <span className="summary-value">{formatCurrency(totalDeployConso)}</span>
        </div>
        <div className="summary-card neutral-card">
          <span className="summary-label">RUN Conso</span>
          <span className="summary-value">{formatCurrency(totalRunConso)}</span>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggle('account')}>Account{sortIndicator('account')}</th>
                <th onClick={() => toggle('project')}>Project{sortIndicator('project')}</th>
                <th onClick={() => toggle('status')}>Status{sortIndicator('status')}</th>
                <th className="right" onClick={() => toggle('deployRevenue')}>Deploy (€){sortIndicator('deployRevenue')}</th>
                <th className="right" onClick={() => toggle('deployConso')}>Deploy Conso (€){sortIndicator('deployConso')}</th>
                <th className="right" onClick={() => toggle('deployJH')}>Deploy JH{sortIndicator('deployJH')}</th>
                <th className="right" onClick={() => toggle('runRevenue')}>RUN (€){sortIndicator('runRevenue')}</th>
                <th className="right" onClick={() => toggle('runConso')}>RUN Conso (€){sortIndicator('runConso')}</th>
                <th className="right" onClick={() => toggle('runJH')}>RUN JH{sortIndicator('runJH')}</th>
                <th onClick={() => toggle('kickOff')}>Kick-off{sortIndicator('kickOff')}</th>
                <th onClick={() => toggle('goLive')}>Go-live{sortIndicator('goLive')}</th>
                <th onClick={() => toggle('contractEnd')}>End{sortIndicator('contractEnd')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id}>
                  <td className="customer-name">{p.account}</td>
                  <td>{p.project}</td>
                  <td>
                    {p.status ? (
                      <span className="badge status-badge">{p.status}</span>
                    ) : '—'}
                  </td>
                  <td className="right">{p.deployRevenue > 0 ? formatCurrency(p.deployRevenue) : '—'}</td>
                  <td className="right">{p.deployConso > 0 ? formatCurrency(p.deployConso) : '—'}</td>
                  <td className="right">{p.deployJH > 0 ? p.deployJH : '—'}</td>
                  <td className="right">{p.runRevenue > 0 ? formatCurrency(p.runRevenue) : '—'}</td>
                  <td className="right">{p.runConso > 0 ? formatCurrency(p.runConso) : '—'}</td>
                  <td className="right">{p.runJH > 0 ? p.runJH : '—'}</td>
                  <td className="date-cell">{p.kickOff || '—'}</td>
                  <td className="date-cell">{p.goLive || '—'}</td>
                  <td className="date-cell">{p.contractEnd || '—'}</td>
                  <td>
                    <button className="btn-icon" onClick={() => deleteProject(p.id)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td></td>
                <td></td>
                <td className="right"><strong>{formatCurrency(totalDeployRev)}</strong></td>
                <td className="right"><strong>{formatCurrency(totalDeployConso)}</strong></td>
                <td className="right"><strong>{Math.round(deployEurToJH(totalDeployRev, targets.deployMargin))}</strong></td>
                <td className="right"><strong>{formatCurrency(totalRunRev)}</strong></td>
                <td className="right"><strong>{formatCurrency(totalRunConso)}</strong></td>
                <td className="right"><strong>{Math.round(runEurToJH(totalRunRev, targets.runMargin))}</strong></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
