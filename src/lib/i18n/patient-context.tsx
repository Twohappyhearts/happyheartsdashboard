'use client';

import type { Language } from '@/lib/languages';
import { PATIENT_TEXT, type PatientText } from './patient';

/**
 * Patient chat texts for the dashboard's AI Chat preview (English). The app's native chat has
 * its own copy of these texts in all eight languages (generated from patient.ts).
 */
const ENGLISH = { lang: 'en' as Language, t: PATIENT_TEXT.en as PatientText };

export const usePatientText = () => ENGLISH;
