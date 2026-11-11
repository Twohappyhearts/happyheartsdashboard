'use client';

import React, { createContext, useContext, useMemo } from 'react';
import type { Language } from '@/lib/languages';
import { PATIENT_TEXT, type PatientText } from './patient';

/**
 * The patient chat's language. /m/assistant provides it; components shared with the dashboard's
 * staff preview (AiMessageParts) get English when there is no provider.
 */
const PatientTextContext = createContext<{ lang: Language; t: PatientText }>({ lang: 'en', t: PATIENT_TEXT.en });

export function PatientTextProvider({ lang, children }: { lang: Language; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: PATIENT_TEXT[lang] }), [lang]);
  return <PatientTextContext.Provider value={value}>{children}</PatientTextContext.Provider>;
}

export const usePatientText = () => useContext(PatientTextContext);
