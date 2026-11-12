'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setCurrentStaffLang,
  STAFF_LANG_COOKIE,
  STAFF_LOCALES,
  STAFF_TEXT,
  type StaffLang,
  type StaffText,
} from './index';

interface StaffTextValue {
  lang: StaffLang;
  t: StaffText;
  /** For toLocaleString / toLocaleDateString: 'en-US' or 'es-US'. */
  locale: string;
  setLang: (lang: StaffLang) => void;
}

const StaffTextContext = createContext<StaffTextValue>({
  lang: 'en',
  t: STAFF_TEXT.en,
  locale: STAFF_LOCALES.en,
  setLang: () => {},
});

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Root layout: `initialLang` comes from the hh_staff_lang cookie, read on the server. */
export function StaffLangProvider({ initialLang, children }: { initialLang: StaffLang; children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<StaffLang>(initialLang);
  // Before the children render, so error messages from src/lib/* use the same language.
  setCurrentStaffLang(lang);

  const setLang = useCallback(
    (next: StaffLang) => {
      document.cookie = `${STAFF_LANG_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
      document.documentElement.lang = next;
      setCurrentStaffLang(next);
      setLangState(next);
      // Server components (page headings) read the cookie again.
      router.refresh();
    },
    [router]
  );

  const value = useMemo(() => ({ lang, t: STAFF_TEXT[lang], locale: STAFF_LOCALES[lang], setLang }), [lang, setLang]);
  return <StaffTextContext.Provider value={value}>{children}</StaffTextContext.Provider>;
}

/** Staff dashboard text in the chosen language: `const { t, locale } = useStaffT()`. */
export const useStaffT = () => useContext(StaffTextContext);
