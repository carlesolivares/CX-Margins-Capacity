import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProjectRow, TeamMember, Targets } from '../types';
import { DEFAULT_TARGETS } from '../types';

const PROJECTS_KEY = 'cx-app-projects-v2';
const TEAM_KEY = 'cx-app-team';
const TARGETS_KEY = 'cx-app-targets';
const TOGGLES_KEY = 'cx-app-project-toggles';

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

  return { projects, importProjects, clearProjects, deleteProject };
}

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>(() => load<TeamMember>(TEAM_KEY));

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

  return { members, addMember, updateMember, deleteMember, clearMembers };
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
