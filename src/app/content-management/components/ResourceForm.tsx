'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Toggle from '@/components/ui/Toggle';
import { useSlideOverClose } from '@/components/ui/SlideOver';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_LIMITS,
  ResourceError,
  validateResource,
  type CommunityResource,
  type ResourceInput,
} from '@/lib/community-resources';
import { useStaffT } from '@/lib/i18n/staff/context';
import ResourceAiBadge from './ResourceAiBadge';

interface ResourceFormProps {
  item: CommunityResource | null;
  /** Saves to the database; throws on failure (the form then keeps the input). */
  onSave: (input: ResourceInput) => Promise<void>;
  /** Reports whether the form holds unsaved changes (the panel then asks before closing). */
  onDirtyChange?: (dirty: boolean) => void;
}

const EMPTY: ResourceInput = {
  name: '',
  category: '' as ResourceInput['category'],
  description: '',
  phone: '',
  textNumber: '',
  website: '',
  address: '',
  areaServed: '',
  isFree: null,
  eligibility: '',
  lastVerifiedOn: null,
  active: true,
  source: '',
};

const fromItem = (r: CommunityResource): ResourceInput => ({
  name: r.name,
  category: r.category,
  description: r.description,
  phone: r.phone,
  textNumber: r.textNumber,
  website: r.website,
  address: r.address,
  areaServed: r.areaServed,
  isFree: r.isFree,
  eligibility: r.eligibility,
  lastVerifiedOn: r.lastVerifiedOn,
  active: r.active,
  source: r.source,
});

