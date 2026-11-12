'use client';

import React from 'react';
import { CHUNK_TARGET_RANGE, TOLERANCE_RANGE, type ChunkSettings } from '@/lib/knowledge';
import { staffText } from '@/lib/i18n/staff';
import { useStaffT } from '@/lib/i18n/staff/context';

/** Raw input values (strings) for the three chunk settings. */
export interface ChunkSettingsDraft {
  target: string;
  overlap: string;
  tolerance: string;
}

export const toDraft = (s: ChunkSettings): ChunkSettingsDraft => ({
  target: String(s.targetChars),
  overlap: String(s.overlapChars),
  tolerance: String(s.toleranceFactor),
});

/** Parse + validate; returns an error message or settings. */
export function fromDraft(d: ChunkSettingsDraft): ChunkSettings | string {
  const t = Number(d.target);
  const o = Number(d.overlap);
  const f = Number(d.tolerance);
  const E = staffText().kb.chunkFields;
  if (!Number.isInteger(t) || t < CHUNK_TARGET_RANGE.min || t > CHUNK_TARGET_RANGE.max) {
    return E.sizeInvalid(CHUNK_TARGET_RANGE.min, CHUNK_TARGET_RANGE.max);
  }
  if (!Number.isInteger(o) || o < 0 || o > Math.floor(t / 2)) return E.overlapInvalid;
  if (!Number.isInteger(f) || f < TOLERANCE_RANGE.min || f > TOLERANCE_RANGE.max) {
    return E.toleranceInvalid(TOLERANCE_RANGE.min, TOLERANCE_RANGE.max);
  }
  return { targetChars: t, overlapChars: o, toleranceFactor: f };
}

const inputClass =
  'mt-1 w-full px-3 py-2 border border-border rounded-lg text-[13px] bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
// One line each, so the three inputs line up.
const labelClass = 'block text-[11px] font-600 text-muted-foreground uppercase tracking-wider whitespace-nowrap truncate';
const hintClass = 'block text-[11px] text-muted-foreground mt-1 whitespace-nowrap truncate';

export default function ChunkSettingsFields({
  value,
  onChange,
  disabled = false,
}: {
  value: ChunkSettingsDraft;
  onChange: (next: ChunkSettingsDraft) => void;
  disabled?: boolean;
}) {
  const { t: text, locale } = useStaffT();
  const T = text.kb.chunkFields;
  const t = Number(value.target);
  const f = Number(value.tolerance);
  const tol = Number.isFinite(t) && Number.isFinite(f) ? Math.min(t * f, CHUNK_TARGET_RANGE.max) : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block min-w-0">
          <span className={labelClass}>{T.size}</span>
          <input
            type="number"
            min={CHUNK_TARGET_RANGE.min}
            max={CHUNK_TARGET_RANGE.max}
            step={128}
            value={value.target}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, target: e.target.value })}
            className={inputClass}
          />
          <span className={hintClass} title={T.sizeTitle}>{T.sizeHint}</span>
        </label>
        <label className="block min-w-0">
          <span className={labelClass}>{T.overlap}</span>
          <input
            type="number"
            min={0}
            step={16}
            value={value.overlap}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, overlap: e.target.value })}
            className={inputClass}
          />
          <span className={hintClass} title={T.overlapTitle}>{T.overlapHint}</span>
        </label>
        <label className="block min-w-0">
          <span className={labelClass}>{T.tolerance}</span>
          <input
            type="number"
            min={TOLERANCE_RANGE.min}
            max={TOLERANCE_RANGE.max}
            step={1}
            value={value.tolerance}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, tolerance: e.target.value })}
            className={inputClass}
          />
          <span className={hintClass}>
            {TOLERANCE_RANGE.min}–{TOLERANCE_RANGE.max}
            {tol ? T.upTo(tol.toLocaleString(locale)) : ''}
          </span>
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{T.help}</p>
    </div>
  );
}
