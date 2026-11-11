'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { AI_NOTICE } from '@/lib/agent-consent';
import { TERMS_URL } from '@/lib/agent-fixed-replies';
import { inApp, openExternal } from '@/lib/agent-bridge';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/lib/languages';

interface Props {
  lang: Language;
  /** The picker changes the language of the whole chat, not only of this notice. */
  onLanguageChange: (lang: Language) => void;
  busy: boolean;
  /** Saving the answer failed. */
  failed: boolean;
  onAgree: () => void;
}

/** "Terms of Use": the phone's browser in the app, a new tab on the web. */
function TermsLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={TERMS_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!inApp()) return;
        e.preventDefault();
        openExternal(TERMS_URL);
      }}
      className="font-600 text-primary underline underline-offset-2"
    >
      {children}
    </a>
  );
}

/**
 * Shown over the chat before a patient first uses the AI assistant, and again when the notice
 * or the Terms of Use changes. It cannot be dismissed: the patient ticks "I understand and agree",
 * then presses Continue.
 *
 * It starts with the research team's disclaimer: word for word in English; translated in other
 * languages, with a line saying the English text is the official one.
 */
export default function AiNoticeDialog({ lang, onLanguageChange, busy, failed, onAgree }: Props) {
  const text = AI_NOTICE[lang];
  const english = AI_NOTICE.en;
  const [checked, setChecked] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkboxRef.current?.focus({ preventScroll: true });
  }, []);

  const [before, link, after] = text.disclaimer;
  const [enBefore, enLink, enAfter] = english.disclaimer;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-5" role="dialog" aria-modal="true" aria-labelledby="ai-notice-title">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md max-h-[calc(100dvh-2.5rem)] overflow-y-auto bg-card rounded-2xl shadow-modal px-5 pt-5 pb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon name="ShieldCheckIcon" size={22} variant="outline" />
          </div>
          <select
            value={lang}
            onChange={(e) => onLanguageChange(e.target.value as Language)}
            aria-label={text.language}
            className="h-9 max-w-[55%] ps-3 pe-8 rounded-full border border-border bg-card text-[13px] font-600 text-secondary-foreground"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l].native}
              </option>
            ))}
          </select>
        </div>

        <h2 id="ai-notice-title" className="text-[18px] font-700 leading-snug">
          {text.title}
        </h2>

        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3">
          <p className="text-[14.5px] leading-relaxed text-foreground">
            {before}
            {link && <TermsLink>{link}</TermsLink>}
            {after}
          </p>
          {lang !== 'en' && (
            <>
              <p className="mt-2 text-[12.5px] font-600 text-secondary-foreground">{text.officialNote}</p>
              <p dir="ltr" lang="en" className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground text-start">
                {enBefore}
                {enLink && <TermsLink>{enLink}</TermsLink>}
                {enAfter}
              </p>
            </>
          )}
        </div>

        <ul className="mt-4 space-y-3">
          {text.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-secondary-foreground">
              <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <label className="mt-5 flex items-center gap-3 rounded-xl border border-border px-3.5 py-3 cursor-pointer active:bg-muted">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="w-5 h-5 shrink-0 rounded border-border text-primary focus:ring-ring"
          />
          <span className="text-[15px] font-600 text-foreground">{text.agree}</span>
        </label>

        {failed && <p className="mt-3 text-[13px] text-danger">{text.saveError}</p>}

        <button
          type="button"
          onClick={onAgree}
          disabled={!checked || busy}
          className="mt-4 w-full h-12 rounded-xl bg-primary text-primary-foreground text-[15px] font-600 disabled:opacity-40"
        >
          {busy ? '…' : text.continue}
        </button>
      </div>
    </div>
  );
}
