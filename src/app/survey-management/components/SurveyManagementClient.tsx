'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';
import Toggle from '@/components/ui/Toggle';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';
import {
  CODE_RE,
  REDCAP_PREFIX,
  SURVEY_CATEGORIES,
  SURVEY_FREQUENCIES,
  SURVEY_PLACEMENTS,
  SurveyError,
  completionCounts,
  completionRedirect,
  createSurvey,
  deleteSurvey,
  listSurveys,
  setSurveyActive,
  placementLabel,
  updateSurvey,
  type SurveyInput,
  type SurveyLink,
  type SurveyPlacement,
} from '@/lib/surveys';
import SurveyParticipantLinks from './SurveyParticipantLinks';

export type Survey = SurveyLink;

type Tab = 'links' | 'participants';
type PlacementFilter = 'all' | SurveyPlacement;

const inputClass =
  'w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SurveyManagementClient() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<Tab>('links');
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [completions, setCompletions] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [placementFilter, setPlacementFilter] = useState<PlacementFilter>('all');

  const load = useCallback(async () => {
    try {
      const [list, counts] = await Promise.all([listSurveys(supabase), completionCounts(supabase).catch(() => new Map<string, number>())]);
      setSurveys(list);
      setCompletions(counts);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof SurveyError ? e.message : 'Could not load survey links.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
    watch,
  } = useForm<SurveyInput>();

  const redcapUrlVal = watch('url', '') ?? '';
  const isValidRedcapUrl = redcapUrlVal.startsWith(REDCAP_PREFIX) && redcapUrlVal.length > REDCAP_PREFIX.length;
  const codeVal = (watch('code', '') ?? '').toUpperCase();
  const placementVal = watch('placement');

  const handleOpenNew = () => {
    setEditingSurvey(null);
    reset({
      title: '',
      code: '',
      url: '',
      description: '',
      category: '',
      frequency: '',
      duration: '',
      placement: placementFilter === 'survey' ? 'survey' : 'resource',
      sortOrder: surveys.length + 1,
      active: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (survey: Survey) => {
    setEditingSurvey(survey);
    reset({
      title: survey.title,
      code: survey.code,
      url: survey.url,
      description: survey.description,
      category: survey.category,
      frequency: survey.frequency,
      duration: survey.duration,
      placement: survey.placement,
      sortOrder: survey.sortOrder,
      active: survey.active,
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: SurveyInput) => {
    setSaving(true);
    try {
      const input: SurveyInput = { ...data, code: editingSurvey ? editingSurvey.code : data.code.toUpperCase() };
      if (editingSurvey) {
        await updateSurvey(supabase, editingSurvey.id, input);
        toast.success('Survey updated — app will use the new link immediately');
      } else {
        await createSurvey(supabase, input);
        toast.success(
          input.active
            ? `Added to ${placementLabel(input.placement)} — now visible to active patients`
            : 'Survey added (hidden from the app)',
        );
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof SurveyError ? e.message : 'Could not save the survey.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteSurvey(supabase, id);
      setDeleteConfirmId(null);
      toast.success('Survey removed');
      await load();
    } catch (e) {
      toast.error(e instanceof SurveyError ? e.message : 'Could not delete the survey.');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (survey: Survey) => {
    const next = !survey.active;
    setSurveys(prev => prev.map(s => (s.id === survey.id ? { ...s, active: next } : s)));
    try {
      await setSurveyActive(supabase, survey.id, next);
      toast.success(next ? `“${survey.title}” is now visible in the app` : `“${survey.title}” is now hidden from the app`);
    } catch (e) {
      setSurveys(prev => prev.map(s => (s.id === survey.id ? { ...s, active: survey.active } : s)));
      toast.error(e instanceof SurveyError ? e.message : 'Could not change visibility.');
    }
  };

  const activeVal = watch('active');
  const visibleSurveys = placementFilter === 'all' ? surveys : surveys.filter((s) => s.placement === placementFilter);

  const copy = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">Survey Management</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage REDCap links shown in the app’s Resources tab and Holistic Assessments menu, and view per-participant personalized URLs.
          </p>
        </div>
        {activeTab === 'links' && (
          <button
            onClick={handleOpenNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap"
          >
            <Icon name="PlusIcon" size={16} variant="outline" />
            Add Survey Link
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {([
          { key: 'links', label: 'Survey Links' },
          { key: 'participants', label: 'Participant Links' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={`tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`
              px-4 py-1.5 rounded-md text-[13px] font-600 transition-all duration-150
              ${activeTab === tab.key ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'links' && !loading && !loadError && surveys.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-muted-foreground">Shown in app:</span>
          {([
            { key: 'all', label: 'All' },
            ...SURVEY_PLACEMENTS.map((p) => ({ key: p.value, label: p.label })),
          ] as { key: PlacementFilter; label: string }[]).map((f) => {
            const count = f.key === 'all' ? surveys.length : surveys.filter((s) => s.placement === f.key).length;
            return (
              <button
                key={`pf-${f.key}`}
                onClick={() => setPlacementFilter(f.key)}
                className={`px-3 py-1 rounded-full text-[12px] font-600 border transition-colors duration-150 ${
                  placementFilter === f.key
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {f.label} <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {activeTab === 'links' ? (
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => <Skeleton key={`s-skel-${i}`} className="h-[132px] w-full" />)
          ) : loadError ? (
            <div className="bg-card rounded-xl border border-border shadow-card">
              <EmptyState icon="ExclamationTriangleIcon" title="Could not load surveys" description={loadError} action={{ label: 'Retry', onClick: () => { setLoading(true); load(); } }} />
            </div>
          ) : surveys.length === 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-card">
              <EmptyState
                icon="ClipboardDocumentListIcon"
                title="No surveys yet"
                description="Add REDCap survey links here. Each survey is shown to patients in the app, and their personalized link includes their username as the participant code."
                action={{ label: 'Add Survey Link', onClick: handleOpenNew }}
              />
            </div>
          ) : visibleSurveys.length === 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-card">
              <EmptyState
                icon="ClipboardDocumentListIcon"
                title={`Nothing in ${placementLabel(placementFilter as SurveyPlacement)} yet`}
                description="Add a link, or edit an existing one and change “Show in app”."
                action={{ label: 'Add Survey Link', onClick: handleOpenNew }}
              />
            </div>
          ) : (
            visibleSurveys.map((survey) => (
              <div
                key={survey.id}
                className="bg-card rounded-xl border border-border shadow-card p-5 hover:shadow-card-hover transition-shadow duration-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Icon name="ClipboardDocumentListIcon" size={18} variant="outline" className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="text-[14px] font-600 text-foreground">{survey.title}</h3>
                        <Badge variant={survey.active ? 'active' : 'inactive'} label={survey.active ? 'Active' : 'Inactive'} size="sm" />
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-600 px-1.5 py-0.5 rounded ${
                            survey.placement === 'survey' ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'
                          }`}
                          title={SURVEY_PLACEMENTS.find((p) => p.value === survey.placement)?.hint}
                        >
                          <Icon name={survey.placement === 'survey' ? 'ClipboardDocumentListIcon' : 'BookOpenIcon'} size={11} variant="outline" />
                          {placementLabel(survey.placement)}
                        </span>
                        <span className="text-[10px] text-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{survey.code}</span>
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                          Order {survey.sortOrder}
                        </span>
                      </div>
                      {survey.description && (
                        <p className="text-[12px] text-muted-foreground mb-2">{survey.description}</p>
                      )}
                      {(survey.category || survey.frequency || survey.duration) && (
                        <p className="text-[11px] text-muted-foreground mb-2">
                          {[survey.category, survey.frequency, survey.duration].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                        <Icon name="LinkIcon" size={12} variant="outline" className="text-muted-foreground shrink-0" />
                        <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">{survey.url}</span>
                        <button
                          onClick={() => copy(survey.url, 'REDCap URL copied')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100 shrink-0"
                          title="Copy REDCap URL"
                        >
                          <Icon name="ClipboardDocumentIcon" size={12} variant="outline" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-1.5 mt-1.5">
                        <Icon name="ArrowUturnLeftIcon" size={12} variant="outline" className="text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground shrink-0">REDCap completion redirect:</span>
                        <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">{completionRedirect(survey.code)}</span>
                        <button
                          onClick={() => copy(completionRedirect(survey.code), 'Completion redirect URL copied')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100 shrink-0"
                          title="Copy the URL to paste into REDCap > Survey Settings > Redirect to a URL"
                        >
                          <Icon name="ClipboardDocumentIcon" size={12} variant="outline" />
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Added {fmtDate(survey.createdAt)} · {completions.get(survey.id) ?? 0} completions recorded · App appends <code className="bg-muted px-1 rounded text-[10px]">&participant_code=username</code> automatically
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle checked={survey.active} onChange={() => handleToggleActive(survey)} />
                    <button
                      onClick={() => handleOpenEdit(survey)}
                      title="Edit survey"
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                    >
                      <Icon name="PencilIcon" size={15} variant="outline" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(survey.id)}
                      title="Delete survey — this cannot be undone"
                      className="p-2 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors duration-100"
                    >
                      <Icon name="TrashIcon" size={15} variant="outline" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <SurveyParticipantLinks surveys={surveys.filter(s => s.active)} />
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSurvey ? 'Edit Survey Link' : 'Add Survey Link'}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit(onSubmit)}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60 min-w-[120px] justify-center"
            >
              {saving ? (
                <>
                  <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />
                  Saving...
                </>
              ) : editingSurvey ? 'Save Changes' : 'Add Survey'}
            </button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-[13px] font-500 text-foreground mb-1">
                Survey Title <span className="text-danger">*</span>
              </label>
              <input
                {...register('title', {
                  required: 'Title is required',
                  validate: v => v.trim().length > 0 || 'Title is required',
                  maxLength: { value: 200, message: 'Max 200 characters' },
                })}
                type="text"
                placeholder="e.g. 24-Hour Follow-Up"
                className={inputClass}
              />
              {errors.title && <p className="text-[11px] text-danger mt-1">{errors.title.message}</p>}
            </div>
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">
                Code <span className="text-danger">*</span>
              </label>
              <input
                {...register('code', {
                  required: 'Code is required',
                  validate: v => CODE_RE.test(v.trim().toUpperCase()) || 'Uppercase letters, numbers and _ (start with a letter)',
                })}
                type="text"
                readOnly={!!editingSurvey}
                placeholder="FOLLOWUP_24H"
                onChange={e => setValue('code', e.target.value.toUpperCase().replace(/\s+/g, '_'), { shouldValidate: !!errors.code })}
                className={`${inputClass} font-mono ${editingSurvey ? 'bg-muted/50 text-muted-foreground cursor-not-allowed' : ''}`}
              />
              {errors.code && <p className="text-[11px] text-danger mt-1">{errors.code.message}</p>}
              {editingSurvey && <p className="text-[10px] text-muted-foreground mt-1">Codes can’t change (REDCap redirect uses it).</p>}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              Show in app <span className="text-danger">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SURVEY_PLACEMENTS.map((p) => (
                <label
                  key={`pl-${p.value}`}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors duration-150 ${
                    placementVal === p.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input type="radio" value={p.value} {...register('placement', { required: true })} className="mt-0.5 accent-[var(--primary)]" />
                  <span>
                    <span className="block text-[13px] font-600 text-foreground">{p.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{p.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              REDCap Public Link <span className="text-danger">*</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">
              Must start with <code className="bg-muted px-1 rounded text-[10px]">{REDCAP_PREFIX}</code>
            </p>
            <div className="relative">
              <input
                {...register('url', {
                  required: 'REDCap URL is required',
                  validate: val => (val.trim().startsWith(REDCAP_PREFIX) && val.trim().length > REDCAP_PREFIX.length) || 'URL must be a valid REDCap survey link',
                })}
                type="url"
                placeholder={`${REDCAP_PREFIX}...`}
                className={`${inputClass} font-mono pr-8`}
              />
              {redcapUrlVal && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${isValidRedcapUrl ? 'text-success' : 'text-danger'}`}>
                  <Icon name={isValidRedcapUrl ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} variant="solid" />
                </span>
              )}
            </div>
            {errors.url && <p className="text-[11px] text-danger mt-1">{errors.url.message}</p>}
            {isValidRedcapUrl && (
              <div className="mt-2 p-2.5 bg-success/5 border border-success/20 rounded-lg">
                <p className="text-[11px] text-success font-500">Valid REDCap URL — app will append the participant code automatically</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{redcapUrlVal.trim()}&participant_code=<em>username</em></p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">Description</label>
            <textarea
              {...register('description', { maxLength: { value: 1000, message: 'Max 1000 characters' } })}
              rows={2}
              placeholder="Brief description shown to patients before they start the survey..."
              className={`${inputClass} resize-none`}
            />
            {errors.description && <p className="text-[11px] text-danger mt-1">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Section in app</label>
              <div className="relative">
                <select {...register('category')} className={`${inputClass} appearance-none pr-8`}>
                  <option value="">No section</option>
                  {SURVEY_CATEGORIES.map(c => <option key={`cat-${c}`} value={c}>{c}</option>)}
                </select>
                <Icon name="ChevronDownIcon" size={14} variant="outline" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Frequency</label>
              <div className="relative">
                <select {...register('frequency')} className={`${inputClass} appearance-none pr-8`}>
                  <option value="">—</option>
                  {SURVEY_FREQUENCIES.map(f => <option key={`freq-${f}`} value={f}>{f}</option>)}
                </select>
                <Icon name="ChevronDownIcon" size={14} variant="outline" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Duration</label>
              <input
                {...register('duration', { maxLength: { value: 40, message: 'Max 40 characters' } })}
                type="text"
                placeholder="e.g. ~5 min"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Display Order</label>
              <input
                {...register('sortOrder', { valueAsNumber: true, min: { value: 0, message: 'Order must be 0 or more' }, max: { value: 10000, message: 'Too large' } })}
                type="number"
                min={0}
                className={inputClass}
              />
              {errors.sortOrder && <p className="text-[11px] text-danger mt-1">{errors.sortOrder.message}</p>}
            </div>
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Visibility</label>
              <div className="flex items-center gap-2 mt-2">
                <Toggle
                  checked={activeVal ?? true}
                  onChange={(val) => setValue('active', val, { shouldDirty: true })}
                  label="Active in app"
                />
              </div>
            </div>
          </div>

          {codeVal && CODE_RE.test(codeVal) && (
            <div className="p-3 bg-info/5 border border-info/20 rounded-lg">
              <p className="text-[11px] text-foreground font-500">Optional: let the app know when this survey is finished</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                In REDCap → Survey Settings → Survey Termination Options, choose “Redirect to a URL” and paste:
              </p>
              <p className="text-[10px] font-mono text-foreground mt-1 break-all">{completionRedirect(codeVal)}</p>
            </div>
          )}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Modal>

      {/* Delete Confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-card rounded-xl shadow-modal p-6 w-full max-w-sm scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                <Icon name="ExclamationTriangleIcon" size={20} variant="outline" className="text-danger" />
              </div>
              <h3 className="text-[15px] font-600 text-foreground">Delete Survey?</h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              This survey will be removed from the app immediately. Patients will no longer see it. Recorded completions are kept. This action cannot be undone — use the Active toggle to hide it instead.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirmId)} disabled={deleting} className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 active:scale-95 disabled:opacity-60">Delete Survey</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
