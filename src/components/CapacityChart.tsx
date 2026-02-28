import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { TeamCapacity } from '../types';
import { ROLES, MONTH_LABELS_SHORT } from '../types';
import { formatCurrency } from '../utils/margins';

interface CapacityChartProps {
  capacity: TeamCapacity;
  consumed: { deployEur: number; runEur: number; deployJH: number; runJH: number };
}

export function CapacityChart({ capacity, consumed }: CapacityChartProps) {
  const totalConsumedJH = consumed.deployJH + consumed.runJH;

  const roleData = ROLES
    .filter(r => capacity.byRole[r].days > 0 || capacity.byRole[r].count > 0)
    .map(r => ({
      role: r,
      available: capacity.byRole[r].days,
      count: capacity.byRole[r].count,
      cost: capacity.byRole[r].cost,
    }));

  const monthData = MONTH_LABELS_SHORT.map(label => ({
    month: label,
    available: Math.round(capacity.byMonth[label] || 0),
  }));

  if (roleData.length === 0) {
    return <div className="empty-state">No team capacity data. Add team members on the Team page.</div>;
  }

  return (
    <div className="chart-container">
      <h3>Team Capacity Overview</h3>
      <div className="capacity-stats">
        <div className="stat-card">
          <span className="stat-label">Available</span>
          <span className="stat-value">{capacity.totalAvailableDays} JH</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Consumed</span>
          <span className="stat-value">{totalConsumedJH} JH</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Remaining</span>
          <span className="stat-value">{Math.round(capacity.totalAvailableDays - totalConsumedJH)} JH</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Team Cost</span>
          <span className="stat-value">{formatCurrency(capacity.totalCost)}</span>
        </div>
      </div>

      <div className="charts-row">
        <div>
          <h4>Available Days by Role</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={roleData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="role" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [`${value} days`]} />
              <Legend />
              <Bar dataKey="available" name="Available Days" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4>Available Days by Month</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [`${value} days`]} />
              <Legend />
              <Bar dataKey="available" name="Available Days" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
