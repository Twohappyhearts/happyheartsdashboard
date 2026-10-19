'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';

import SlideOver from '@/components/ui/SlideOver';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';

type UserStatus = 'active' | 'inactive' | 'suspended';

interface Patient {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  joinDate: string;
  lastActive: string;
  sessionsOpened: number;
  alertsSent: number;
  surveysCompleted: number;
  status: UserStatus;
  enrollmentId: string;
}

const mockPatients: Patient[] = [
  { id: 'user-001', username: 'rocketcar', fullName: 'Maria Gonzalez', email: 'maria.gonzalez@email.com', phone: '(714) 555-0182', joinDate: '2026-08-01', lastActive: '2026-10-07', sessionsOpened: 7, alertsSent: 1, surveysCompleted: 1, status: 'active', enrollmentId: 'HH-2026-001' },
  { id: 'user-002', username: 'sunflower42', fullName: 'James Okafor', email: 'j.okafor@email.com', phone: '(949) 555-0247', joinDate: '2026-08-03', lastActive: '2026-10-06', sessionsOpened: 5, alertsSent: 1, surveysCompleted: 1, status: 'active', enrollmentId: 'HH-2026-002' },
  { id: 'user-003', username: 'heartstrong', fullName: 'Linda Chen', email: 'linda.chen@email.com', phone: '(562) 555-0391', joinDate: '2026-08-05', lastActive: '2026-10-07', sessionsOpened: 6, alertsSent: 1, surveysCompleted: 2, status: 'active', enrollmentId: 'HH-2026-003' },
  { id: 'user-004', username: 'blueskies99', fullName: 'Robert Williams', email: 'r.williams@email.com', phone: '(213) 555-0148', joinDate: '2026-08-08', lastActive: '2026-10-06', sessionsOpened: 4, alertsSent: 1, surveysCompleted: 1, status: 'active', enrollmentId: 'HH-2026-004' },
  { id: 'user-005', username: 'calmwaters', fullName: 'Priya Patel', email: 'priya.patel@email.com', phone: '(626) 555-0274', joinDate: '2026-08-10', lastActive: '2026-10-05', sessionsOpened: 6, alertsSent: 1, surveysCompleted: 2, status: 'active', enrollmentId: 'HH-2026-005' },
  { id: 'user-006', username: 'morningstar', fullName: 'David Kim', email: 'd.kim@email.com', phone: '(310) 555-0315', joinDate: '2026-08-12', lastActive: '2026-10-05', sessionsOpened: 5, alertsSent: 1, surveysCompleted: 1, status: 'active', enrollmentId: 'HH-2026-006' },
  { id: 'user-007', username: 'steadypace', fullName: 'Angela Torres', email: 'a.torres@email.com', phone: '(818) 555-0429', joinDate: '2026-08-15', lastActive: '2026-10-04', sessionsOpened: 3, alertsSent: 1, surveysCompleted: 1, status: 'active', enrollmentId: 'HH-2026-007' },
  { id: 'user-008', username: 'brightpath', fullName: 'Marcus Johnson', email: 'm.johnson@email.com', phone: '(323) 555-0183', joinDate: '2026-08-18', lastActive: '2026-10-03', sessionsOpened: 2, alertsSent: 0, surveysCompleted: 1, status: 'inactive', enrollmentId: 'HH-2026-008' },
  { id: 'user-009', username: 'hopefulday', fullName: 'Susan Martinez', email: 's.martinez@email.com', phone: '(714) 555-0562', joinDate: '2026-08-20', lastActive: '2026-09-28', sessionsOpened: 1, alertsSent: 0, surveysCompleted: 1, status: 'inactive', enrollmentId: 'HH-2026-009' },
  { id: 'user-010', username: 'gentlebreeze', fullName: 'Kevin Park', email: 'k.park@email.com', phone: '(949) 555-0637', joinDate: '2026-08-22', lastActive: '2026-09-15', sessionsOpened: 0, alertsSent: 0, surveysCompleted: 0, status: 'suspended', enrollmentId: 'HH-2026-010' },
];

