import { useState, useMemo } from 'react';
import type { TeamMember, Role } from '../types';
import { ROLES, MONTH_KEYS, MONTH_LABELS_SHORT, totalDays } from '../types';
import { calculateTeamCapacity, formatCurrency } from '../utils/margins';
import { useSort } from '../hooks/useSort';
import { Trash2, Plus, Users, Edit2, Check, X, Save, FolderOpen } from 'lucide-react';
import type { SavedTeam } from '../store/useStore';

interface TeamProps {
  members: TeamMember[];
  addMember: (m: TeamMember) => void;
  updateMember: (m: TeamMember) => void;
  deleteMember: (id: string) => void;
  clearMembers: () => void;
  savedTeams: SavedTeam[];
  saveTeam: (name: string, members: TeamMember[]) => void;
  deleteSavedTeam: (name: string) => void;
  loadTeam: (members: TeamMember[]) => void;
}

const DEFAULT_MONTHLY = 18;

const EMPTY_FORM = {
  name: '',
  role: 'CSM' as Role,
  m1: DEFAULT_MONTHLY, m2: DEFAULT_MONTHLY, m3: DEFAULT_MONTHLY,
  m4: DEFAULT_MONTHLY, m5: DEFAULT_MONTHLY, m6: DEFAULT_MONTHLY,
  m7: DEFAULT_MONTHLY, m8: DEFAULT_MONTHLY, m9: DEFAULT_MONTHLY,
  m10: DEFAULT_MONTHLY, m11: DEFAULT_MONTHLY, m12: DEFAULT_MONTHLY,
  dailyRate: 400,
};

