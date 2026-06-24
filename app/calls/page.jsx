'use client';

export default function CallsPage() {
  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold font-display">Calls</h1>
        <p className="text-gray-400">Track all cold calls and conversations</p>
      </div>

      <div className="bg-gradient-dark border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Today&apos;s Calls</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Business</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Time</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Duration</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Outcome</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-900 hover:bg-gray-900/50">
              <td className="py-4 px-4">ABC Cleaning</td>
              <td className="py-4 px-4 text-gray-400">09:30 AM</td>
              <td className="py-4 px-4 text-gray-400">5m 23s</td>
              <td className="py-4 px-4">Interested</td>
              <td className="py-4 px-4"><span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">Connected</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
