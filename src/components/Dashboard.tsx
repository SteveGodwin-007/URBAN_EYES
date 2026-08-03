import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { Stats, Pothole } from '../types';
import {
  Activity,
  Clock,
  Eye,
  CheckCircle2,
  Gauge,
  Radio,
  ArrowUpRight,
  Wrench,
  ShieldAlert,
  ScanSearch
} from 'lucide-react';

const SEVERITY_COLORS: Record<string, string> = {
  LARGE: '#ef4444',
  MEDIUM: '#f59e0b',
  SMALL: '#3b82f6'
};

const STATUS_META = [
  { key: 'DETECTED', label: 'Detected', color: '#ef4444', icon: ScanSearch },
  { key: 'SENT_TO_GCC', label: 'Sent to GCC', color: '#f59e0b', icon: ShieldAlert },
  { key: 'VIEWED', label: 'Viewed', color: '#3b82f6', icon: Eye },
  { key: 'ACTION_TAKEN', label: 'Action Taken', color: '#10b981', icon: Wrench }
] as const;

export default function Dashboard({ stats, potholes }: { stats: Stats | null, potholes: Pothole[] }) {
  if (!stats) return <div className="animate-pulse flex items-center justify-center p-20 font-mono text-xs">COMM_NODE_SYST_INIT...</div>;

  // ---- Detection activity over the last 24h (hourly buckets) ----
  const activityData = useMemo(() => {
    const now = Date.now();
    const buckets: { label: string; count: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now - i * 3600_000);
      buckets.push({
        label: d.toLocaleTimeString('en-IN', { hour: '2-digit', hour12: false }),
        count: 0
      });
    }
    potholes.forEach(p => {
      const hoursAgo = Math.floor((now - new Date(p.timestamp).getTime()) / 3600_000);
      if (hoursAgo >= 0 && hoursAgo <= 23) buckets[23 - hoursAgo].count++;
    });
    return buckets;
  }, [potholes]);

  // ---- Status pipeline ----
  const pipeline = useMemo(() => {
    const rows = STATUS_META.map(s => ({
      ...s,
      count: potholes.filter(p => p.status === s.key).length
    }));
    const max = Math.max(1, ...rows.map(r => r.count));
    return { rows, max };
  }, [potholes]);

  // ---- Recent detections (newest first) ----
  const recent = useMemo(
    () =>
      [...potholes]
        .filter(p => !isNaN(new Date(p.timestamp).getTime()))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 6),
    [potholes]
  );

  const severityData = Object.entries(stats?.bySeverity || {}).map(([name, value]) => ({ name, value }));
  const routeData = Object.entries(stats?.byRoute || {}).map(([name, value]) => ({ name, value }));

  const avgConfidence = potholes.length
    ? Math.round(potholes.reduce((acc, p) => acc + p.confidence, 0) / potholes.length * 100)
    : 0;

  const cardDelay = (i: number) => ({ delay: i * 0.05 });

  return (
    <div className="space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<Activity size={14} />}
          label="TOTAL DETECTED"
          value={stats.total}
          sub="LIVE_FEED"
          live
          delay={cardDelay(0)}
        />
        <StatCard
          icon={<ShieldAlert size={14} />}
          label="PENDING ACTION"
          value={stats.sentToGcc}
          sub="GCC_L1"
          highlight="bg-amber-100/50"
          delay={cardDelay(1)}
        />
        <StatCard
          icon={<Eye size={14} />}
          label="VIEWED"
          value={stats.viewed}
          sub="GCC_L2"
          delay={cardDelay(2)}
        />
        <StatCard
          icon={<CheckCircle2 size={14} />}
          label="RESOLVED 24H"
          value={stats.resolved}
          sub="MAINTENANCE"
          highlight="bg-green-100/50"
          delay={cardDelay(3)}
        />
        <StatCard
          icon={<Gauge size={14} />}
          label="AVG CONFIDENCE"
          value={`${avgConfidence}%`}
          sub="MODEL_V4"
          delay={cardDelay(4)}
        />
      </div>

      {/* Activity + Severity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Detection Activity (24h) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="lg:col-span-2 border border-brand-text bg-white p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-serif italic text-[11px] opacity-50 uppercase tracking-widest">Detection Activity — Last 24h</h3>
            <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-green-700 uppercase">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              LIVE
            </span>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 240 }}>
              <AreaChart data={activityData} margin={{ top: 5, right: 0, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#141414" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#141414" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 2" stroke="#14141422" vertical={false} />
                <XAxis dataKey="label" axisLine={{ stroke: '#141414' }} tickLine={false} interval={3} tick={{ fontSize: 9, fill: '#141414', fontFamily: 'monospace' }} />
                <YAxis axisLine={{ stroke: '#141414' }} tickLine={false} allowDecimals={false} tick={{ fontSize: 9, fill: '#141414', fontFamily: 'monospace' }} />
                <Tooltip
                  cursor={{ stroke: '#14141455' }}
                  contentStyle={{ backgroundColor: '#141414', border: 'none', color: '#E4E3E0', fontFamily: 'monospace', fontSize: '10px' }}
                  labelStyle={{ color: '#E4E3E0', opacity: 0.6 }}
                  formatter={(value: any) => [`${value} detections`, 'COUNT']}
                />
                <Area type="monotone" dataKey="count" stroke="#141414" strokeWidth={2} fill="url(#activityFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Severity Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="border border-brand-text bg-white p-6"
        >
          <h3 className="font-serif italic text-[11px] opacity-50 uppercase mb-6 tracking-widest">Severity Distribution</h3>
          <div className="relative h-[240px]">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 400, height: 240 }}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={46}
                  outerRadius={84}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="#141414"
                  strokeWidth={1}
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name] || '#9ca3af'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#141414', border: 'none', color: '#E4E3E0', fontFamily: 'monospace', fontSize: '10px' }}
                  itemStyle={{ color: '#E4E3E0' }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center total */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-mono font-bold tracking-tighter leading-none">{stats.total}</span>
              <span className="text-[8px] font-mono opacity-40 uppercase mt-1">Total</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-[9px] font-mono font-bold uppercase">
            {severityData.map((s, i) => (
              <div key={s.name} className="flex flex-col border border-brand-text p-2 items-center hover:bg-brand-bg transition-colors">
                <span style={{ color: SEVERITY_COLORS[s.name] || '#9ca3af' }}>{s.name}</span>
                <span className="opacity-40">{s.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Area-wise + Status Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Area Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="lg:col-span-2 border border-brand-text bg-white p-6"
        >
          <h3 className="font-serif italic text-[11px] opacity-50 uppercase mb-6 tracking-widest">Area-wise Distribution</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 260 }}>
              <BarChart data={routeData}>
                <CartesianGrid strokeDasharray="2 2" stroke="#14141422" vertical={false} />
                <XAxis dataKey="name" axisLine={{ stroke: '#141414' }} tickLine={false} tick={{ fontSize: 10, fill: '#141414', fontFamily: 'monospace' }} />
                <YAxis axisLine={{ stroke: '#141414' }} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: '#141414', fontFamily: 'monospace' }} />
                <Tooltip
                  cursor={{ fill: '#14141411' }}
                  contentStyle={{ backgroundColor: '#141414', border: 'none', color: '#E4E3E0', fontFamily: 'monospace', fontSize: '10px' }}
                />
                <Bar dataKey="value" fill="#141414" radius={0} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Status Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="border border-brand-text bg-white p-6"
        >
          <h3 className="font-serif italic text-[11px] opacity-50 uppercase mb-6 tracking-widest">Status Pipeline</h3>
          <div className="space-y-4">
            {pipeline.rows.map((row, i) => {
              const Icon = row.icon;
              const pct = Math.round(row.count / pipeline.max * 100);
              return (
                <motion.div
                  key={row.key}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.07, duration: 0.25 }}
                  className="group"
                >
                  <div className="flex items-center justify-between font-mono text-[10px] mb-1.5">
                    <span className="flex items-center gap-2 font-bold uppercase">
                      <Icon size={10} style={{ color: row.color }} />
                      {row.label}
                    </span>
                    <span className="opacity-40">{row.count}</span>
                  </div>
                  <div className="h-2 border border-brand-text bg-white overflow-hidden">
                    <motion.div
                      className="h-full"
                      style={{ backgroundColor: row.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pct, row.count > 0 ? 6 : 0)}%` }}
                      transition={{ delay: 0.35 + i * 0.07, duration: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-6 pt-4 border-t border-brand-text/10 flex items-center justify-between font-mono text-[9px] opacity-50 uppercase">
            <span>Flow DETECTED → RESOLVED</span>
            <ArrowUpRight size={12} />
          </div>
        </motion.div>
      </div>

      {/* Live Detection Feed */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="border border-brand-text bg-white overflow-hidden"
      >
        <div className="p-3 border-b border-brand-text flex items-center justify-between bg-brand-text text-brand-bg font-mono text-[10px] uppercase font-bold">
          <span className="flex items-center gap-2">
            <Radio size={12} className="animate-pulse" />
            Live Detection Feed
          </span>
          <span>{recent.length} NODES · 10S POLL</span>
        </div>
        {recent.length === 0 ? (
          <div className="p-10 text-center font-mono text-[10px] opacity-40 italic">
            AWAITING_EDGE_TRANSMISSIONS...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 divide-x divide-y divide-brand-text/10 md:divide-x-0 xl:divide-x">
            {recent.map((p, i) => (
              <motion.div
                key={p.id ?? p.timestamp}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 + i * 0.05 }}
                className="group flex gap-3 p-3 hover:bg-brand-bg transition-colors"
              >
                <div className="w-16 h-12 border border-brand-text overflow-hidden bg-brand-bg flex-shrink-0">
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 group-hover:scale-105 transition-all"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0 font-mono text-[9px]">
                  <div className="flex items-center justify-between leading-none mb-1">
                    <span className="font-bold uppercase tracking-tighter truncate">AREA_{p.busRouteId}</span>
                    <span className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ backgroundColor: SEVERITY_COLORS[p.severity] || '#9ca3af' }}
                      />
                      <span className="opacity-40">{(p.confidence * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="opacity-50 uppercase truncate">{p.status.replace(/_/g, ' ')}</div>
                  <div className="opacity-30 mt-0.5 flex items-center gap-1">
                    <Clock size={8} />
                    {formatDistanceToNow(new Date(p.timestamp), { addSuffix: true })}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  highlight,
  live,
  delay
}: {
  icon: React.ReactNode,
  label: string,
  value: string | number,
  sub: string,
  highlight?: string,
  live?: boolean,
  delay?: { delay: number }
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...delay, duration: 0.3 }}
      className={`relative border border-brand-text p-4 flex flex-col justify-between overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#141414] group ${highlight || 'bg-white'}`}
    >
      {live && (
        <span className="absolute top-3 right-3 flex items-center gap-1.5 font-mono text-[8px] font-bold text-green-700 uppercase">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          Live
        </span>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="font-serif italic text-[11px] opacity-50 group-hover:opacity-80 transition-opacity">{label}</div>
        <span className="opacity-30 group-hover:opacity-60 transition-opacity">{icon}</span>
      </div>
      <div>
        <div className="text-3xl font-mono font-bold tracking-tighter leading-none mb-1 group-hover:scale-105 origin-left transition-transform">
          {value}
        </div>
        <div className="text-[9px] font-mono opacity-40">{sub}</div>
      </div>
    </motion.div>
  );
}
