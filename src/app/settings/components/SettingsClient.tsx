'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { fetchProfiles } from '@/lib/chat';
import { LANGUAGES, LANGUAGE_NAMES, type Language } from '@/lib/languages';
import {
  SettingsError,
  getMessageLanguages,
  saveMessageLanguages,
  type MessageLanguagesSetting,
} from '@/lib/app-settings';
import { SETTINGS_TEXT as T } from '../text';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The stored order: the chosen language first, then the rest in the usual order. */
const ordered = (checked: ReadonlySet<Language>, primary: Language): Language[] => [
  primary,
  ...LANGUAGES.filter((l) => checked.has(l) && l !== primary),
];

/** Staff settings. For now: the languages the research team reads in patient messages. */
export default function SettingsClient() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const [saved, setSaved] = useState<MessageLanguagesSetting | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<Language>>(new Set());
  const [primary, setPrimary] = useState<Language | null>(null);
  const [savedByName, setSavedByName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback(
    async (s: MessageLanguagesSetting) => {
      setSaved(s);
      setChecked(new Set(s.languages));
      setPrimary(s.languages[0]);
      setSavedByName(null);
      if (s.updatedBy) {
        const [p] = await fetchProfiles(supabase, [s.updatedBy]).catch(() => []);
        setSavedByName(p ? p.fullName || (p.username ? `@${p.username}` : null) : null);
      }
    },
    [supabase]
  );

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      await apply(await getMessageLanguages(supabase));
    } catch (e) {
      setLoadError(e instanceof SettingsError ? e.message : T.loadError);
    }
  }, [supabase, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (lang: Language) => {
    const next = new Set(checked);
    if (next.has(lang)) next.delete(lang);
    else next.add(lang);
    setChecked(next);
    // Keep the AI-draft language among the checked ones.
    if (!primary || !next.has(primary)) setPrimary(LANGUAGES.find((l) => next.has(l)) ?? null);
  };

  const current = primary && checked.size > 0 ? ordered(checked, primary) : [];
  const dirty = !!saved && JSON.stringify(current) !== JSON.stringify(saved.languages);

  const save = async () => {
    if (!user || current.length === 0) return;
    setSaving(true);
    try {
      await apply(await saveMessageLanguages(supabase, current, user.id));
      toast.success(T.saved);
    } catch (e) {
      toast.error(e instanceof SettingsError ? e.message : T.saveError);
    } finally {
      setSaving(false);
    }
  };

  const L = T.languages;
  return (
    <section className="bg-card rounded-xl border border-border shadow-card max-w-3xl">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon name="LanguageIcon" size={18} variant="outline" className="text-primary" />
        </div>
        <div>
          <h2 className="text-[15px] font-600 text-foreground">{L.title}</h2>
          <p className="text-[12.5px] text-secondary-foreground mt-1">{L.body}</p>
          <p className="text-[12.5px] text-secondary-foreground mt-1.5">{L.aiBody}</p>
          <p className="text-[12px] text-muted-foreground mt-1.5">{L.note}</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {loadError ? (
          <div className="text-center py-6">
            <p className="text-[13px] text-danger mb-3">{loadError}</p>
            <button onClick={() => void load()} className="text-[13px] font-600 text-primary hover:underline">
              {T.retry}
            </button>
          </div>
        ) : !saved ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-64" />
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="text-[12px] font-600 text-foreground mb-2">{L.checkboxesLabel}</legend>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {LANGUAGES.map((lang) => {
                  const on = checked.has(lang);
                  const name = LANGUAGE_NAMES[lang];
                  return (
                    <label
                      key={lang}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer select-none transition-colors ${
                        on ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(lang)}
                        className="rounded border-border text-primary focus:ring-ring"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-500 text-foreground">{name.english}</span>
                        {name.native !== name.english && (
                          <span className="block text-[11.5px] text-muted-foreground" lang={lang} dir="auto">
                            {name.native}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {checked.size === 0 && <p className="text-[12px] text-danger mt-2">{L.atLeastOne}</p>}
            </fieldset>

            <div>
              <label htmlFor="ai-draft-language" className="block text-[12px] font-600 text-foreground mb-1">
                {L.primaryLabel}
              </label>
              <div className="relative w-64">
                <select
                  id="ai-draft-language"
                  value={primary ?? ''}
                  onChange={(e) => setPrimary(e.target.value as Language)}
                  disabled={checked.size === 0}
                  className="w-full appearance-none pl-3 pr-9 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  {LANGUAGES.filter((l) => checked.has(l)).map((l) => (
                    <option key={l} value={l}>
                      {LANGUAGE_NAMES[l].english}
                    </option>
                  ))}
                </select>
                <Icon
                  name="ChevronDownIcon"
                  size={16}
                  variant="outline"
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
              <p className="text-[11.5px] text-muted-foreground">
                {saved.updatedBy && saved.updatedAt
                  ? T.lastChanged(formatWhen(saved.updatedAt), savedByName || T.someone)
                  : T.notChangedYet}
              </p>
              <div className="flex items-center gap-2">
                {dirty && (
                  <button
                    onClick={() => void apply(saved)}
                    disabled={saving}
                    className="px-3 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
                  >
                    {T.reset}
                  </button>
                )}
                <button
                  onClick={() => void save()}
                  disabled={!dirty || saving || current.length === 0}
                  className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 disabled:opacity-50 min-w-[96px]"
                >
                  {saving ? T.saving : T.save}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
