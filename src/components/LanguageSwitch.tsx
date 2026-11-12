'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { useStaffT } from '@/lib/i18n/staff/context';
import { STAFF_LANGS, STAFF_LANG_NAMES } from '@/lib/i18n/staff';

/** English / Español switch for the staff dashboard (stored in the hh_staff_lang cookie). */
export default function LanguageSwitch() {
  const { t, lang, setLang } = useStaffT();
  return (
    <div
      role="group"
      aria-label={t.language.label}
      title={lang === 'es' ? t.language.note : t.language.label}
      className="flex items-center gap-0.5 p-0.5 bg-muted rounded-lg w-fit"
    >
      <Icon name="LanguageIcon" size={15} variant="outline" className="text-muted-foreground mx-1" />
      {STAFF_LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => lang !== l && setLang(l)}
          className={`px-2 py-1 rounded-md text-[12px] font-600 transition-colors duration-150 ${
            lang === l ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {STAFF_LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
