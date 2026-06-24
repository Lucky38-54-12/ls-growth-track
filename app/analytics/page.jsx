'use client';

export default function AnalyticsPage() {
  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold font-display">Analytics</h1>
        <p className="text-gray-400">Deep dive into performance metrics</p>
      </div>

      <div className="bg-gradient-dark border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Call Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-400">Avg Response Time</p>
            <p className="text-2xl font-bold mt-2">3.2s</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Best Performing Hour</p>
            <p className="text-2xl font-bold mt-2">10-11 AM</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Trend</p>
            <p className="text-2xl font-bold text-green-400 mt-2">📈 +12%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
