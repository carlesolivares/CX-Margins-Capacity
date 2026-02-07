import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import type { CustomerMargin, Targets } from '../types';
import { DEFAULT_TARGETS } from '../types';

interface MarginChartProps {
  margins: CustomerMargin[];
  type: 'deployment' | 'run';
  targets?: Targets;
}

export function MarginChart({ margins, type, targets = DEFAULT_TARGETS }: MarginChartProps) {
  const threshold = type === 'deployment' ? targets.deployMargin : targets.runMargin;
  const label = type === 'deployment' ? 'Deployment' : 'RUN (Licenses)';

  const data = margins
    .filter(m => type === 'deployment' ? m.deployRevenue > 0 : m.runRevenue > 0)
    .map(m => ({
      name: m.account,
      margin: type === 'deployment' ? m.deployMargin : m.runMargin,
      healthy: type === 'deployment' ? m.deployHealthy : m.runHealthy,
    }))
    .sort((a, b) => b.margin - a.margin);

  if (data.length === 0) {
    return <div className="empty-state">No {label.toLowerCase()} data to display.</div>;
  }

  return (
    <div className="chart-container">
      <h3>{label} Margin ({data.length})</h3>
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            domain={[Math.min(0, ...data.map(d => d.margin)) - 5, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            tick={{ fontSize: 11 }}
          />
          <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Margin']} />
          <Legend />
          <ReferenceLine
            x={threshold}
            stroke="#f59e0b"
            strokeDasharray="6 3"
            strokeWidth={2}
            label={{ value: `Target: ${threshold}%`, position: 'top', fontSize: 12 }}
          />
          <Bar dataKey="margin" name={`${label} Margin`} radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.healthy ? '#10b981' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