export function Team({ members, addMember, updateMember, deleteMember, clearMembers, savedTeams, saveTeam, deleteSavedTeam, loadTeam }: TeamProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TeamMember | null>(null);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const capacity = calculateTeamCapacity(members);

  const handleAdd = () => {
    if (!form.name.trim()) return;
    addMember({
      id: Date.now().toString(36),
      ...form,
      name: form.name.trim(),
    });
    setForm(EMPTY_FORM);
  };

  const startEdit = (m: TeamMember) => {
    setEditingId(m.id);
    setEditForm({ ...m });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = () => {
    if (editForm) {
      updateMember(editForm);
    }
    cancelEdit();
  };

  const handleSaveTeam = () => {
    const name = saveName.trim();
    if (!name || members.length === 0) return;
    saveTeam(name, members);
    setSaveName('');
    setShowSaveInput(false);
  };

  const handleLoadTeam = (name: string) => {
    const team = savedTeams.find(t => t.name === name);
    if (team) loadTeam(team.members);
  };

  return (
    <div className="page">
      <h2>Team Capacity</h2>

      {/* Summary cards */}
      <div className="summary-grid-4">
        <div className="summary-card deployment">
          <span className="summary-label">Team Members</span>
          <span className="summary-value">{members.length}</span>
        </div>
        <div className="summary-card run">
          <span className="summary-label">Total Available Days</span>
          <span className="summary-value">{capacity.totalAvailableDays}</span>
        </div>
        <div className="summary-card neutral-card">
          <span className="summary-label">Total Cost</span>
          <span className="summary-value">{formatCurrency(capacity.totalCost)}</span>
        </div>
        <div className="summary-card neutral-card">
          <span className="summary-label">Avg. Daily Rate</span>
          <span className="summary-value">
            {capacity.totalAvailableDays > 0
              ? formatCurrency(Math.round(capacity.totalCost / capacity.totalAvailableDays))
              : '—'}
          </span>
        </div>
      </div>

      {/* Capacity by role */}
      <h3><Users size={18} /> Capacity by Role</h3>
      <div className="role-grid">
        {ROLES.map(role => (
          <div key={role} className="role-card">
            <span className="role-name">{role}</span>
            <span className="role-count">{capacity.byRole[role].count} people</span>
            <span className="role-days">{capacity.byRole[role].days} days</span>
            <span className="role-cost">{formatCurrency(capacity.byRole[role].cost)}</span>
          </div>
        ))}
      </div>

      {/* Capacity by month */}
      <h3>Capacity by Month</h3>
      <div className="month-capacity-grid">
        {MONTH_LABELS_SHORT.map(label => (
          <div key={label} className="summary-card neutral-card">
            <span className="summary-label">{label}</span>
            <span className="summary-value">{Math.round((capacity.byMonth[label] || 0) * 10) / 10} days</span>
          </div>
        ))}
      </div>

      {/* Add member form */}
      <h3><Plus size={18} /> Add Team Member</h3>
      <div className="add-member-form add-member-monthly">
        <input
          type="text"
          placeholder="Name"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          className="input"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <select
          value={form.role}
          onChange={e => setForm({ ...form, role: e.target.value as Role })}
          className="input"
        >
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {MONTH_KEYS.map((mk, i) => (
          <input
            key={mk}
            type="number"
            placeholder={MONTH_LABELS_SHORT[i]}
            value={form[mk]}
            onChange={e => setForm({ ...form, [mk]: Number(e.target.value) })}
            className="input input-sm"
            title={MONTH_LABELS_SHORT[i]}
          />
        ))}
        <input
          type="number"
          placeholder="Rate/day"
          value={form.dailyRate}
          onChange={e => setForm({ ...form, dailyRate: Number(e.target.value) })}
          className="input input-sm"
        />
        <button className="btn btn-primary" onClick={handleAdd}>
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Team table */}
      <div className="section-header">
        <h3>Team Members</h3>
        <div className="header-actions">
          {savedTeams.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FolderOpen size={14} style={{ color: '#64748b' }} />
              <select
                className="input"
                value=""
                onChange={e => {
                  if (e.target.value) handleLoadTeam(e.target.value);
                  e.target.value = '';
                }}
                style={{ minWidth: 160, fontSize: 13, padding: '4px 8px' }}
              >
                <option value="">Load saved team...</option>
                {savedTeams.map(t => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.members.length})
                  </option>
                ))}
              </select>
              {savedTeams.length > 0 && (
                <select
                  className="input"
                  value=""
                  onChange={e => {
                    if (e.target.value && confirm(`Delete saved team "${e.target.value}"?`)) {
                      deleteSavedTeam(e.target.value);
                    }
                    e.target.value = '';
                  }}
                  style={{ minWidth: 50, fontSize: 13, padding: '4px 8px', color: '#ef4444' }}
                >
                  <option value="">Delete...</option>
                  {savedTeams.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {members.length > 0 && (
            <>
              {showSaveInput ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="Team name"
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveTeam()}
                    style={{ width: 140, fontSize: 13, padding: '4px 8px' }}
                    autoFocus
                  />
                  <button className="btn btn-primary" onClick={handleSaveTeam} disabled={!saveName.trim()}>
                    <Save size={14} /> Save
                  </button>
                  <button className="btn" onClick={() => { setShowSaveInput(false); setSaveName(''); }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={() => setShowSaveInput(true)}>
                  <Save size={14} /> Save Team
                </button>
              )}
              <button className="btn btn-danger" onClick={clearMembers}>
                <Trash2 size={14} /> Clear All
              </button>
            </>
          )}
        </div>
      </div>

      {members.length > 0 ? (
        <TeamTable
          members={members}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveEdit={saveEdit}
          deleteMember={deleteMember}
        />
      ) : (
        <div className="empty-state">No team members yet. Add your first team member above.</div>
      )}
    </div>
  );
}

