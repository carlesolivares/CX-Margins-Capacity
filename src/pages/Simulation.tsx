import { useState, useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets, Role } from '../types';
import { ROLES } from '../types';
import {
  formatCurrency,
} from '../utils/margins';
import {
  computeTeamCapacityByMonth,
  computeTotalDemandByMonth,
} from '../utils/simulation';
import type { MonthlyAggregate } from '../utils/simulation';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line,
} from 'recharts';
import { RotateCcw, Users, Plus, Trash2, Edit2, Check, X, Zap } from 'lucide-react';

interface SimulatedProject {
  id: string;
  name: string;
  deployRevenue: number;
  runRevenue: number;
  kickOff: string;
  goLive: string;
}

interface SimTeamMember {
  id: string;
  name: string;
  role: Role;
  q1Days: number;
  q2Days: number;
  q3Days: number;
  q4Days: number;
  dailyRate: number;
  isNew: boolean;
}

function simProjectToProjectRow(sp: SimulatedProject): ProjectRow {
  return {
    id: sp.id,
    account: 'Simulated',
    project: sp.name,
    deployRevenue: sp.deployRevenue,
    deployConso: 0,
    runRevenue: sp.runRevenue,
    runConso: 0,
    status: 'Simulated',
    kickOff: sp.kickOff,
    goLive: sp.goLive,
    contractEnd: '',
  };
}

interface SimulationProps {
  projects: ProjectRow[];
  members: TeamMember[];
  targets: Targets;
}