export default function UserManagementClient() {
  const [patients, setPatients] = useState<Patient[]>(mockPatients);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [sortKey, setSortKey] = useState<keyof Patient>('lastActive');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = patients
    .filter(p => {
      const matchSearch =
        p.fullName.toLowerCase().includes(search.toLowerCase()) ||
        p.username.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase()) ||
        p.enrollmentId.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' ? true : p.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });

  const handleSort = (key: keyof Patient) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const handleStatusChange = (id: string, status: UserStatus) => {
    setPatients(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    if (selectedPatient?.id === id) setSelectedPatient(prev => prev ? { ...prev, status } : null);
    toast.success(`Patient account ${status}`);
  };

  const SortIcon = ({ col }: { col: keyof Patient }) => (
    <span className={`ml-1 text-[10px] ${sortKey === col ? 'text-primary' : 'text-muted-foreground'}`}>
      {sortKey === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  const activePct = Math.round((patients.filter(p => p.status === 'active').length / patients.length) * 100);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">User Management</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Patient accounts — usernames serve as REDCap participant codes.
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm"
          onClick={() => toast.success('Invite sent — patient will receive onboarding email')}
        >
          <Icon name="UserPlusIcon" size={16} variant="outline" />
          Invite Patient
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Enrolled', value: patients.length, color: 'text-foreground', bg: 'bg-card border-border' },
          { label: 'Active', value: patients.filter(p => p.status === 'active').length, color: 'text-success', bg: 'bg-success/5 border-success/20' },
          { label: 'Inactive', value: patients.filter(p => p.status === 'inactive').length, color: 'text-warning', bg: 'bg-warning/5 border-warning/20' },
          { label: 'Suspended', value: patients.filter(p => p.status === 'suspended').length, color: 'text-danger', bg: 'bg-danger/5 border-danger/20' },
        ].map(stat => (
          <div key={`ustat-${stat.label}`} className={`rounded-xl border p-4 ${stat.bg}`}>
            <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={`text-[28px] font-700 tabular-nums ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, username, email, or enrollment ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-80"
          />
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['all', 'active', 'inactive', 'suspended'] as const).map(f => (
            <button
              key={`uf-${f}`}
              onClick={() => setStatusFilter(f)}
              className={`
                px-3 py-1.5 rounded-md text-[12px] font-500 transition-all duration-150 capitalize
                ${statusFilter === f ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-muted-foreground ml-auto">{filtered.length} of {patients.length} patients</span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[
                  { key: 'fullName', label: 'Patient' },
                  { key: 'username', label: 'Username / Code' },
                  { key: 'enrollmentId', label: 'Enrollment ID' },
                  { key: 'joinDate', label: 'Enrolled' },
                  { key: 'lastActive', label: 'Last Active' },
                  { key: 'sessionsOpened', label: 'Sessions' },
                  { key: 'alertsSent', label: 'Alerts' },
                  { key: 'surveysCompleted', label: 'Surveys' },
                  { key: 'status', label: 'Status' },
                ].map(col => (
                  <th
                    key={`uth-${col.key}`}
                    onClick={() => handleSort(col.key as keyof Patient)}
                    className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                  >
                    {col.label}
                    <SortIcon col={col.key as keyof Patient} />
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon="UsersIcon"
                      title="No patients found"
                      description="No patients match your current search or filter. Try adjusting your criteria or invite a new patient."
                      action={{ label: 'Invite Patient', onClick: () => toast.success('Invite sent') }}
                    />
                  </td>
                </tr>
              ) : filtered.map(patient => (
                <tr
                  key={patient.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors duration-100 group cursor-pointer"
                  onClick={() => setSelectedPatient(patient)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[11px] font-700 shrink-0">
                        {patient.fullName.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-[13px] font-600 text-foreground">{patient.fullName}</p>
                        <p className="text-[11px] text-muted-foreground">{patient.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-[12px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{patient.username}</code>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground">{patient.enrollmentId}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{patient.joinDate}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{patient.lastActive}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-500 text-foreground">{patient.sessionsOpened}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-500 text-foreground">{patient.alertsSent}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-500 text-foreground">{patient.surveysCompleted}</td>
                  <td className="px-4 py-3">
                    <Badge variant={patient.status} label={patient.status.charAt(0).toUpperCase() + patient.status.slice(1)} />
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                        onClick={() => setSelectedPatient(patient)}
                        title="View patient details"
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                      >
                        <Icon name="EyeIcon" size={14} variant="outline" />
                      </button>
                      {patient.status !== 'suspended' ? (
                        <button
                          onClick={() => handleStatusChange(patient.id, 'suspended')}
                          title="Suspend patient account"
                          className="p-1.5 rounded-md hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors duration-100"
                        >
                          <Icon name="NoSymbolIcon" size={14} variant="outline" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(patient.id, 'active')}
                          title="Reactivate patient account"
                          className="p-1.5 rounded-md hover:bg-success/10 text-muted-foreground hover:text-success transition-colors duration-100"
                        >
                          <Icon name="CheckCircleIcon" size={14} variant="outline" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <p className="text-[12px] text-muted-foreground">Showing {filtered.length} of {patients.length} patients</p>
          <div className="flex items-center gap-1">
            <button className="px-2.5 py-1.5 border border-border rounded-md text-[12px] text-muted-foreground hover:bg-muted transition-colors duration-100 disabled:opacity-40" disabled>
              ← Prev
            </button>
            <button className="px-2.5 py-1.5 bg-primary text-primary-foreground rounded-md text-[12px] font-600">1</button>
            <button className="px-2.5 py-1.5 border border-border rounded-md text-[12px] text-muted-foreground hover:bg-muted transition-colors duration-100 disabled:opacity-40" disabled>
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Patient Detail SlideOver */}
      <SlideOver
        open={!!selectedPatient}
        onClose={() => setSelectedPatient(null)}
        title="Patient Profile"
        subtitle={selectedPatient ? `${selectedPatient.enrollmentId} · @${selectedPatient.username}` : ''}
        width="md"
      >
        {selectedPatient && (
          <div className="space-y-5">
            {/* Avatar + info */}
            <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[18px] font-700 shrink-0">
                {selectedPatient.fullName.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h3 className="text-[16px] font-600 text-foreground">{selectedPatient.fullName}</h3>
                <p className="text-[12px] font-mono text-muted-foreground">@{selectedPatient.username}</p>
                <p className="text-[12px] text-muted-foreground">{selectedPatient.email}</p>
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">Account Status</p>
              <div className="flex items-center gap-2">
                <Badge variant={selectedPatient.status} label={selectedPatient.status.charAt(0).toUpperCase() + selectedPatient.status.slice(1)} />
                {selectedPatient.status !== 'active' && (
                  <button
                    onClick={() => handleStatusChange(selectedPatient.id, 'active')}
                    className="px-3 py-1 bg-success/10 text-success rounded-lg text-[12px] font-600 hover:bg-success/20 transition-colors duration-150"
                  >
                    Reactivate
                  </button>
                )}
                {selectedPatient.status === 'active' && (
                  <button
                    onClick={() => handleStatusChange(selectedPatient.id, 'inactive')}
                    className="px-3 py-1 bg-warning/10 text-warning rounded-lg text-[12px] font-600 hover:bg-warning/20 transition-colors duration-150"
                  >
                    Set Inactive
                  </button>
                )}
              </div>
            </div>

            {/* Key details */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Enrollment ID', value: selectedPatient.enrollmentId },
                { label: 'Phone', value: selectedPatient.phone },
                { label: 'Enrolled', value: selectedPatient.joinDate },
                { label: 'Last Active', value: selectedPatient.lastActive },
              ].map(detail => (
                <div key={`detail-${detail.label}`} className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">{detail.label}</p>
                  <p className="text-[13px] font-500 text-foreground mt-0.5">{detail.value}</p>
                </div>
              ))}
            </div>

            {/* Activity stats */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">Activity Summary</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Sessions', value: selectedPatient.sessionsOpened, icon: 'BookOpenIcon' },
                  { label: 'Alerts', value: selectedPatient.alertsSent, icon: 'BellAlertIcon' },
                  { label: 'Surveys', value: selectedPatient.surveysCompleted, icon: 'ClipboardDocumentListIcon' },
                ].map(stat => (
                  <div key={`pstat-${stat.label}`} className="p-3 bg-muted/30 rounded-lg text-center">
                    <Icon name={stat.icon as Parameters<typeof Icon>[0]['name']} size={16} variant="outline" className="text-muted-foreground mx-auto mb-1" />
                    <p className="text-[20px] font-700 tabular-nums text-foreground">{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* REDCap participant code */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">REDCap Participant Code</p>
              <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2.5 border border-border">
                <code className="text-[13px] font-mono text-foreground flex-1">{selectedPatient.username}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(selectedPatient.username); toast.success('Participant code copied'); }}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                  title="Copy participant code"
                >
                  <Icon name="ClipboardDocumentIcon" size={14} variant="outline" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">This username is automatically appended to all REDCap survey links for this patient.</p>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}