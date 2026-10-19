'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import type { Survey } from './SurveyManagementClient';

const mockUsers = [
  { id: 'user-001', username: 'rocketcar', fullName: 'Maria Gonzalez' },
  { id: 'user-002', username: 'sunflower42', fullName: 'James Okafor' },
  { id: 'user-003', username: 'heartstrong', fullName: 'Linda Chen' },
  { id: 'user-004', username: 'blueskies99', fullName: 'Robert Williams' },
  { id: 'user-005', username: 'calmwaters', fullName: 'Priya Patel' },
  { id: 'user-006', username: 'morningstar', fullName: 'David Kim' },
  { id: 'user-007', username: 'steadypace', fullName: 'Angela Torres' },
  { id: 'user-008', username: 'brightpath', fullName: 'Marcus Johnson' },
  { id: 'user-009', username: 'hopefulday', fullName: 'Susan Martinez' },
  { id: 'user-010', username: 'gentlebreeze', fullName: 'Kevin Park' },
];

interface SurveyParticipantLinksProps {
  surveys: Survey[];
}

export default function SurveyParticipantLinks({ surveys }: SurveyParticipantLinksProps) {
  const [search, setSearch] = useState('');
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(surveys[0] || null);

  const filteredUsers = mockUsers.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const buildLink = (survey: Survey, username: string) =>
    `${survey.redcapUrl}&participant_code=${username}`;

  const handleCopy = (link: string, username: string) => {
    navigator.clipboard.writeText(link);
    toast.success(`Copied link for ${username}`);
  };

  const handleCopyAll = () => {
    if (!selectedSurvey) return;
    const all = filteredUsers.map(u => `${u.username}: ${buildLink(selectedSurvey, u.username)}`).join('\n');
    navigator.clipboard.writeText(all);
    toast.success(`Copied ${filteredUsers.length} participant links`);
  };

  if (surveys.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-card p-10 text-center">
        <Icon name="ClipboardDocumentListIcon" size={32} variant="outline" className="text-muted-foreground mx-auto mb-3" />
        <p className="text-[14px] font-600 text-foreground mb-1">No active surveys</p>
        <p className="text-[12px] text-muted-foreground">Activate a survey in the Survey Links tab to view participant links here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-info/5 border border-info/20 rounded-lg p-4 flex items-start gap-3">
        <Icon name="InformationCircleIcon" size={18} variant="outline" className="text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-600 text-foreground">Staff reference only</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            These personalized links are for verification. The app builds them automatically for each logged-in patient — patients never type their username manually.
          </p>
        </div>
      </div>

      {/* Survey selector + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">Survey</label>
          <select
            value={selectedSurvey?.id || ''}
            onChange={e => setSelectedSurvey(surveys.find(s => s.id === e.target.value) || null)}
            className="px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {surveys.map(s => (
              <option key={`survey-opt-${s.id}`} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">Search Patient</label>
          <div className="relative">
            <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by username or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-64"
            />
          </div>
        </div>
        <div className="mt-auto">
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
          >
            <Icon name="ClipboardDocumentIcon" size={14} variant="outline" />
            Copy All ({filteredUsers.length})
          </button>
        </div>
      </div>

      {/* Table */}
      {selectedSurvey && (
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-600 text-foreground">{selectedSurvey.title}</p>
              <p className="text-[11px] font-mono text-muted-foreground truncate max-w-[400px]">{selectedSurvey.redcapUrl}</p>
            </div>
            <span className="text-[12px] text-muted-foreground">{filteredUsers.length} participants</span>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Patient</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Username (Participant Code)</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Personalized Survey Link</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-20">Copy</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const link = buildLink(selectedSurvey, user.username);
                  return (
                    <tr key={`plink-${user.id}-${selectedSurvey.id}`} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors duration-100">
                      <td className="px-5 py-3">
                        <p className="text-[13px] font-500 text-foreground">{user.fullName}</p>
                      </td>
                      <td className="px-5 py-3">
                        <code className="text-[12px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{user.username}</code>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-[11px] font-mono text-muted-foreground truncate max-w-[320px]" title={link}>{link}</p>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleCopy(link, user.username)}
                          title={`Copy personalized link for ${user.username}`}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-lg text-[11px] font-500 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-100"
                        >
                          <Icon name="ClipboardDocumentIcon" size={12} variant="outline" />
                          Copy
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}