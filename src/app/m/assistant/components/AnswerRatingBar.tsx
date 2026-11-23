'use client';

import React, { useState } from 'react';
import { AgentChatError, saveAnswerRating, type AgentAuth, type AnswerRating } from '@/lib/agent-chat';

const TOP_USABILITY = 5;
const TOP_SAFETY = 3;
const MAX_COMMENT = 300;

/** What each Safety score means, as in the trial guide. */
const SAFETY_NAMES: Record<number, string> = { 1: 'Unsafe', 2: 'Concern', 3: 'Safe' };

function ScoreRow({
  label,
  max,
  value,
  onPick,
  names,
}: {
  label: string;
  max: number;
  value: number | null;
  onPick: (n: number) => void;
  names?: Record<number, string>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[62px] shrink-0 text-[12px] text-muted-foreground">{label}</span>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          aria-label={`${label} ${n} of ${max}${names?.[n] ? ` (${names[n]})` : ''}`}
          aria-pressed={value === n}
          className={`w-8 h-8 rounded-lg border text-[13px] font-600 ${
            value === n
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border bg-card active:bg-muted'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

interface Props {
  messageId: string;
  rating: AnswerRating | null;
  /** The app's Bearer token getter (ratings are shown in the app only). */
  auth: AgentAuth;
  onSaved: (rating: AnswerRating) => void;
}

/** Trial only: usability and safety scores under an AI answer. Anything below the top score opens the feedback box. */
export default function AnswerRatingBar({ messageId, rating, auth, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [usability, setUsability] = useState<number | null>(null);
  const [safety, setSafety] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [boxOpen, setBoxOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (u: number, s: number, text: string) => {
    setSaving(true);
    setError(null);
    const next: AnswerRating = { messageId, usability: u, safety: s, comment: text.trim() };
    try {
      await saveAnswerRating(next, auth);
      onSaved(next);
      setBoxOpen(false);
      setEditing(false);
    } catch (e) {
      setError(e instanceof AgentChatError ? e.message : 'Could not save your rating.');
    } finally {
      setSaving(false);
    }
  };

  const pick = (u: number | null, s: number | null) => {
    setUsability(u);
    setSafety(s);
    if (u == null || s == null) return;
    if (u === TOP_USABILITY && s === TOP_SAFETY) void save(u, s, '');
    else setBoxOpen(true);
  };

  if (rating && !editing) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
        <span>
          Usability {rating.usability}/{TOP_USABILITY} · Safety {rating.safety}/{TOP_SAFETY} · Saved
        </span>
        <button
          onClick={() => {
            setUsability(rating.usability);
            setSafety(rating.safety);
            setComment(rating.comment);
            setEditing(true);
          }}
          className="underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        Rate this answer. Higher is better: Usability 5 = best; Safety 3 = safe, 2 = concern, 1 = unsafe.
      </p>
      <ScoreRow
        label="Usability"
        max={TOP_USABILITY}
        value={usability}
        onPick={(n) => pick(n, safety)}
      />
      <ScoreRow label="Safety" max={TOP_SAFETY} value={safety} onPick={(n) => pick(usability, n)} names={SAFETY_NAMES} />
      {saving && !boxOpen && <p className="text-[12px] text-muted-foreground">Saving…</p>}
      {error && !boxOpen && <p className="text-[12px] text-danger">{error}</p>}

      {boxOpen && (
        <div className="fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full bg-card rounded-t-2xl px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <p className="text-[16px] font-700">What could be better?</p>
            <p className="text-[12.5px] text-muted-foreground mb-3">
              Usability {usability}/{TOP_USABILITY} · Safety {safety}/{TOP_SAFETY}
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={MAX_COMMENT}
              rows={4}
              placeholder="Not fully satisfied but no major problem? You can leave this empty and tap Confirm."
              // 16px: iOS does not zoom into inputs at this size.
              className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[16px] leading-relaxed placeholder:text-muted-foreground"
            />
            <div className="flex justify-between text-[12px] text-muted-foreground mt-1 mb-4">
              <span className={error ? 'text-danger' : ''}>{error ?? ''}</span>
              <span>
                {comment.length}/{MAX_COMMENT}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setBoxOpen(false)}
                disabled={saving}
                className="flex-1 h-12 rounded-xl border border-border text-[15px] font-600 active:bg-muted"
              >
                Back
              </button>
              <button
                onClick={() => void save(usability as number, safety as number, comment)}
                disabled={saving}
                className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-[15px] font-600 active:opacity-90 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
