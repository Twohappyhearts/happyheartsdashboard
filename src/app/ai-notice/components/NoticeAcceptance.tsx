'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { createClient } from '@/lib/supabase/client';
import { AI_NOTICE, AI_NOTICE_VERSION, listConsents } from '@/lib/agent-consent';
import { downloadCsv, todayStamp } from '@/lib/analytics';
import { listUsers } from '@/lib/users';

interface Row {
  id: string;
  username: string;
  fullName: string;
  displayId: string;
  agreedAt: string | null;
}

type Filter = 'all' | 'agreed' | 'pending';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Which active patients accepted the notice shown when they first open the AI assistant. */
export default function NoticeAcceptance() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [showNotice, setShowNotice] = useState(false);

  const load = useCallback(async () => {
    try {
      const [users, consents] = await Promise.all([listUsers(supabase), listConsents(supabase)]);
      // An older version of the notice does not count: the app asks again.
      const agreed = new Map(consents.filter((c) => c.version >= AI_NOTICE_VERSION).map((c) => [c.userId, c.agreedAt]));
      setRows(
        users
          .filter((u) => u.role === 'patient' && u.active)
          .map((u) => ({ id: u.id, username: u.username, fullName: u.fullName, displayId: u.displayId, agreedAt: agreed.get(u.id) ?? null }))
          .sort((a, b) => (b.agreedAt ?? '').localeCompare(a.agreedAt ?? '') || a.username.localeCompare(b.username)),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the AI notice records.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.length;
  const agreedCount = rows.filter((r) => r.agreedAt).length;
  const pendingCount = total - agreedCount;
  const percent = total ? Math.round((agreedCount / total) * 100) : 0;
  const visible = rows.filter((r) => (filter === 'all' ? true : filter === 'agreed' ? !!r.agreedAt : !r.agreedAt));

  const exportCsv = () =>
    downloadCsv(
      `ai-notice-${todayStamp()}.csv`,
      ['Username', 'Name', 'Participant ID', 'Accepted', 'Accepted at'],
      rows.map((r) => [r.username, r.fullName, r.displayId, r.agreedAt ? 'Yes' : 'No', r.agreedAt ?? '']),
    );

  const stats = [
    { label: 'Accepted', value: agreedCount, hint: `${percent}% of active patients`, icon: 'CheckCircleIcon', tone: 'text-success bg-success/10' },
    { label: 'Not yet', value: pendingCount, hint: 'Have not opened the AI assistant yet, or left without accepting', icon: 'ClockIcon', tone: 'text-warning bg-warning/10' },
    { label: 'Active patients', value: total, hint: 'Disabled accounts are not counted', icon: 'UsersIcon', tone: 'text-primary bg-primary/10' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] text-secondary-foreground max-w-2xl">
          The first time a patient opens the AI assistant in the app, a notice explains that its answers are for reference only.
          The patient cannot chat until they press “{AI_NOTICE.en.agree}”.
        </p>
        <button
          onClick={exportCsv}
          disabled={loading || !!error || total === 0}
          className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-[13px] font-600 text-foreground hover:bg-muted disabled:opacity-50 whitespace-nowrap"
        >
          <Icon name="ArrowDownTrayIcon" size={16} variant="outline" />
          Export CSV
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-card">
        <button
          onClick={() => setShowNotice(!showNotice)}
          aria-expanded={showNotice}
          className="w-full flex items-center gap-2 px-5 py-3 text-left text-[13px] font-600 text-foreground"
        >
          <Icon name="DocumentTextIcon" size={16} variant="outline" className="text-muted-foreground" />
          <span className="flex-1">The notice patients see (version {AI_NOTICE_VERSION})</span>
          <Icon name={showNotice ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={14} variant="outline" className="text-muted-foreground" />
        </button>
        {showNotice && (
          <div className="grid md:grid-cols-2 gap-5 px-5 pb-5 border-t border-border pt-4">
            {(['en', 'es'] as const).map((lang) => (
              <div key={lang}>
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{lang === 'en' ? 'English' : 'Spanish'}</p>
                <p className="text-[13px] font-600 text-foreground mb-1.5">{AI_NOTICE[lang].title}</p>
                <ul className="list-disc pl-4 space-y-1 text-[12.5px] text-secondary-foreground">
                  {AI_NOTICE[lang].points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[320px] w-full" />
      ) : error ? (
        <div className="bg-card rounded-xl border border-border shadow-card">
          <EmptyState
            icon="ExclamationTriangleIcon"
            title="Could not load the records"
            description={error}
            action={{
              label: 'Retry',
              onClick: () => {
                setLoading(true);
                void load();
              },
            }}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-card rounded-xl border border-border shadow-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-500 text-muted-foreground">{s.label}</p>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.tone}`}>
                    <Icon name={s.icon} size={16} variant="outline" />
                  </span>
                </div>
                <p className="text-[26px] font-700 text-foreground tabular-nums leading-tight mt-1">{s.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</p>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-xl border border-border shadow-card p-4">
            <div className="flex items-center justify-between text-[12px] mb-1.5">
              <span className="font-600 text-foreground">Accepted the notice</span>
              <span className="text-muted-foreground tabular-nums">
                {agreedCount} of {total} ({percent}%)
              </span>
            </div>
            <div
              className="h-2 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Patients who accepted the AI notice"
            >
              <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { key: 'all', label: 'All', count: total },
                { key: 'agreed', label: 'Accepted', count: agreedCount },
                { key: 'pending', label: 'Not yet', count: pendingCount },
              ] as { key: Filter; label: string; count: number }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-full text-[12px] font-600 border transition-colors duration-150 ${
                  filter === f.key ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {f.label} <span className="opacity-70">({f.count})</span>
              </button>
            ))}
          </div>

          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            {visible.length === 0 ? (
              <EmptyState
                icon="UsersIcon"
                title={total === 0 ? 'No active patients yet' : 'No patients here'}
                description={total === 0 ? 'Patients appear here once their accounts are created.' : 'No patient matches this filter.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3">Patient</th>
                      <th className="px-5 py-3">Participant ID</th>
                      <th className="px-5 py-3">AI notice</th>
                      <th className="px-5 py-3">Accepted on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-5 py-3">
                          <p className="font-600 text-foreground">{r.username}</p>
                          {r.fullName && <p className="text-[11.5px] text-muted-foreground">{r.fullName}</p>}
                        </td>
                        <td className="px-5 py-3 font-mono text-[12px] text-secondary-foreground">{r.displayId || '—'}</td>
                        <td className="px-5 py-3">
                          <Badge variant={r.agreedAt ? 'active' : 'inactive'} label={r.agreedAt ? 'Accepted' : 'Not yet'} size="sm" />
                        </td>
                        <td className="px-5 py-3 text-secondary-foreground tabular-nums">{r.agreedAt ? formatDate(r.agreedAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
