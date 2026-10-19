'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';
import SlideOver from '@/components/ui/SlideOver';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';

type AlertStatus = 'NEW' | 'ACK' | 'RESOLVED';
type AlertCategory = 'Technical issue' | 'Health question' | 'Resources' | 'Other';
type FilterView = 'open' | 'new' | 'ack' | 'resolved' | 'all';

interface Alert {
  id: string;
  patientName: string;
  username: string;
  category: AlertCategory;
  message: string;
  timestamp: string;
  status: AlertStatus;
  notes: string;
  severity: 'SUPPORT';
}

const mockAlerts: Alert[] = [
  {
    id: 'alert-001',
    patientName: 'Maria Gonzalez',
    username: 'rocketcar',
    category: 'Health question',
    message: 'I\'ve been feeling more short of breath than usual after my morning walk. My weight was up 3 lbs this morning compared to yesterday. Should I call my doctor?',
    timestamp: '2026-10-07T05:42:00',
    status: 'NEW',
    notes: '',
    severity: 'SUPPORT',
  },
  {
    id: 'alert-002',
    patientName: 'James Okafor',
    username: 'sunflower42',
    category: 'Technical issue',
    message: 'The video in Session 3 (Daily Weight Monitoring) won\'t load. I keep getting a spinning wheel. I have good WiFi.',
    timestamp: '2026-10-07T04:15:00',
    status: 'NEW',
    notes: '',
    severity: 'SUPPORT',
  },
  {
    id: 'alert-003',
    patientName: 'Linda Chen',
    username: 'heartstrong',
    category: 'Resources',
    message: 'Can you send me more information about the heart failure support group? I would like to join but I don\'t see a schedule anywhere in the app.',
    timestamp: '2026-10-06T18:30:00',
    status: 'ACK',
    notes: 'Sent support group schedule via secure message. Follow up in 2 days.',
    severity: 'SUPPORT',
  },
  {
    id: 'alert-004',
    patientName: 'Robert Williams',
    username: 'blueskies99',
    category: 'Health question',
    message: 'My ankles have been swelling more this week. I\'ve been taking my furosemide as prescribed. Is this normal or should I be concerned?',
    timestamp: '2026-10-06T14:22:00',
    status: 'NEW',
    notes: '',
    severity: 'SUPPORT',
  },
  {
    id: 'alert-005',
    patientName: 'Priya Patel',
    username: 'calmwaters',
    category: 'Technical issue',
    message: 'I completed the baseline survey but it doesn\'t show as completed in the app. I want to make sure my responses were saved.',
    timestamp: '2026-10-06T11:05:00',
    status: 'ACK',
    notes: 'Confirmed REDCap received the response. Notified patient.',
    severity: 'SUPPORT',
  },
  {
    id: 'alert-006',
    patientName: 'David Kim',
    username: 'morningstar',
    category: 'Other',
    message: 'I have a question about the study timeline. When does the 30-day follow-up survey open? I want to make sure I complete it on time.',
    timestamp: '2026-10-05T09:18:00',
    status: 'RESOLVED',
    notes: 'Explained study timeline. 30-day survey opens Oct 15. Patient satisfied.',
    severity: 'SUPPORT',
  },
  {
    id: 'alert-007',
    patientName: 'Angela Torres',
    username: 'steadypace',
    category: 'Health question',
    message: 'I missed my cardiology appointment yesterday due to transportation issues. What should I do? Can the study team help me reschedule?',
    timestamp: '2026-10-05T07:55:00',
    status: 'RESOLVED',
    notes: 'Contacted clinic, rescheduled for Oct 12. Provided transportation resources.',
    severity: 'SUPPORT',
  },
];

const categoryColors: Record<AlertCategory, string> = {
  'Health question': 'bg-danger/10 text-danger',
  'Technical issue': 'bg-warning/10 text-warning',
  'Resources': 'bg-info/10 text-info',
  'Other': 'bg-muted text-muted-foreground',
};

const filterLabels: Record<FilterView, string> = {
  open: 'Open (NEW + ACK)',
  new: 'NEW Only',
  ack: 'ACK Only',
  resolved: 'Resolved',
  all: 'All',
};

