'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { createClient } from '@/lib/supabase/client';
import { AI_NOTICE, AI_NOTICE_VERSION, consentIsCurrent, getCurrentTermsVersion, listConsents } from '@/lib/agent-consent';
import { TERMS_URL } from '@/lib/agent-fixed-replies';
import { LANGUAGE_NAMES, LANGUAGES, dirOf, type Language } from '@/lib/languages';
import { downloadCsv, todayStamp } from '@/lib/analytics';
import { listUsers } from '@/lib/users';
import { useStaffT } from '@/lib/i18n/staff/context';

/** current: accepted this notice and Terms of Use; outdated: accepted an older one, asked again; none: never accepted. */
type Status = 'current' | 'outdated' | 'none';

interface Row {
  id: string;
  username: string;
  fullName: string;
  displayId: string;
  status: Status;
  /** The latest acceptance, even an outdated one. */
  version: number | null;
  termsVersion: number | null;
  agreedAt: string | null;
}

type Filter = 'all' | Status;

/** For the CSV export, which stays in English (column names and values that analysis scripts read). */
const CSV_STATUS: Record<Status, string> = { current: 'Accepted', outdated: 'Must accept again', none: 'Not yet' };
const STATUS_BADGE: Record<Status, 'active' | 'warning' | 'inactive'> = { current: 'active', outdated: 'warning', none: 'inactive' };
const STATUS_ORDER: Record<Status, number> = { current: 0, outdated: 1, none: 2 };

