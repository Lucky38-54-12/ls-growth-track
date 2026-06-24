'use client';

export default function EmailsPage() {
  const [emails, setEmails] = [[], () => {}];
  const [stats, setStats] = [{ total: 0, opened: 0, clicked: 0, bounced: 0, openRate: 0, clickRate: 0 }, () => {}];

  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold font-display">Emails</h1>
        <p className="text-gray-400">Track all outgoing emails and engagement</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-dark border border-gray-800 rounded-xl p-6">
          <p className="text-sm text-gray-400">Total Sent</p>
          <p className="text-3xl font-bold mt-2">{stats.total}</p>
        </div>
        <div className="bg-gradient-dark border border-gray-800 rounded-xl p-6">
          <p className="text-sm text-gray-400">Opened</p>
          <p className="text-3xl font-bold mt-2 text-blue-400">{stats.opened}</p>
          <p className="text-xs text-gray-500 mt-1">{stats.openRate}% open rate</p>
        </div>
      </div>
    </div>
  );
}