export function Simulation({ projects, members, targets }: SimulationProps) {
  const [simProjects, setSimProjects] = useState<SimulatedProject[]>([]);

  // Simulated team: start from real members, allow edits and additions
  const [simTeam, setSimTeam] = useState<SimTeamMember[]>([]);
  const [simTeamInited, setSimTeamInited] = useState(false);

  if (!simTeamInited && members.length > 0) {
    setSimTeam(members.map(m => ({ ...m, isNew: false })));
    setSimTeamInited(true);
  }

  const resetSimTeam = () => {
    setSimTeam(members.map(m => ({ ...m, isNew: false })));
  };

  const simTeamAsMembers: TeamMember[] = useMemo(
    () => simTeam.map(({ isNew, ...rest }) => rest),
    [simTeam],
  );

  const hasTeamChanges = useMemo(() => {
    if (simTeam.length !== members.length) return true;
    return simTeam.some(sm => {
      if (sm.isNew) return true;
      const orig = members.find(m => m.id === sm.id);
      if (!orig) return true;
      return sm.q1Days !== orig.q1Days || sm.q2Days !== orig.q2Days ||
        sm.q3Days !== orig.q3Days || sm.q4Days !== orig.q4Days ||
        sm.dailyRate !== orig.dailyRate || sm.role !== orig.role || sm.name !== orig.name;
    });
  }, [simTeam, members]);

  const allProjects = useMemo(() => {
    const simRows = simProjects.map(simProjectToProjectRow);
    return [...projects, ...simRows];
  }, [projects, simProjects]);

  const demandByMonth = useMemo(
    () => computeTotalDemandByMonth(allProjects, targets),
    [allProjects, targets],
  );
  const simCapacity = useMemo(
    () => computeTeamCapacityByMonth(simTeamAsMembers),
    [simTeamAsMembers],
  );
  const baseCapacity = useMemo(
    () => computeTeamCapacityByMonth(members),
    [members],
  );

  const hasSimProjects = simProjects.length > 0;
  const hasAnyChanges = hasTeamChanges || hasSimProjects;

  const resetAll = () => {
    resetSimTeam();
    setSimProjects([]);
  };

  const capacityForChart = hasTeamChanges ? simCapacity : baseCapacity;

  const MAX_JH_PER_QUARTER = 55;
  const ADJUSTABLE_ROLES: Role[] = ['Dev', 'FDE'];

  /** Auto-balance: adjust Dev & FDE so capacity ≈ demand, protect past JH, cap 55 JH/person/quarter */
  const autoBalance = () => {
    const today = new Date();
    const currentQ = Math.floor(today.getMonth() / 3); // 0-based: 0=Q1, 1=Q2…

    // Fraction of the current quarter already elapsed (frozen)
    const qStartMonth = currentQ * 3;
    const qStart = new Date(today.getFullYear(), qStartMonth, 1);
    const qEnd = new Date(today.getFullYear(), qStartMonth + 3, 0);
    const totalQDays = (qEnd.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const elapsedQDays = (today.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const frozenPct = Math.min(1, elapsedQDays / totalQDays);

    // Sum demand per quarter from monthly demand data
    const demandQ = [0, 0, 0, 0];
    for (let m = 0; m < 12; m++) {
      const q = Math.floor(m / 3);
      demandQ[q] += demandByMonth[m]?.total || 0;
    }

    // Sum current capacity per quarter, split by adjustable vs non-adjustable
    const qKeys = ['q1Days', 'q2Days', 'q3Days', 'q4Days'] as const;
    const nonAdjCapQ = [0, 0, 0, 0]; // capacity from roles we don't touch
    const adjCapQ = [0, 0, 0, 0];    // capacity from Dev & FDE
    for (const m of simTeam) {
      const isAdj = ADJUSTABLE_ROLES.includes(m.role);
      const target = isAdj ? adjCapQ : nonAdjCapQ;
      target[0] += m.q1Days;
      target[1] += m.q2Days;
      target[2] += m.q3Days;
      target[3] += m.q4Days;
    }

    // For each quarter, compute how much Dev & FDE capacity is needed
    // so that nonAdj + newAdj = demand
    const targetAdjCapQ = demandQ.map((d, q) => Math.max(0, d - nonAdjCapQ[q]));

    const adjustableMembers = simTeam.filter(m => ADJUSTABLE_ROLES.includes(m.role));
    const adjustableCount = adjustableMembers.length;
    if (adjustableCount === 0) return;

    setSimTeam(prev =>
      prev.map(m => {
        if (!ADJUSTABLE_ROLES.includes(m.role)) return m;

        const updated = { ...m };
        for (let q = 0; q < 4; q++) {
          const key = qKeys[q];
          const currentVal = m[key];

          if (q < currentQ) {
            // Past quarter: fully frozen, keep as-is
            continue;
          }

          // Target per person = total adjustable target / number of adjustable members
          const targetPerPerson = targetAdjCapQ[q] / adjustableCount;
          let proposed = targetPerPerson;

          if (q === currentQ) {
            // Current quarter: frozen portion stays, only adjust the remaining part
            const frozenJH = currentVal * frozenPct;
            const remainingTarget = Math.max(0, targetPerPerson - frozenJH);
            proposed = frozenJH + remainingTarget;
          }

          // Cap at max 55 JH per person per quarter, floor at 0
          updated[key] = Math.round(Math.max(0, Math.min(MAX_JH_PER_QUARTER, proposed)));
        }
        return updated;
      }),
    );
  };

  const addSimProject = (sp: SimulatedProject) => {
    setSimProjects(prev => [...prev, sp]);
  };
  const removeSimProject = (id: string) => {
    setSimProjects(prev => prev.filter(p => p.id !== id));
  };

  const updateSimMember = (updated: SimTeamMember) => {
    setSimTeam(prev => prev.map(m => m.id === updated.id ? updated : m));
  };
  const addSimMember = (m: SimTeamMember) => {
    setSimTeam(prev => [...prev, m]);
  };
  const removeSimMember = (id: string) => {
    setSimTeam(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="page">
      <h2>Simulation</h2>
      <p className="settings-desc">
        Simulate capacity changes by editing team members or adding hypothetical projects. Changes here are not saved.
      </p>

      <div className="sim-header">
        <h3>Demand vs Capacity by Month (JH)</h3>
        {hasAnyChanges && (
          <button className="btn btn-secondary" onClick={resetAll}>
            <RotateCcw size={14} /> Reset All
          </button>
        )}
      </div>
      <DemandCapacityChart demand={demandByMonth} capacity={capacityForChart} />

      {/* Simulated Projects Section */}
      <div className="sim-header">
        <h3><Plus size={18} /> Simulate New Projects</h3>
      </div>
      <p className="settings-desc">
        Add hypothetical projects to see how they impact demand. These are not saved to your project list.
      </p>
      <AddSimProjectForm onAdd={addSimProject} />
      {simProjects.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project Name</th>
                <th className="right">Deploy (&euro;)</th>
                <th className="right">RUN (&euro;)</th>
                <th>Kick-off</th>
                <th>Go-live</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {simProjects.map(sp => (
                <tr key={sp.id}>
                  <td className="customer-name">{sp.name}</td>
                  <td className="right">{sp.deployRevenue > 0 ? formatCurrency(sp.deployRevenue) : '\u2014'}</td>
                  <td className="right">{sp.runRevenue > 0 ? formatCurrency(sp.runRevenue) : '\u2014'}</td>
                  <td className="date-cell">{sp.kickOff || '\u2014'}</td>
                  <td className="date-cell">{sp.goLive || '\u2014'}</td>
                  <td>
                    <button className="btn-icon" onClick={() => removeSimProject(sp.id)} title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Simulated Team */}
      <div className="sim-header" style={{ marginTop: 24 }}>
        <h3><Users size={18} /> Adjust Team Capacity</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={autoBalance} title="Scale team days so capacity matches demand per quarter">
            <Zap size={14} /> Auto-balance
          </button>
          {hasTeamChanges && (
            <button className="btn btn-secondary" onClick={resetSimTeam}>
              <RotateCcw size={14} /> Reset Team
            </button>
          )}
        </div>
      </div>
      <p className="settings-desc">
        Edit existing team members or add new ones to simulate capacity changes. Auto-balance scales each member's quarterly days so total capacity matches demand. You can then adjust manually.
      </p>
      <SimTeamTable
        simTeam={simTeam}
        updateMember={updateSimMember}
        removeMember={removeSimMember}
        addMember={addSimMember}
      />
    </div>
  );
}

/* ─── Sub-components ─── */

function SimTeamTable({ simTeam, updateMember, removeMember, addMember }: {
  simTeam: SimTeamMember[];
  updateMember: (m: SimTeamMember) => void;
  removeMember: (id: string) => void;
  addMember: (m: SimTeamMember) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SimTeamMember | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState<SimTeamMember>({
    id: '', name: '', role: 'CSM', q1Days: 0, q2Days: 0, q3Days: 0, q4Days: 0, dailyRate: 400, isNew: true,
  });

  const startEdit = (m: SimTeamMember) => { setEditingId(m.id); setEditForm({ ...m }); };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };
  const saveEdit = () => { if (editForm) { updateMember(editForm); cancelEdit(); } };

  const handleAdd = () => {
    if (!newForm.name.trim()) return;
    addMember({ ...newForm, id: `sim-tm-${Date.now().toString(36)}` });
    setNewForm({ id: '', name: '', role: 'CSM', q1Days: 0, q2Days: 0, q3Days: 0, q4Days: 0, dailyRate: 400, isNew: true });
    setShowAddForm(false);
  };

  const totalDays = simTeam.reduce((s, m) => s + m.q1Days + m.q2Days + m.q3Days + m.q4Days, 0);
  const totalCost = simTeam.reduce((s, m) => s + (m.q1Days + m.q2Days + m.q3Days + m.q4Days) * m.dailyRate, 0);

  return (
    <>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th className="right">Q1</th>
              <th className="right">Q2</th>
              <th className="right">Q3</th>
              <th className="right">Q4</th>
              <th className="right">Total Days</th>
              <th className="right">Rate/day</th>
              <th className="right">Total Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {simTeam.map(m => {
              const isEditing = editingId === m.id;
              const ef = editForm!;
              const total = m.q1Days + m.q2Days + m.q3Days + m.q4Days;

              if (isEditing && ef) {
                const efTotal = ef.q1Days + ef.q2Days + ef.q3Days + ef.q4Days;
                return (
                  <tr key={m.id} className="editing-row">
                    <td><input className="input input-table" value={ef.name} onChange={e => setEditForm({ ...ef, name: e.target.value })} /></td>
                    <td>
                      <select className="input input-table" value={ef.role} onChange={e => setEditForm({ ...ef, role: e.target.value as Role })}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.q1Days} onChange={e => setEditForm({ ...ef, q1Days: Number(e.target.value) })} style={{ width: 50 }} /></td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.q2Days} onChange={e => setEditForm({ ...ef, q2Days: Number(e.target.value) })} style={{ width: 50 }} /></td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.q3Days} onChange={e => setEditForm({ ...ef, q3Days: Number(e.target.value) })} style={{ width: 50 }} /></td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.q4Days} onChange={e => setEditForm({ ...ef, q4Days: Number(e.target.value) })} style={{ width: 50 }} /></td>
                    <td className="right">{efTotal}</td>
                    <td className="right"><input className="input input-table" type="number" min={0} value={ef.dailyRate} onChange={e => setEditForm({ ...ef, dailyRate: Number(e.target.value) })} style={{ width: 60 }} /></td>
                    <td className="right">{formatCurrency(efTotal * ef.dailyRate)}</td>
                    <td className="actions-cell">
                      <button className="btn-icon btn-icon-success" onClick={saveEdit} title="Save"><Check size={14} /></button>
                      <button className="btn-icon" onClick={cancelEdit} title="Cancel"><X size={14} /></button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={m.id} className={m.isNew ? 'sim-new-row' : ''}>
                  <td className="customer-name">
                    {m.name}
                    {m.isNew && <span className="badge" style={{ marginLeft: 6, background: '#dbeafe', color: '#1d4ed8' }}>New</span>}
                  </td>
                  <td><span className="badge role-badge">{m.role}</span></td>
                  <td className="right">{m.q1Days}</td>
                  <td className="right">{m.q2Days}</td>
                  <td className="right">{m.q3Days}</td>
                  <td className="right">{m.q4Days}</td>
                  <td className="right">{total}</td>
                  <td className="right">{formatCurrency(m.dailyRate)}</td>
                  <td className="right">{formatCurrency(total * m.dailyRate)}</td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => startEdit(m)} title="Edit"><Edit2 size={14} /></button>
                    {m.isNew && (
                      <button className="btn-icon" onClick={() => removeMember(m.id)} title="Remove"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total ({simTeam.length})</strong></td>
              <td></td>
              <td className="right"><strong>{simTeam.reduce((s, m) => s + m.q1Days, 0)}</strong></td>
              <td className="right"><strong>{simTeam.reduce((s, m) => s + m.q2Days, 0)}</strong></td>
              <td className="right"><strong>{simTeam.reduce((s, m) => s + m.q3Days, 0)}</strong></td>
              <td className="right"><strong>{simTeam.reduce((s, m) => s + m.q4Days, 0)}</strong></td>
              <td className="right"><strong>{totalDays}</strong></td>
              <td className="right"><strong>{totalDays > 0 ? formatCurrency(Math.round(totalCost / totalDays)) : '\u2014'}</strong></td>
              <td className="right"><strong>{formatCurrency(totalCost)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showAddForm ? (
        <div className="add-member-form">
          <input className="input" placeholder="Name" value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} />
          <select className="input" value={newForm.role} onChange={e => setNewForm({ ...newForm, role: e.target.value as Role })}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className="input input-sm" type="number" placeholder="Q1" min={0} value={newForm.q1Days || ''} onChange={e => setNewForm({ ...newForm, q1Days: Number(e.target.value) })} />
          <input className="input input-sm" type="number" placeholder="Q2" min={0} value={newForm.q2Days || ''} onChange={e => setNewForm({ ...newForm, q2Days: Number(e.target.value) })} />
          <input className="input input-sm" type="number" placeholder="Q3" min={0} value={newForm.q3Days || ''} onChange={e => setNewForm({ ...newForm, q3Days: Number(e.target.value) })} />
          <input className="input input-sm" type="number" placeholder="Q4" min={0} value={newForm.q4Days || ''} onChange={e => setNewForm({ ...newForm, q4Days: Number(e.target.value) })} />
          <input className="input input-sm" type="number" placeholder="Rate" min={0} value={newForm.dailyRate || ''} onChange={e => setNewForm({ ...newForm, dailyRate: Number(e.target.value) })} />
          <button className="btn btn-primary" onClick={handleAdd} disabled={!newForm.name.trim()}>
            <Check size={14} /> Add
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
            <X size={14} /> Cancel
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)} style={{ marginTop: 8 }}>
          <Plus size={14} /> Add Simulated Member
        </button>
      )}
    </>
  );
}

function AddSimProjectForm({ onAdd }: { onAdd: (sp: SimulatedProject) => void }) {
  const [name, setName] = useState('');
  const [deployRevenue, setDeployRevenue] = useState(0);
  const [runRevenue, setRunRevenue] = useState(0);
  const [kickOff, setKickOff] = useState('');
  const [goLive, setGoLive] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({
      id: `sim-${Date.now().toString(36)}`,
      name: name.trim(),
      deployRevenue,
      runRevenue,
      kickOff,
      goLive,
    });
    setName('');
    setDeployRevenue(0);
    setRunRevenue(0);
    setKickOff('');
    setGoLive('');
  };

  return (
    <div className="add-sim-project-form">
      <div className="sim-project-fields">
        <input
          type="text"
          placeholder="Project name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="number"
          placeholder="Deploy (€)"
          value={deployRevenue || ''}
          onChange={e => setDeployRevenue(Number(e.target.value))}
          className="input input-sm"
        />
        <input
          type="number"
          placeholder="RUN (€)"
          value={runRevenue || ''}
          onChange={e => setRunRevenue(Number(e.target.value))}
          className="input input-sm"
        />
        <label className="date-field">
          <span>Kick-off</span>
          <input
            type="date"
            value={kickOff}
            onChange={e => setKickOff(e.target.value)}
            className="input input-sm"
          />
        </label>
        <label className="date-field">
          <span>Go-live</span>
          <input
            type="date"
            value={goLive}
            onChange={e => setGoLive(e.target.value)}
            className="input input-sm"
          />
        </label>
        <button className="btn btn-primary" onClick={handleAdd} disabled={!name.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

function DemandCapacityChart({ demand, capacity }: { demand: MonthlyAggregate[]; capacity: MonthlyAggregate[] }) {
  const chartData = demand.map(d => {
    const cAgg = capacity.find(a => a.month === d.month);
    return { month: d.label, demand: d.total, capacity: cAgg?.total || 0 };
  });

  if (chartData.length === 0) {
    return <div className="empty-state">No data to display. Import projects and add team members.</div>;
  }

  return (
    <div className="chart-container chart-full-width">
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={v => `${v}`} tick={{ fontSize: 12 }} label={{ value: 'JH', angle: -90, position: 'insideLeft', fontSize: 12 }} />
          <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)} JH`, String(name) === 'Demand' ? 'Demand' : 'Capacity']} />
          <Legend />
          <Bar dataKey="demand" name="Demand" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          <Line dataKey="capacity" name="Capacity" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