const formatDate = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Which active patients accepted the notice shown before they use the AI assistant, and which version. */
export default function NoticeAcceptance() {
  const supabase = useMemo(() => createClient(), []);
  const { t, lang, locale } = useStaffT();
  const T = t.aiNotice;
  const STATUS_LABEL = T.status;
  const versionLabel = (r: Pick<Row, 'version' | 'termsVersion'>) => (r.version == null ? '—' : T.versionLabel(r.version, r.termsVersion));
  const [rows, setRows] = useState<Row[]>([]);
  const [termsVersion, setTermsVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [showNotice, setShowNotice] = useState(false);
  const [previewLang, setPreviewLang] = useState<Language>('es');

  const load = useCallback(async () => {
    try {
      const [users, consents, terms] = await Promise.all([listUsers(supabase), listConsents(supabase), getCurrentTermsVersion(supabase)]);
      const byUser = new Map(consents.map((c) => [c.userId, c]));
      setTermsVersion(terms);
      setRows(
        users
          .filter((u) => u.role === 'patient' && u.active)
          .map((u): Row => {
            const c = byUser.get(u.id);
            // An older notice or Terms of Use does not count: the app asks again.
            const status: Status = !c ? 'none' : consentIsCurrent(c, terms) ? 'current' : 'outdated';
            return {
              id: u.id,
              username: u.username,
              fullName: u.fullName,
              displayId: u.displayId,
              status,
              version: c?.version ?? null,
              termsVersion: c?.termsVersion ?? null,
              agreedAt: c?.agreedAt ?? null,
            };
          })
          .sort(
            (a, b) =>
              STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
              (b.agreedAt ?? '').localeCompare(a.agreedAt ?? '') ||
              a.username.localeCompare(b.username),
          ),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : T.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.length;
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const currentCount = count('current');
  const outdatedCount = count('outdated');
  const noneCount = count('none');
  const percent = total ? Math.round((currentCount / total) * 100) : 0;
  const visible = rows.filter((r) => filter === 'all' || r.status === filter);

  const exportCsv = () =>
    downloadCsv(
      `ai-notice-${todayStamp()}.csv`,
      ['Username', 'Name', 'Participant ID', 'Status', 'Notice version', 'Terms of Use version', 'Accepted at'],
      rows.map((r) => [
        r.username,
        r.fullName,
        r.displayId,
        CSV_STATUS[r.status],
        r.version == null ? '' : String(r.version),
        r.termsVersion == null ? '' : String(r.termsVersion),
        r.agreedAt ?? '',
      ]),
    );

  const stats = [
    { label: T.stats.accepted, value: currentCount, hint: T.stats.acceptedHint(percent), icon: 'CheckCircleIcon', tone: 'text-success bg-success/10' },
    {
      label: T.stats.again,
      value: outdatedCount,
      hint: T.stats.againHint,
      icon: 'ArrowPathIcon',
      tone: 'text-warning bg-warning/10',
    },
    { label: T.stats.notYet, value: noneCount, hint: T.stats.notYetHint, icon: 'ClockIcon', tone: 'text-muted-foreground bg-muted' },
    { label: T.stats.patients, value: total, hint: T.stats.patientsHint, icon: 'UsersIcon', tone: 'text-primary bg-primary/10' },
  ];

  const renderNotice = (lang: Language) => {
    const n = AI_NOTICE[lang];
    const [before, link, after] = n.disclaimer;
    return (
      <div lang={lang} dir={dirOf(lang)}>
        <p className="text-[13px] font-600 text-foreground mb-1.5">{n.title}</p>
        <p className="text-[12.5px] text-foreground mb-1.5 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1.5">
          {before}
          <span className="text-primary underline">{link}</span>
          {after}
          {n.officialNote && <span className="block mt-1 text-muted-foreground">{n.officialNote}</span>}
        </p>
        <ul className="list-disc ps-4 space-y-1 text-[12.5px] text-secondary-foreground">
          {n.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-1.5 text-[12px] text-secondary-foreground">
          ☐ {n.agree} → [{n.continue}]
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] text-secondary-foreground max-w-2xl">
          {T.introBefore}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {T.termsOfUse}
          </a>
          {T.introAfter(AI_NOTICE[lang].agree, AI_NOTICE[lang].continue)}
        </p>
        <button
          onClick={exportCsv}
          disabled={loading || !!error || total === 0}
          className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-[13px] font-600 text-foreground hover:bg-muted disabled:opacity-50 whitespace-nowrap"
        >
          <Icon name="ArrowDownTrayIcon" size={16} variant="outline" />
          {T.exportCsv}
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-card">
        <button
          onClick={() => setShowNotice(!showNotice)}
          aria-expanded={showNotice}
          className="w-full flex items-center gap-2 px-5 py-3 text-left text-[13px] font-600 text-foreground"
        >
          <Icon name="DocumentTextIcon" size={16} variant="outline" className="text-muted-foreground" />
          <span className="flex-1">{T.noticeHeading(AI_NOTICE_VERSION, termsVersion)}</span>
          <Icon name={showNotice ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={14} variant="outline" className="text-muted-foreground" />
        </button>
        {showNotice && (
          <div className="grid md:grid-cols-2 gap-5 px-5 pb-5 border-t border-border pt-4">
            <div>
              <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{T.englishOfficial}</p>
              {renderNotice('en')}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{T.translation}</p>
                <Select
                  variant="compact"
                  value={previewLang}
                  onValueChange={(v) => setPreviewLang(v as Language)}
                  aria-label={T.language}
                  options={LANGUAGES.filter((l) => l !== 'en').map((l) => ({
                    value: l,
                    label: `${t.languageNames[l]} · ${LANGUAGE_NAMES[l].native}`,
                  }))}
                />
                <span className="text-[11px] text-muted-foreground">{T.machineTranslation}</span>
              </div>
              {renderNotice(previewLang)}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[320px] w-full" />
      ) : error ? (
        <div className="bg-card rounded-xl border border-border shadow-card">
          <EmptyState
            icon="ExclamationTriangleIcon"
            title={T.loadFailedTitle}
            description={error}
            action={{
              label: T.retry,
              onClick: () => {
                setLoading(true);
                void load();
              },
            }}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
              <span className="font-600 text-foreground">{T.progressTitle}</span>
              <span className="text-muted-foreground tabular-nums">{T.progressCount(currentCount, total, percent)}</span>
            </div>
            <div
              className="h-2 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={T.progressLabel}
            >
              <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { key: 'all', label: T.all, count: total },
                { key: 'current', label: STATUS_LABEL.current, count: currentCount },
                { key: 'outdated', label: STATUS_LABEL.outdated, count: outdatedCount },
                { key: 'none', label: STATUS_LABEL.none, count: noneCount },
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
                title={total === 0 ? T.emptyNoneTitle : T.emptyFilterTitle}
                description={total === 0 ? T.emptyNoneBody : T.emptyFilterBody}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3">{T.columns.patient}</th>
                      <th className="px-5 py-3">{T.columns.participantId}</th>
                      <th className="px-5 py-3">{T.columns.notice}</th>
                      <th className="px-5 py-3">{T.columns.version}</th>
                      <th className="px-5 py-3">{T.columns.acceptedOn}</th>
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
                          <Badge variant={STATUS_BADGE[r.status]} label={STATUS_LABEL[r.status]} size="sm" />
                        </td>
                        <td className="px-5 py-3 text-secondary-foreground tabular-nums whitespace-nowrap">{versionLabel(r)}</td>
                        <td className="px-5 py-3 text-secondary-foreground tabular-nums">{r.agreedAt ? formatDate(r.agreedAt, locale) : '—'}</td>
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
