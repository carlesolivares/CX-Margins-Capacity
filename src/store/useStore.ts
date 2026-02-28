import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ProjectRow, TeamMember, Targets } from '../types';
import { DEFAULT_TARGETS, migrateTeamMember } from '../types';
import type { RevenueLineItem } from '../utils/fileParser';
import { loadFromDB, saveToDB, isSupabaseConfigured } from '../lib/supabase';

const PROJECTS_KEY = 'cx-app-projects-v2';
const TEAM_KEY = 'cx-app-team';
const TARGETS_KEY = 'cx-app-targets';
const TOGGLES_KEY = 'cx-app-project-toggles';
const REVENUE_KEY = 'cx-app-revenue';
const SAVED_TEAMS_KEY = 'cx-app-saved-teams';
const UPDATE_DATE_KEY = 'cx-app-project-update-date';

export interface SavedTeam {
  name: string;
  members: TeamMember[];
  savedAt: string;
}

export interface ProjectToggle {
  deploy: boolean;
  run: boolean;
}

/* ── localStorage helpers (unchanged) ── */

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadObj<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}

/* ── Hybrid save: localStorage + Supabase ── */

function usePersist<T>(key: string, data: T, skip?: boolean) {
  const didSync = useRef(false);

  useEffect(() => {
    if (skip) return;
    save(key, data);
    if (isSupabaseConfigured()) {
      saveToDB(key, data);
    }
  }, [key, data, skip]);

  return didSync;
}

/** Sync from Supabase on mount; returns true once done. */
function useCloudSync<T>(
  key: string,
  setter: (v: T) => void,
  transform?: (v: T) => T,
) {
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || !isSupabaseConfigured()) return;
    synced.current = true;
    loadFromDB<T>(key).then(val => {
      if (val != null) {
        setter(transform ? transform(val) : val);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ── Hooks ── */

export function useProjectData() {
  const [projects, setProjects] = useState<ProjectRow[]>(() => load<ProjectRow>(PROJECTS_KEY));

  usePersist(PROJECTS_KEY, projects);
  useCloudSync<ProjectRow[]>(PROJECTS_KEY, setProjects);

  const importProjects = useCallback((rows: ProjectRow[]) => {
    setProjects(rows);
  }, []);

  const clearProjects = useCallback(() => { setProjects([]); }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateProjects = useCallback((updater: (prev: ProjectRow[]) => ProjectRow[]) => {
    setProjects(updater);
  }, []);

  return { projects, importProjects, clearProjects, deleteProject, updateProjects };
}

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>(() =>
    load<Record<string, unknown>>(TEAM_KEY).map(migrateTeamMember)
  );

  usePersist(TEAM_KEY, members);
  useCloudSync<TeamMember[]>(TEAM_KEY, setMembers, arr =>
    (arr as unknown as Record<string, unknown>[]).map(migrateTeamMember)
  );

  const addMember = useCallback((member: TeamMember) => {
    setMembers(prev => [...prev, member]);
  }, []);

  const updateMember = useCallback((updated: TeamMember) => {
    setMembers(prev => prev.map(m => m.id === updated.id ? updated : m));
  }, []);

  const deleteMember = useCallback((id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
  }, []);

  const clearMembers = useCallback(() => { setMembers([]); }, []);

  const loadMembers = useCallback((newMembers: TeamMember[]) => { setMembers(newMembers); }, []);

  return { members, addMember, updateMember, deleteMember, clearMembers, loadMembers };
}

export function useTargets() {
  const [targets, setTargets] = useState<Targets>(() =>
    loadObj<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  );

  usePersist(TARGETS_KEY, targets);
  useCloudSync<Targets>(TARGETS_KEY, setTargets, v => ({ ...DEFAULT_TARGETS, ...v }));

  const updateTargets = useCallback((updated: Targets) => {
    setTargets(updated);
  }, []);

  return { targets, updateTargets };
}

export function useProjectToggles(projects: ProjectRow[]) {
  const [toggles, setToggles] = useState<Record<string, ProjectToggle>>(() =>
    loadObj<Record<string, ProjectToggle>>(TOGGLES_KEY, {})
  );

  usePersist(TOGGLES_KEY, toggles);
  useCloudSync<Record<string, ProjectToggle>>(TOGGLES_KEY, setToggles);

  const setToggle = useCallback((id: string, toggle: ProjectToggle) => {
    setToggles(prev => ({ ...prev, [id]: toggle }));
  }, []);

  const getToggle = useCallback((id: string): ProjectToggle => {
    return toggles[id] ?? { deploy: true, run: true };
  }, [toggles]);

  const filteredProjects = useMemo(() => {
    return projects.map(p => {
      const t = toggles[p.id] ?? { deploy: true, run: true };
      return {
        ...p,
        deployRevenue: t.deploy ? p.deployRevenue : 0,
        deployConso: t.deploy ? p.deployConso : 0,
        runRevenue: t.run ? p.runRevenue : 0,
        runConso: t.run ? p.runConso : 0,
      };
    });
  }, [projects, toggles]);

  return { toggles, setToggle, getToggle, filteredProjects };
}

export function useRevenueData() {
  const [revenueItems, setRevenueItems] = useState<RevenueLineItem[]>(() =>
    loadObj<RevenueLineItem[]>(REVENUE_KEY, [])
  );

  usePersist(REVENUE_KEY, revenueItems);
  useCloudSync<RevenueLineItem[]>(REVENUE_KEY, setRevenueItems);

  const importRevenue = useCallback((items: RevenueLineItem[]) => {
    setRevenueItems(items);
  }, []);

  const clearRevenue = useCallback(() => { setRevenueItems([]); }, []);

  return { revenueItems, importRevenue, clearRevenue };
}

export function useProjectUpdateDate() {
  const [updateDate, setUpdateDate] = useState<string>(() => {
    try {
      return localStorage.getItem(UPDATE_DATE_KEY) || '';
    } catch {
      return '';
    }
  });

  usePersist(UPDATE_DATE_KEY, updateDate);
  useCloudSync<string>(UPDATE_DATE_KEY, setUpdateDate);

  const setToToday = useCallback(() => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setUpdateDate(iso);
  }, []);

  return { updateDate, setUpdateDate, setToToday };
}

export function useSavedTeams() {
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_TEAMS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedTeam[];
      return parsed.map(t => ({ ...t, members: t.members.map(m => migrateTeamMember(m as unknown as Record<string, unknown>)) }));
    } catch {
      return [];
    }
  });

  usePersist(SAVED_TEAMS_KEY, savedTeams);
  useCloudSync<SavedTeam[]>(SAVED_TEAMS_KEY, setSavedTeams, arr =>
    arr.map(t => ({ ...t, members: t.members.map(m => migrateTeamMember(m as unknown as Record<string, unknown>)) }))
  );

  const saveTeam = useCallback((name: string, members: TeamMember[]) => {
    setSavedTeams(prev => {
      const existing = prev.findIndex(t => t.name === name);
      const entry: SavedTeam = { name, members: [...members], savedAt: new Date().toISOString() };
      if (existing !== -1) {
        const updated = [...prev];
        updated[existing] = entry;
        return updated;
      }
      return [...prev, entry];
    });
  }, []);

  const deleteSavedTeam = useCallback((name: string) => {
    setSavedTeams(prev => prev.filter(t => t.name !== name));
  }, []);

  return { savedTeams, saveTeam, deleteSavedTeam };
}
