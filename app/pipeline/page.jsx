'use client';

export default function PipelinePage() {
  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold font-display">Pipeline</h1>
        <p className="text-gray-400">Track prospects through the sales funnel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {['Prospects', 'Contacted', 'Follow-up', 'Replied', 'Booked', 'Closed'].map((stage, idx) => (
          <div key={stage} className="bg-gradient-dark border border-gray-800 rounded-xl p-6 space-y-2">
            <p className="text-sm text-gray-400">{stage}</p>
            <p className="text-3xl font-bold">{[150, 120, 90, 65, 40, 12][idx]}</p>
            <div className="w-full bg-gray-800 rounded-full h-1"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
