import { useState } from 'react';
import { useProjectData, useTeamMembers, useTargets, useProjectToggles, useRevenueData } from './store/useStore';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Team } from './pages/Team';
import { Planning } from './pages/Planning';
import { Simulation } from './pages/Simulation';
import { Projection } from './pages/Projection';
import { Settings } from './pages/Settings';
import { Report } from './pages/Report';
import { Revenue } from './pages/Revenue';
import { LayoutDashboard, FolderOpen, Users, CalendarRange, SlidersHorizontal, TrendingUp, FileText, Receipt, Settings as SettingsIcon } from 'lucide-react';
import './App.css';

type Page = 'dashboard' | 'projects' | 'team' | 'planning' | 'simulation' | 'projection' | 'revenue' | 'report' | 'settings';

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const { projects, importProjects, clearProjects, deleteProject } = useProjectData();
  const { members, addMember, updateMember, deleteMember, clearMembers } = useTeamMembers();
  const { targets, updateTargets } = useTargets();
  const { setToggle, getToggle, filteredProjects } = useProjectToggles(projects);
  const { revenueItems, importRevenue, clearRevenue } = useRevenueData();

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>CX Manager</h1>
          <span className="sidebar-subtitle">Margin & Capacity</span>
        </div>
        <ul className="nav-list">
          <li>
            <button
              className={`nav-item ${page === 'dashboard' ? 'active' : ''}`}
              onClick={() => setPage('dashboard')}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${page === 'projects' ? 'active' : ''}`}
              onClick={() => setPage('projects')}
            >
              <FolderOpen size={18} />
              Projects
              {projects.length > 0 && <span className="nav-badge">{projects.length}</span>}
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${page === 'team' ? 'active' : ''}`}
              onClick={() => setPage('team')}
            >
              <Users size={18} />
              Team
              {members.length > 0 && <span className="nav-badge">{members.length}</span>}
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${page === 'planning' ? 'active' : ''}`}
              onClick={() => setPage('planning')}
            >
              <CalendarRange size={18} />
              Planning
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${page === 'projection' ? 'active' : ''}`}
              onClick={() => setPage('projection')}
            >
              <TrendingUp size={18} />
              Projection
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${page === 'revenue' ? 'active' : ''}`}
              onClick={() => setPage('revenue')}
            >
              <Receipt size={18} />
              Revenue
              {revenueItems.length > 0 && <span className="nav-badge">{revenueItems.length}</span>}
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${page === 'simulation' ? 'active' : ''}`}
              onClick={() => setPage('simulation')}
            >
              <SlidersHorizontal size={18} />
              Simulation
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${page === 'report' ? 'active' : ''}`}
              onClick={() => setPage('report')}
            >
              <FileText size={18} />
              Report
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${page === 'settings' ? 'active' : ''}`}
              onClick={() => setPage('settings')}
            >
              <SettingsIcon size={18} />
              Settings
            </button>
          </li>
        </ul>
      </nav>
      <main className="main-content">
        {page === 'dashboard' && <Dashboard projects={filteredProjects} members={members} targets={targets} />}
        {page === 'projects' && (
          <Projects
            projects={projects}
            importProjects={importProjects}
            clearProjects={clearProjects}
            deleteProject={deleteProject}
            targets={targets}
          />
        )}
        {page === 'team' && (
          <Team
            members={members}
            addMember={addMember}
            updateMember={updateMember}
            deleteMember={deleteMember}
            clearMembers={clearMembers}
          />
        )}
        {page === 'planning' && <Planning projects={filteredProjects} />}
        {page === 'simulation' && <Simulation projects={filteredProjects} members={members} targets={targets} />}
        {page === 'projection' && <Projection projects={filteredProjects} members={members} targets={targets} />}
        {page === 'revenue' && (
          <Revenue
            revenueItems={revenueItems}
            importRevenue={importRevenue}
            clearRevenue={clearRevenue}
          />
        )}
        {page === 'report' && <Report projects={filteredProjects} members={members} targets={targets} />}
        {page === 'settings' && (
          <Settings
            targets={targets}
            updateTargets={updateTargets}
            projects={projects}
            getToggle={getToggle}
            setToggle={setToggle}
          />
        )}
      </main>
    </div>
  );
}

export default App;
