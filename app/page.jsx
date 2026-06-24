'use client';

import { useEffect, useState } from 'react';
import MetricCard from '@/components/MetricCard';
import ChartCard from '@/components/ChartCard';
import AlertCard from '@/components/AlertCard';
import { LineChart, Line, BarChart, Bar, FunnelChart, Funnel, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const callTrendData = [
  { day: 'Mon', calls: 45, convos: 12, meetings: 4 },
  { day: 'Tue', calls: 52, convos: 15, meetings: 6 },
  { day: 'Wed', calls: 48, convos: 13, meetings: 5 },
  { day: 'Thu', calls: 61, convos: 18, meetings: 7 },
  { day: 'Fri', calls: 55, convos: 16, meetings: 6 },
  { day: 'Sat', calls: 42, convos: 10, meetings: 3 },
  { day: 'Sun', calls: 38, convos: 8, meetings: 2 },
];

const pipelineData = [
  { name: 'Prospects', value: 150 },
  { name: 'Contacted', value: 120 },
  { name: 'Follow-up', value: 90 },
  { name: 'Replied', value: 65 },
  { name: 'Booked', value: 40 },
  { name: 'Closed', value: 12 },
];

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    dailyCalls: 45,
    weeklyCalls: 298,
    conversations: 78,
    meetingsBooked: 18,
    conversionRate: 38,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // In production, fetch from API
  }, []);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold font-display">Dashboard</h1>
        <p className="text-gray-400">Real-time automation metrics and insights</p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <MetricCard
          title="Today&apos;s Calls"
          value={metrics.dailyCalls}
          target={50}
          icon="📞"
          color="blue"
        />
        <MetricCard
          title="Weekly Calls"
          value={metrics.weeklyCalls}
          target={350}
          icon="📈"
          color="green"
        />
        <MetricCard
          title="Conversations"
          value={metrics.conversations}
          target={100}
          icon="💬"
          color="purple"
        />
        <MetricCard
          title="Meetings"
          value={metrics.meetingsBooked}
          target={20}
          icon="📅"
          color="orange"
        />
        <MetricCard
          title="Conv. Rate"
          value={`${metrics.conversionRate}%`}
          target="40%"
          icon="🎯"
          color="red"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Call Trends (7 Days)" height={300}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={callTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
              <Legend />
              <Line type="monotone" dataKey="calls" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb' }} />
              <Line type="monotone" dataKey="convos" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
              <Line type="monotone" dataKey="meetings" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pipeline Funnel" height={300}>
          <ResponsiveContainer width="100%" height={250}>
            <FunnelChart data={pipelineData}>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
              <Funnel dataKey="value" data={pipelineData} fill="#2563eb" />
            </FunnelChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Alerts & Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AlertCard
          title="Pending Emails"
          count={3}
          icon="📧"
          type="info"
          action="Review Drafts"
        />
        <AlertCard
          title="Stale Leads"
          count={8}
          icon="⚠️"
          type="warning"
          action="View Leads"
        />
        <AlertCard
          title="System Health"
          count="99%"
          icon="✅"
          type="success"
          action="View Details"
        />
      </div>

      {/* Insights */}
      <div className="bg-gradient-dark border border-blue-500/20 rounded-xl p-6 space-y-4">
        <h2 className="text-xl font-bold font-display">📊 Today&apos;s Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-400">Best Day</p>
            <p className="text-lg font-semibold">Thursday (61 calls)</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-400">Conversion Trend</p>
            <p className="text-lg font-semibold text-green-400">📈 +5% this week</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-400">Recommendation</p>
            <p className="text-lg font-semibold">Block more calls on best days</p>
          </div>
        </div>
      </div>
    </div>
  );
}
