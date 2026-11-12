'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { displayName } from '@/contexts/AuthContext';
import { listUsers, type ManagedUser } from '@/lib/users';
import { completionsForSurvey, personalizedLink, type CompletionInfo } from '@/lib/surveys';
import type { Survey } from './SurveyManagementClient';
import { useStaffT } from '@/lib/i18n/staff/context';

interface SurveyParticipantLinksProps {
  surveys: Survey[];
}

export default function SurveyParticipantLinks({ surveys }: SurveyParticipantLinksProps) {
  const supabase = useMemo(() => createClient(), []);
  const { t, locale } = useStaffT();
  const T = t.surveys.participants;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(surveys[0]?.id ?? null);
  const [patients, setPatients] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [done, setDone] = useState<Map<string, CompletionInfo>>(new Map());

  const selectedSurvey = surveys.find(s => s.id === selectedId) ?? surveys[0] ?? null;

  // Every active patient account (the app builds the same link for them).
  useEffect(() => {
    let cancelled = false;
    listUsers(supabase)
      .then(list => {
        if (!cancelled) setPatients(list.filter(u => u.role === 'patient' && u.active));
      })
      .catch(e => {
        if (!cancelled) setUsersError(e instanceof Error ? e.message : T.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Completions recorded for the selected survey (via the REDCap redirect).
  useEffect(() => {
    if (!selectedSurvey) return;
    let cancelled = false;
    completionsForSurvey(supabase, selectedSurvey.id)
      .then(map => {
        if (!cancelled) setDone(map);
      })
      .catch(() => {
        if (!cancelled) setDone(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedSurvey]);

  const filteredUsers = patients.filter(u => {
    const q = search.toLowerCase();
    return u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q) || u.displayId.toLowerCase().includes(q);
  });

  const buildLink = (survey: Survey, username: string) => personalizedLink(survey.url, username);

  const handleCopy = (link: string, username: string) => {
    navigator.clipboard.writeText(link);
    toast.success(T.copiedFor(username));
  };

  const handleCopyAll = () => {
    if (!selectedSurvey) return;
    const all = filteredUsers.map(u => `${u.username}: ${buildLink(selectedSurvey, u.username)}`).join('\n');
    navigator.clipboard.writeText(all);
    toast.success(T.copiedAll(filteredUsers.length));
  };

  if (surveys.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-card p-10 text-center">
        <Icon name="ClipboardDocumentListIcon" size={32} variant="outline" className="text-muted-foreground mx-auto mb-3" />
        <p className="text-[14px] font-600 text-foreground mb-1">{T.noActive}</p>
        <p className="text-[12px] text-muted-foreground">{T.noActiveBody}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-info/5 border border-info/20 rounded-lg p-4 flex items-start gap-3">
        <Icon name="InformationCircleIcon" size={18} variant="outline" className="text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-600 text-foreground">{T.staffOnly}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">{T.staffOnlyBody}</p>
        </div>
      </div>

      {/* Survey selector + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">{T.survey}</label>
          <select
            value={selectedSurvey?.id || ''}
            onChange={e => setSelectedId(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {surveys.map(s => (
              <option key={`survey-opt-${s.id}`} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">{T.searchPatient}</label>
          <div className="relative">
            <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={T.searchPlaceholder}
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
            {T.copyAll(filteredUsers.length)}
          </button>
        </div>
      </div>

      {/* Table */}
      {selectedSurvey && (
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-600 text-foreground">{selectedSurvey.title}</p>
              <p className="text-[11px] font-mono text-muted-foreground truncate max-w-[400px]">{selectedSurvey.url}</p>
            </div>
            <span className="text-[12px] text-muted-foreground">{T.count(filteredUsers.length)}</span>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.patient}</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.username}</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.link}</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.completed}</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-20">{T.columns.copy}</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-4"><Skeleton className="h-16 w-full" /></td>
                  </tr>
                ) : usersError ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[12px] text-danger">{usersError}</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[12px] text-muted-foreground">
                      {patients.length === 0 ? T.noPatients : T.noMatch}
                    </td>
                  </tr>
                ) : filteredUsers.map(user => {
                  const link = buildLink(selectedSurvey, user.username);
                  const completion = done.get(user.id);
                  return (
                    <tr key={`plink-${user.id}-${selectedSurvey.id}`} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors duration-100">
                      <td className="px-5 py-3">
                        <p className="text-[13px] font-500 text-foreground">{displayName({ fullName: user.fullName, username: user.username })}</p>
                        {user.displayId && <p className="text-[11px] text-muted-foreground">{user.displayId}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <code className="text-[12px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{user.username}</code>
                      </td>
                      <td className="px-5 py-3">
                        {/* Full link, wrapped — the participant_code part is what differs per patient. */}
                        <p className="text-[11px] font-mono text-muted-foreground break-all max-w-[460px]" title={link}>
                          {link.slice(0, link.length - (`participant_code=${encodeURIComponent(user.username)}`).length)}
                          <wbr />
                          <span className="text-foreground font-600 bg-success/10 rounded px-0.5 whitespace-nowrap">
                            participant_code={encodeURIComponent(user.username)}
                          </span>
                        </p>
                      </td>
                      <td className="px-5 py-3 text-[12px] whitespace-nowrap">
                        {completion ? (
                          <span className="text-success font-500" title={T.completions(completion.count)}>
                            ✓ {new Date(completion.lastAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
                            {completion.count > 1 ? ` (×${completion.count})` : ''}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleCopy(link, user.username)}
                          title={T.copyFor(user.username)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-lg text-[11px] font-500 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-100"
                        >
                          <Icon name="ClipboardDocumentIcon" size={12} variant="outline" />
                          {T.copy}
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