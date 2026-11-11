'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { AI_NOTICE, type NoticeLanguage } from '@/lib/agent-consent';

interface Props {
  busy: boolean;
  error: string | null;
  onAgree: () => void;
}

/**
 * Shown over the chat the first time a patient opens the AI assistant. It cannot be
 * dismissed: the chat stays covered until the patient presses "I understand and agree".
 */
export default function AiNoticeDialog({ busy, error, onAgree }: Props) {
  const [language, setLanguage] = useState<NoticeLanguage>('en');
  const agreeRef = useRef<HTMLButtonElement>(null);
  const text = AI_NOTICE[language];

  // Spanish phones start in Spanish.
  useEffect(() => {
    if (navigator.language?.toLowerCase().startsWith('es')) setLanguage('es');
    agreeRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-5" role="dialog" aria-modal="true" aria-labelledby="ai-notice-title">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md max-h-[calc(100dvh-2.5rem)] overflow-y-auto bg-card rounded-2xl shadow-modal px-5 pt-5 pb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon name="ShieldCheckIcon" size={22} variant="outline" />
          </div>
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
            className="h-9 px-3 rounded-full border border-border text-[13px] font-600 text-secondary-foreground active:bg-muted"
          >
            {text.switchTo}
          </button>
        </div>
        <h2 id="ai-notice-title" className="text-[18px] font-700 leading-snug">
          {text.title}
        </h2>
        <ul className="mt-3 space-y-3">
          {text.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-secondary-foreground">
              <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        <button
          ref={agreeRef}
          type="button"
          onClick={onAgree}
          disabled={busy}
          className="mt-5 w-full h-12 rounded-xl bg-primary text-primary-foreground text-[15px] font-600 disabled:opacity-60"
        >
          {busy ? '…' : text.agree}
        </button>
      </div>
    </div>
  );
}