const inputClass =
  'w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export default function ResourceForm({ item, onSave, onDirtyChange }: ResourceFormProps) {
  const { t, locale } = useStaffT();
  const T = t.resources.form;
  const requestClose = useSlideOverClose();
  const [values, setValues] = useState<ResourceInput>(item ? fromItem(item) : EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof ResourceInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const snapshot = JSON.stringify(values);
  const initial = useRef(snapshot);
  const dirty = snapshot !== initial.current;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const set = <K extends keyof ResourceInput>(key: K, value: ResourceInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problems = validateResource(values);
    setErrors(problems);
    if (Object.values(problems).some(Boolean)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(values);
    } catch (err) {
      setSaveError(err instanceof ResourceError ? err.message : T.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const label = (text: string, required = false) => (
    <label className="block text-[13px] font-500 text-foreground mb-1">
      {text}
      {required && <span className="text-danger"> *</span>}
    </label>
  );
  const error = (key: keyof ResourceInput) =>
    errors[key] ? <p className="text-[11px] text-danger mt-1">{errors[key]}</p> : null;
  const text = (key: 'phone' | 'textNumber' | 'areaServed' | 'source' | 'website', placeholder?: string) => (
    <input
      type={key === 'website' ? 'url' : 'text'}
      value={values[key]}
      onChange={(e) => set(key, e.target.value)}
      placeholder={placeholder}
      maxLength={RESOURCE_LIMITS[key]}
      className={inputClass}
    />
  );
  const area = (key: 'description' | 'address' | 'eligibility', rows: number, placeholder?: string) => (
    <textarea
      value={values[key]}
      onChange={(e) => set(key, e.target.value)}
      rows={rows}
      placeholder={placeholder}
      maxLength={RESOURCE_LIMITS[key]}
      className={`${inputClass} resize-y`}
    />
  );

  const checked = item?.aiFetchedAt
    ? new Date(item.aiFetchedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const websiteChanged = !!item && values.website.trim() !== item.website;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">{T.requiredSection}</h3>
        <div className="space-y-4">
          <div>
            {label(T.name, true)}
            <input
              type="text"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={T.namePlaceholder}
              maxLength={RESOURCE_LIMITS.name}
              className={inputClass}
              autoFocus={!item}
            />
            {error('name')}
          </div>
          <div>
            {label(T.category, true)}
            <div className="relative">
              <select
                value={values.category}
                onChange={(e) => set('category', e.target.value as ResourceInput['category'])}
                className={`${inputClass} appearance-none pr-9 cursor-pointer`}
              >
                <option value="">{T.chooseCategory}</option>
                {RESOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t.resources.categories[c]}
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
            {error('category')}
          </div>
        </div>
      </div>

      <hr className="border-border" />

      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">{T.optionalSection}</h3>
        <div className="space-y-4">
          <div>
            {label(T.description)}
            <p className="text-[11px] text-muted-foreground mb-1">{T.descriptionHint}</p>
            {area('description', 3)}
            {error('description')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              {label(T.phone)}
              {text('phone', T.phonePlaceholder)}
              {error('phone')}
            </div>
            <div>
              {label(T.textNumber)}
              {text('textNumber', T.textNumberPlaceholder)}
              {error('textNumber')}
            </div>
          </div>
          <div>
            {label(T.website)}
            <p className="text-[11px] text-muted-foreground mb-1">{T.websiteHint}</p>
            {text('website', 'https://')}
            {error('website')}
          </div>
          <div>
            {label(T.address)}
            {area('address', 2)}
            {error('address')}
          </div>
          <div>
            {label(T.areaServed)}
            {text('areaServed', T.areaServedPlaceholder)}
            {error('areaServed')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              {label(T.isFree)}
              <div className="relative">
                <select
                  value={values.isFree === null ? '' : values.isFree ? 'yes' : 'no'}
                  onChange={(e) => set('isFree', e.target.value === '' ? null : e.target.value === 'yes')}
                  className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                >
                  <option value="">{T.freeUnknown}</option>
                  <option value="yes">{T.freeYes}</option>
                  <option value="no">{T.freeNo}</option>
                </select>
                <Icon
                  name="ChevronDownIcon"
                  size={16}
                  variant="outline"
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
                />
              </div>
            </div>
            <div>
              {label(T.lastVerified)}
              <input
                type="date"
                value={values.lastVerifiedOn ?? ''}
                onChange={(e) => set('lastVerifiedOn', e.target.value || null)}
                className={inputClass}
              />
              {errors.lastVerifiedOn ? error('lastVerifiedOn') : <p className="text-[11px] text-muted-foreground mt-1">{T.lastVerifiedHint}</p>}
            </div>
          </div>
          <div>
            {label(T.eligibility)}
            {area('eligibility', 2, T.eligibilityPlaceholder)}
            {error('eligibility')}
          </div>
          <div>
            {label(T.source)}
            {text('source', T.sourcePlaceholder)}
            {error('source')}
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border">
            <div>
              <p className="text-[13px] font-600 text-foreground">{T.active}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{T.activeHint}</p>
            </div>
            <Toggle checked={values.active} onChange={(v) => set('active', v)} />
          </div>
        </div>
      </div>

      {item && (
        <>
          <hr className="border-border" />
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider">{T.aiSection}</h3>
              <ResourceAiBadge resource={item} />
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              {T.aiReadOnly}
              {checked ? ` ${T.aiChecked(checked)}.` : ''}
            </p>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-[13px] text-foreground">
              {websiteChanged ? (
                <span className="text-warning">{T.aiWebsiteChanged}</span>
              ) : item.aiStatus === 'ok' ? (
                item.aiSummary || <span className="text-muted-foreground">{T.aiEmpty}</span>
              ) : (
                <span className="text-muted-foreground">{T.aiNone}</span>
              )}
            </div>
          </div>
        </>
      )}

      {saveError && <div className="p-3 rounded-lg border border-danger/30 bg-danger/5 text-[13px] text-danger">{saveError}</div>}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => requestClose?.()}
          className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
        >
          {T.cancel}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60 min-w-[120px] justify-center"
        >
          {saving ? (
            <>
              <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />
              {T.saving}
            </>
          ) : item ? (
            T.save
          ) : (
            T.create
          )}
        </button>
      </div>
    </form>
  );
}
