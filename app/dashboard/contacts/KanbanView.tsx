'use client';

import { useState } from 'react';

interface Contact {
  lead_id: string;
  company: string;
  contact_name?: string;
  email?: string;
  status: string;
}

export default function KanbanView({ leads }: { leads: Contact[] }) {
  const [contacts, setContacts] = useState(leads);

  const stages = [
    { id: 'not_contacted', label: 'New Enquiry', color: '#94a3b8' },
    { id: 'contacted', label: 'Contacted', color: '#2563eb' },
    { id: 'followup_1_sent', label: 'Follow-up 1', color: '#8b5cf6' },
    { id: 'replied', label: 'Replied', color: '#16a34a' },
    { id: 'booked', label: 'Booked', color: '#dc2626' },
  ];

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const contactId = e.dataTransfer.getData('contactId');
    setContacts(
      contacts.map(c =>
        c.lead_id === contactId ? { ...c, status: stageId } : c
      )
    );
    // TODO: Persist to backend
  };

  const getContactsForStage = (stageId: string) =>
    contacts.filter(c => c.status === stageId);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20, marginTop: 20 }}>
      {stages.map(stage => (
        <div
          key={stage.id}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, stage.id)}
          style={{
            background: '#f8fafc',
            borderRadius: '8px',
            padding: '16px',
            minHeight: '500px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              {stage.label}
            </h3>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>
              {getContactsForStage(stage.id).length}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
            {getContactsForStage(stage.id).map(contact => (
              <div
                key={contact.lead_id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('contactId', contact.lead_id);
                }}
                style={{
                  background: '#fff',
                  border: `1px solid #e2e8f0`,
                  borderLeft: `4px solid ${stage.color}`,
                  padding: '12px',
                  borderRadius: '6px',
                  cursor: 'grab',
                  transition: 'all 0.2s',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                  {contact.company}
                </p>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px 0' }}>
                  {contact.contact_name || 'No name'}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                  {contact.email || '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
