'use client';

export default function SettingsPage() {
  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold font-display">Settings</h1>
        <p className="text-gray-400">Configure your dashboard and automations</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-gradient-dark border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold">Preferences</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Email Notifications</span>
              <input type="checkbox" defaultChecked className="w-4 h-4" />
            </div>
            <div className="flex items-center justify-between">
              <span>Daily Reports</span>
              <input type="checkbox" defaultChecked className="w-4 h-4" />
            </div>
            <div className="flex items-center justify-between">
              <span>Real-time Alerts</span>
              <input type="checkbox" defaultChecked className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-dark border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold">Automations</h2>
          <button className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition">
            Manage Automations
          </button>
        </div>
      </div>
    </div>
  );
}