function TeamTable({ members, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit, deleteMember }: {
  members: TeamMember[];
  editingId: string | null;
  editForm: TeamMember | null;
  setEditForm: (m: TeamMember) => void;
  startEdit: (m: TeamMember) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  deleteMember: (id: string) => void;
}) {
  const enriched = useMemo(() => members.map(m => ({
    ...m,
    totalDays: totalDays(m),
    totalCost: totalDays(m) * m.dailyRate,
  })), [members]);

  const { sorted, toggle, sortIndicator } = useSort(enriched);

  return (
        <div className="table-wrapper">
          <table className="data-table team-monthly-table">
            <thead>
              <tr>
                <th onClick={() => toggle('name')}>Name{sortIndicator('name')}</th>
                <th onClick={() => toggle('role')}>Role{sortIndicator('role')}</th>
                {MONTH_KEYS.map((mk, i) => (
                  <th key={mk} className="right" onClick={() => toggle(mk)}>{MONTH_LABELS_SHORT[i]}{sortIndicator(mk)}</th>
                ))}
                <th className="right" onClick={() => toggle('totalDays')}>Total{sortIndicator('totalDays')}</th>
                <th className="right" onClick={() => toggle('dailyRate')}>Rate{sortIndicator('dailyRate')}</th>
                <th className="right" onClick={() => toggle('totalCost')}>Cost{sortIndicator('totalCost')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => {
                const isEditing = editingId === m.id;
                const ef = editForm!;

                if (isEditing && ef) {
                  const efTotal = totalDays(ef);
                  return (
                    <tr key={m.id} className="editing-row">
                      <td><input className="input input-table" value={ef.name} onChange={e => setEditForm({ ...ef, name: e.target.value })} /></td>
                      <td>
                        <select className="input input-table" value={ef.role} onChange={e => setEditForm({ ...ef, role: e.target.value as Role })}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      {MONTH_KEYS.map(mk => (
                        <td key={mk}><input className="input input-table input-sm" type="number" value={ef[mk]} onChange={e => setEditForm({ ...ef, [mk]: Number(e.target.value) })} /></td>
                      ))}
                      <td className="right">{efTotal}</td>
                      <td><input className="input input-table input-sm" type="number" value={ef.dailyRate} onChange={e => setEditForm({ ...ef, dailyRate: Number(e.target.value) })} /></td>
                      <td className="right">{formatCurrency(efTotal * ef.dailyRate)}</td>
                      <td className="actions-cell">
                        <button className="btn-icon btn-icon-success" onClick={saveEdit} title="Save"><Check size={14} /></button>
                        <button className="btn-icon" onClick={cancelEdit} title="Cancel"><X size={14} /></button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={m.id}>
                    <td className="customer-name">{m.name}</td>
                    <td><span className="badge role-badge">{m.role}</span></td>
                    {MONTH_KEYS.map(mk => (
                      <td key={mk} className="right">{m[mk]}</td>
                    ))}
                    <td className="right"><strong>{m.totalDays}</strong></td>
                    <td className="right">{formatCurrency(m.dailyRate)}</td>
                    <td className="right">{formatCurrency(m.totalCost)}</td>
                    <td className="actions-cell">
                      <button className="btn-icon" onClick={() => startEdit(m)} title="Edit"><Edit2 size={14} /></button>
                      <button className="btn-icon" onClick={() => deleteMember(m.id)} title="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total ({members.length})</strong></td>
                <td></td>
                {MONTH_KEYS.map(mk => (
                  <td key={mk} className="right"><strong>{Math.round(members.reduce((s, m) => s + m[mk], 0) * 10) / 10}</strong></td>
                ))}
                <td className="right"><strong>{enriched.reduce((s, m) => s + m.totalDays, 0)}</strong></td>
                <td className="right"><strong>{enriched.reduce((s, m) => s + m.totalDays, 0) > 0 ? formatCurrency(Math.round(enriched.reduce((s, m) => s + m.totalCost, 0) / enriched.reduce((s, m) => s + m.totalDays, 0))) : '\u2014'}</strong></td>
                <td className="right"><strong>{formatCurrency(enriched.reduce((s, m) => s + m.totalCost, 0))}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
  );
}
