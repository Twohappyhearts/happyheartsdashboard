'use client';

import React from 'react';
import { hasCurrentSummary, type CommunityResource } from '@/lib/community-resources';
import { useStaffT } from '@/lib/i18n/staff/context';
import { translateServerMessage } from '@/lib/i18n/staff/server-messages';

/** The AI summary status of a resource; the summary or the error is in the tooltip. */
export default function ResourceAiBadge({ resource: r }: { resource: CommunityResource }) {
  const { t, lang } = useStaffT();
  const S = t.resources.aiStatus;
  let label: string;
  let tone: string;
  let tip = '';
  if (r.aiStatus === 'ok' && hasCurrentSummary(r)) {
    label = S.ok;
    tone = 'bg-success/10 text-success';
    tip = r.aiSummary;
  } else if (r.aiStatus === 'ok' && r.aiSourceUrl === r.website) {
    label = S.okEmpty;
    tone = 'bg-muted text-muted-foreground';
  } else if (r.aiStatus === 'failed') {
    label = S.failed;
    tone = 'bg-danger/10 text-danger';
    tip = translateServerMessage(r.aiError, lang);
  } else if (r.aiStatus === 'no_website' || !r.website) {
    label = S.no_website;
    tone = 'bg-muted text-muted-foreground';
  } else {
    label = S.pending;
    tone = 'bg-warning/10 text-warning';
  }
  return (
    <span title={tip || undefined} className={`inline-flex items-center rounded-full font-600 text-[11px] px-2 py-0.5 whitespace-nowrap ${tone}`}>
      {label}
    </span>
  );
}
