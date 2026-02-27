import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets } from '../types';
import { DEFAULT_TARGETS, migrateTeamMember } from '../types';
import type { RevenueLineItem } from '../utils/fileParser';

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

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function useProjectData() {
  const [projects, setProjects] = useState<ProjectRow[]>(() => load<ProjectRow>(PROJECTS_KEY));

  useEffect(() => { save(PROJECTS_KEY, projects); }, [projects]);

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

  useEffect(() => { save(TEAM_KEY, members); }, [members]);

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
  const [targets, setTargets] = useState<Targets>(() => {
    try {
      const raw = localStorage.getItem(TARGETS_KEY);
      return raw ? { ...DEFAULT_TARGETS, ...JSON.parse(raw) } : DEFAULT_TARGETS;
    } catch {
      return DEFAULT_TARGETS;
    }
  });

  useEffect(() => {
    localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
  }, [targets]);

  const updateTargets = useCallback((updated: Targets) => {
    setTargets(updated);
  }, []);

  return { targets, updateTargets };
}

export function useProjectToggles(projects: ProjectRow[]) {
  const [toggles, setToggles] = useState<Record<string, ProjectToggle>>(() => {
    try {
      const raw = localStorage.getItem(TOGGLES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(TOGGLES_KEY, JSON.stringify(toggles));
  }, [toggles]);

  const setToggle = useCallback((id: string, toggle: ProjectToggle) => {
    setToggles(prev => ({ ...prev, [id]: toggle }));
  }, []);

  const getToggle = useCallback((id: string): ProjectToggle => {
    return toggles[id] ?? { deploy: true, run: true };
  }, [toggles]);

  // Projects with toggled-off revenue/conso zeroed out
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
  const [revenueItems, setRevenueItems] = useState<RevenueLineItem[]>(() => {
    try {
      const raw = localStorage.getItem(REVENUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(REVENUE_KEY, JSON.stringify(revenueItems));
  }, [revenueItems]);

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

  useEffect(() => {
    localStorage.setItem(UPDATE_DATE_KEY, updateDate);
  }, [updateDate]);

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

  useEffect(() => {
    localStorage.setItem(SAVED_TEAMS_KEY, JSON.stringify(savedTeams));
  }, [savedTeams]);

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
