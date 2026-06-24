'use client';

export default function ReportsPage() {
  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold font-display">Reports</h1>
        <p className="text-gray-400">Weekly and monthly performance summaries</p>
      </div>

      <div className="bg-gradient-dark border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold">Latest Report</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
            <span>Weekly Summary - June 24</span>
            <button className="text-blue-400 hover:text-blue-300">View →</button>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
            <span>Monthly Summary - June 2026</span>
            <button className="text-blue-400 hover:text-blue-300">View →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