export default function AlertsClient() {
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);
  const [filterView, setFilterView] = useState<FilterView>('open');
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const newCount = alerts.filter(a => a.status === 'NEW').length;

  const filtered = alerts.filter(a => {
    if (filterView === 'open') return a.status === 'NEW' || a.status === 'ACK';
    if (filterView === 'new') return a.status === 'NEW';
    if (filterView === 'ack') return a.status === 'ACK';
    if (filterView === 'resolved') return a.status === 'RESOLVED';
    return true;
  });

  const handleAcknowledge = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'ACK' } : a));
    if (selectedAlert?.id === id) setSelectedAlert(prev => prev ? { ...prev, status: 'ACK' } : null);
    toast.success('Alert acknowledged');
  };

  const handleResolve = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'RESOLVED' } : a));
    if (selectedAlert?.id === id) setSelectedAlert(prev => prev ? { ...prev, status: 'RESOLVED' } : null);
    toast.success('Alert resolved — removed from Open view');
  };

  const handleSaveNotes = async (id: string) => {
    setSavingNotes(true);
    await new Promise(r => setTimeout(r, 500));
    // TODO: PATCH /api/alerts/:id with notes
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, notes: notesDraft } : a));
    if (selectedAlert?.id === id) setSelectedAlert(prev => prev ? { ...prev, notes: notesDraft } : null);
    setSavingNotes(false);
    toast.success('Notes saved');
  };

  const openDetail = (alert: Alert) => {
    setSelectedAlert(alert);
    setNotesDraft(alert.notes);
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const timeAgo = (ts: string) => {
    const diffMs = Date.now() - new Date(ts).getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor(diffMs / 60000);
    if (diffH > 24) return `${Math.floor(diffH / 24)}d ago`;
    if (diffH > 0) return `${diffH}h ago`;
    return `${diffM}m ago`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-700 text-foreground">Alerts</h1>
            {newCount > 0 && (
              <span className="bg-danger text-white text-[11px] font-700 rounded-full px-2 py-0.5 leading-none">
                {newCount} NEW
              </span>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Patient help requests from the "Need Help?" button in the mobile app.
          </p>
        </div>
        <button
          onClick={() => { toast.success('Alerts refreshed'); }}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
        >
          <Icon name="ArrowPathIcon" size={14} variant="outline" />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'NEW', value: alerts.filter(a => a.status === 'NEW').length, color: 'text-danger', bg: 'bg-danger/5 border-danger/20' },
          { label: 'Acknowledged', value: alerts.filter(a => a.status === 'ACK').length, color: 'text-warning', bg: 'bg-warning/5 border-warning/20' },
          { label: 'Resolved Today', value: 2, color: 'text-success', bg: 'bg-success/5 border-success/20' },
          { label: 'Total Open', value: alerts.filter(a => a.status !== 'RESOLVED').length, color: 'text-foreground', bg: 'bg-card border-border' },
        ].map((stat) => (
          <div key={`stat-${stat.label}`} className={`rounded-xl border p-4 ${stat.bg}`}>
            <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={`text-[28px] font-700 tabular-nums ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit flex-wrap">
        {(Object.keys(filterLabels) as FilterView[]).map((f) => (
          <button
            key={`filter-${f}`}
            onClick={() => setFilterView(f)}
            className={`
              px-3 py-1.5 rounded-md text-[12px] font-500 transition-all duration-150
              ${filterView === f ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            {filterLabels[f]}
            {f === 'new' && newCount > 0 && (
              <span className="ml-1.5 bg-danger text-white text-[9px] font-700 rounded-full px-1 py-0.5 leading-none">
                {newCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-5 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Patient</th>
                <th className="text-left px-5 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Category</th>
                <th className="text-left px-5 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Message</th>
                <th className="text-left px-5 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Time</th>
                <th className="text-left px-5 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Severity</th>
                <th className="text-left px-5 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon="BellSlashIcon"
                      title={filterView === 'open' ? 'No open alerts' : `No ${filterView} alerts`}
                      description={filterView === 'open' ? 'All patient help requests have been addressed. Great work!' : `No alerts match the current filter.`}
                    />
                  </td>
                </tr>
              ) : filtered.map((alert) => (
                <tr
                  key={alert.id}
                  className={`
                    border-b border-border last:border-0 transition-colors duration-100 group cursor-pointer
                    ${alert.status === 'NEW' ? 'bg-danger/2 hover:bg-danger/5' : ''}
                    ${alert.status === 'ACK' ? 'bg-warning/2 hover:bg-warning/5' : ''}
                    ${alert.status === 'RESOLVED' ? 'hover:bg-muted/30' : ''}
                  `}
                  onClick={() => openDetail(alert)}
                >
                  <td className="px-5 py-3">
                    <p className="text-[13px] font-600 text-foreground">{alert.patientName}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{alert.username}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full ${categoryColors[alert.category]}`}>
                      {alert.category}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-[13px] text-foreground max-w-[280px] truncate">{alert.message}</p>
                    {alert.notes && (<p className="text-[11px] text-muted-foreground mt-0.5">📝 Note saved</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                    <p>{timeAgo(alert.timestamp)}</p>
                    <p className="text-[10px]">{formatTimestamp(alert.timestamp)}</p>
                  </td>
                  <td className="px-5 py-3">
                    {alert.status === 'NEW' && <Badge variant="new" label="NEW" />}
                    {alert.status === 'ACK' && <Badge variant="ack" label="ACK" />}
                    {alert.status === 'RESOLVED' && <Badge variant="resolved" label="Resolved" />}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      SUPPORT
                    </span>
                  </td>
                  <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {alert.status === 'NEW' && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          title="Acknowledge this alert"
                          className="px-2 py-1 bg-warning/10 text-warning rounded-md text-[11px] font-600 hover:bg-warning/20 transition-colors duration-100"
                        >
                          ACK
                        </button>
                      )}
                      {(alert.status === 'NEW' || alert.status === 'ACK') && (
                        <button
                          onClick={() => handleResolve(alert.id)}
                          title="Resolve this alert — removes from Open view"
                          className="px-2 py-1 bg-success/10 text-success rounded-md text-[11px] font-600 hover:bg-success/20 transition-colors duration-100"
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        onClick={() => openDetail(alert)}
                        title="View full message and add notes"
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                      >
                        <Icon name="ChatBubbleLeftEllipsisIcon" size={14} variant="outline" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail SlideOver */}
      <SlideOver
        open={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        title="Alert Detail"
        subtitle={selectedAlert ? `${selectedAlert.patientName} · ${selectedAlert.category}` : ''}
        width="md"
        footer={
          selectedAlert && (selectedAlert.status === 'NEW' || selectedAlert.status === 'ACK') ? (
            <>
              {selectedAlert.status === 'NEW' && (
                <button
                  onClick={() => handleAcknowledge(selectedAlert.id)}
                  className="px-4 py-2 bg-warning/10 text-warning border border-warning/20 rounded-lg text-[13px] font-600 hover:bg-warning/20 transition-colors duration-150"
                >
                  Acknowledge
                </button>
              )}
              <button
                onClick={() => handleResolve(selectedAlert.id)}
                className="px-4 py-2 bg-success text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150"
              >
                Mark Resolved
              </button>
            </>
          ) : undefined
        }
      >
        {selectedAlert && (
          <div className="space-y-5">
            {/* Status */}
            <div className="flex items-center gap-2">
              {selectedAlert.status === 'NEW' && <Badge variant="new" label="NEW" />}
              {selectedAlert.status === 'ACK' && <Badge variant="ack" label="ACKNOWLEDGED" />}
              {selectedAlert.status === 'RESOLVED' && <Badge variant="resolved" label="RESOLVED" />}
              <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full ${categoryColors[selectedAlert.category]}`}>
                {selectedAlert.category}
              </span>
            </div>

            {/* Patient info */}
            <div className="p-3 bg-muted/40 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[13px] font-700 shrink-0">
                  {selectedAlert.patientName.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="text-[13px] font-600 text-foreground">{selectedAlert.patientName}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">@{selectedAlert.username}</p>
                </div>
                <div className="ml-auto">
                  <button
                    title="Open chat with this patient"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
                  >
                    <Icon name="ChatBubbleLeftRightIcon" size={13} variant="outline" />
                    Open Chat
                  </button>
                </div>
              </div>
            </div>

            {/* Timestamp */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">Received</p>
              <p className="text-[13px] text-foreground">{formatTimestamp(selectedAlert.timestamp)} · {timeAgo(selectedAlert.timestamp)}</p>
            </div>

            {/* Full message */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">Patient Message</p>
              <div className="p-4 bg-muted/30 rounded-lg border border-border">
                <p className="text-[13px] text-foreground leading-relaxed">{selectedAlert.message}</p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">Staff Notes</p>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                rows={4}
                placeholder="Add internal notes about how this was handled..."
                className="w-full px-3 py-2.5 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => handleSaveNotes(selectedAlert.id)}
                  disabled={savingNotes}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-600 hover:opacity-90 transition-all duration-150 disabled:opacity-60"
                >
                  {savingNotes ? (
                    <><Icon name="ArrowPathIcon" size={12} variant="outline" className="animate-spin" />Saving...</>
                  ) : 'Save Notes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}