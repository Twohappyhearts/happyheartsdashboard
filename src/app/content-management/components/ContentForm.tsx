'use client';

import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import RichTextEditor from '@/components/ui/RichTextEditor';
import Icon from '@/components/ui/AppIcon';
import Toggle from '@/components/ui/Toggle';
import type { ContentCategory, ContentInput, ContentItem, ReferenceLink } from '@/lib/content';
import { ContentError, MAX_REFERENCE_LINKS, lessonOwnReferences } from '@/lib/content';
import AppImage from '@/components/ui/AppImage';

interface ContentFormProps {
  item: ContentItem | null;
  /** Saves to the database; throws on failure (the form then keeps the input). */
  onSave: (data: ContentInput) => Promise<void>;
  onCancel: () => void;
  /** What the database will assign to a new item (preview only). */
  nextGroupId: string;
  nextGroupName: string;
  categories: ContentCategory[];
  onManageCategories: () => void;
  type: 'sessions' | 'resources';
}

type FormValues = Omit<ContentInput, 'tags' | 'references'>;

const HTTPS_LINK = /^https:\/\/\S+$/i;

const HTTPS = { value: /^https:\/\/\S+$/i, message: 'Must be a full link starting with https://' };

function getYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function isSoundCloudUrl(url: string): boolean {
  return /^https:\/\/(www\.|m\.)?soundcloud\.com\//i.test(url) || /^https:\/\/on\.soundcloud\.com\//i.test(url);
}

function isCloudinaryUrl(url: string): boolean {
  return /^https:\/\/res\.cloudinary\.com\//i.test(url);
}

export default function ContentForm({
  item,
  onSave,
  onCancel,
  nextGroupId,
  nextGroupName,
  categories,
  onManageCategories,
  type,
}: ContentFormProps) {
  const isSession = type === 'sessions';
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: item
      ? {
          title: item.title,
          description: item.description,
          categoryId: item.categoryId,
          videoUrl: item.videoUrl,
          audioUrl: item.audioUrl,
          thumbnailUrl: item.thumbnailUrl,
          thumbnailAlt: item.thumbnailAlt,
          infographicUrl: item.infographicUrl,
          quizUrl: item.quizUrl,
          script: item.script,
          videoDuration: item.videoDuration,
          audioDuration: item.audioDuration,
          groupName: item.groupName,
          active: item.active,
        }
      : {
          title: '',
          description: '',
          categoryId: null,
          videoUrl: '',
          audioUrl: '',
          thumbnailUrl: '',
          thumbnailAlt: '',
          infographicUrl: '',
          quizUrl: '',
          script: '',
          videoDuration: '',
          audioDuration: '',
          groupName: nextGroupName,
          active: true,
        },
  });

  const videoUrl = watch('videoUrl');
  const audioUrl = watch('audioUrl');
  const thumbnailUrl = watch('thumbnailUrl');
  const infographicUrl = watch('infographicUrl');
  const quizUrl = watch('quizUrl');
  const activeVal = watch('active');
  const [tagInput, setTagInput] = useState((item?.tags || []).join(', '));
  const [references, setReferences] = useState<ReferenceLink[]>(item?.references ?? []);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const scriptVal = watch('script');
  /** What the app lists by itself, so staff see the whole block and do not add a link twice. */
  const ownReferences = lessonOwnReferences({ videoUrl: videoUrl || '', audioUrl: audioUrl || '', script: scriptVal || '' });
  const setReference = (i: number, patch: Partial<ReferenceLink>) => {
    setReferenceError(null);
    setReferences((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;
  const soundcloudValid = audioUrl ? isSoundCloudUrl(audioUrl) : false;
  const thumbnailValid = thumbnailUrl ? isCloudinaryUrl(thumbnailUrl) : false;
  const infographicValid = infographicUrl ? isCloudinaryUrl(infographicUrl) : false;
  const thumbnailLooksLikeLink = /^https:\/\//i.test(thumbnailUrl || '');
  const infographicLooksLikeLink = /^https:\/\//i.test(infographicUrl || '');

  // Active categories, plus the item's current one even if it was deactivated.
  const categoryOptions = categories.filter((c) => c.isActive || c.id === item?.categoryId);

  const onSubmit = async (data: FormValues) => {
    // Rows left completely empty are dropped; a row with text needs a full https link.
    const cleaned = references
      .map((r) => ({ title: r.title.trim(), url: r.url.trim() }))
      .filter((r) => r.title || r.url);
    if (cleaned.some((r) => !HTTPS_LINK.test(r.url))) {
      setReferenceError('Every reference needs a full link starting with https://');
      return;
    }
    setReferenceError(null);
    setSaving(true);
    setSaveError(null);
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await onSave({ ...data, categoryId: data.categoryId || null, tags, references: cleaned });
    } catch (e) {
      setSaveError(e instanceof ContentError ? e.message : 'Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Info */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">Basic Information</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              Title <span className="text-danger">*</span>
            </label>
            <input
              {...register('title', { required: 'Title is required', maxLength: { value: 200, message: 'Max 200 characters' } })}
              type="text"
              placeholder={isSession ? 'e.g. Understanding Prenatal Anxiety' : 'e.g. Crisis Text Line'}
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.title && <p className="text-[11px] text-danger mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">Description</label>
            <textarea
              {...register('description', { maxLength: { value: 2000, message: 'Max 2000 characters' } })}
              rows={2}
              placeholder="Brief description shown in the app session list..."
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {isSession && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[13px] font-500 text-foreground">
                  Category <span className="text-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={onManageCategories}
                  className="text-[11px] font-600 text-primary hover:underline"
                >
                  Manage categories
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-1">Used for the category filter in the app</p>
              <div className="relative">
                <select
                  {...register('categoryId', {
                    validate: (v) => !!v || 'Choose a category',
                  })}
                  className="w-full appearance-none pl-3 pr-9 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  <option value="">Select a category…</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isActive ? '' : ' (inactive)'}
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
              {errors.categoryId && <p className="text-[11px] text-danger mt-1">{errors.categoryId.message}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Group ID</label>
              <p className="text-[11px] text-muted-foreground mb-1">Assigned automatically — cannot be edited</p>
              <input
                value={item ? item.groupId : nextGroupId}
                readOnly
                disabled
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] font-mono text-muted-foreground bg-muted/50 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Group Name</label>
              <p className="text-[11px] text-muted-foreground mb-1">
                {isSession ? 'Shown in the app, e.g. “Session 1”' : 'Defaults to “Community Resources”'}
              </p>
              <input
                {...register('groupName', { maxLength: { value: 100, message: 'Max 100 characters' } })}
                type="text"
                placeholder={nextGroupName}
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.groupName && <p className="text-[11px] text-danger mt-1">{errors.groupName.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">Tags</label>
            <p className="text-[11px] text-muted-foreground mb-1">Comma-separated keywords that help patients find this in the app search</p>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder={isSession ? 'anxiety, mental health, pregnancy' : 'food, hotline'}
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* Media URLs */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">Media Links</h3>
        <div className="space-y-5">
          {/* Video URL */}
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              Video URL <span className="text-[11px] font-400 text-muted-foreground">(YouTube)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">Paste a YouTube link — youtube.com/watch?v=..., youtu.be/..., or embed URL</p>
            <div className="relative">
              <input
                {...register('videoUrl', {
                  pattern: HTTPS,
                  validate: (v) => !v || !!getYouTubeId(v) || 'Must be a YouTube link',
                })}
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
              />
              {videoUrl && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${youtubeId ? 'text-success' : 'text-danger'}`}>
                  <Icon name={youtubeId ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} variant="solid" />
                </span>
              )}
            </div>
            {errors.videoUrl ? (
              <p className="text-[11px] text-danger mt-1">{errors.videoUrl.message}</p>
            ) : (
              videoUrl && !youtubeId && <p className="text-[11px] text-danger mt-1">This doesn&apos;t look like a valid YouTube URL</p>
            )}
            {youtubeId && (
              <div className="mt-2 rounded-lg overflow-hidden border border-border aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube video preview"
                />
              </div>
            )}
            <div className="mt-2">
              <label className="block text-[12px] font-500 text-foreground mb-1">Video Duration (MM:SS)</label>
              <input
                {...register('videoDuration', {
                  pattern: { value: /^\d{1,3}:[0-5]\d$/, message: 'Format must be MM:SS (e.g. 5:47)' }
                })}
                type="text"
                placeholder="5:47"
                className="w-28 px-3 py-1.5 border border-border rounded-lg text-[13px] font-mono text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.videoDuration && <p className="text-[11px] text-danger mt-1">{errors.videoDuration.message}</p>}
            </div>
          </div>

          {/* Audio URL */}
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              Audio URL <span className="text-[11px] font-400 text-muted-foreground">(SoundCloud)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">Paste a SoundCloud track URL — soundcloud.com/...</p>
            <div className="relative">
              <input
                {...register('audioUrl', {
                  pattern: HTTPS,
                  validate: (v) => !v || isSoundCloudUrl(v) || 'Must be a SoundCloud link',
                })}
                type="url"
                placeholder="https://soundcloud.com/..."
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
              />
              {audioUrl && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${soundcloudValid ? 'text-success' : 'text-danger'}`}>
                  <Icon name={soundcloudValid ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} variant="solid" />
                </span>
              )}
            </div>
            {errors.audioUrl ? (
              <p className="text-[11px] text-danger mt-1">{errors.audioUrl.message}</p>
            ) : (
              audioUrl && !soundcloudValid && <p className="text-[11px] text-danger mt-1">This doesn&apos;t look like a valid SoundCloud URL</p>
            )}
            {soundcloudValid && (
              <div className="mt-2 rounded-lg overflow-hidden border border-border">
                <iframe
                  width="100%"
                  height="166"
                  allow="autoplay"
                  src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(audioUrl)}&color=%23E05C6B&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false`}
                  title="SoundCloud audio preview"
                />
              </div>
            )}
            <div className="mt-2">
              <label className="block text-[12px] font-500 text-foreground mb-1">Audio Duration (MM:SS)</label>
              <input
                {...register('audioDuration', {
                  pattern: { value: /^\d{1,3}:[0-5]\d$/, message: 'Format must be MM:SS (e.g. 6:15)' }
                })}
                type="text"
                placeholder="6:15"
                className="w-28 px-3 py-1.5 border border-border rounded-lg text-[13px] font-mono text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.audioDuration && <p className="text-[11px] text-danger mt-1">{errors.audioDuration.message}</p>}
            </div>
          </div>

          {/* Thumbnail URL */}
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              Thumbnail URL {isSession && <span className="text-danger">*</span>}
              <span className="text-[11px] font-400 text-muted-foreground ml-1">(Cloudinary — card image in app)</span>
            </label>
            <div className="relative">
              <input
                {...register('thumbnailUrl', {
                  required: isSession ? 'Thumbnail URL is required' : false,
                  pattern: HTTPS,
                })}
                type="url"
                placeholder="https://res.cloudinary.com/..."
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
              />
              {thumbnailUrl && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${thumbnailValid ? 'text-success' : 'text-warning'}`}>
                  <Icon name={thumbnailValid ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} variant="solid" />
                </span>
              )}
            </div>
            {errors.thumbnailUrl && <p className="text-[11px] text-danger mt-1">{errors.thumbnailUrl.message}</p>}
            {thumbnailUrl && !errors.thumbnailUrl && !thumbnailValid && (
              <p className="text-[11px] text-warning mt-1">Not a Cloudinary link (res.cloudinary.com) — it will still work if the image is public.</p>
            )}
            <div className="mt-2">
              <label className="block text-[12px] font-500 text-foreground mb-1">Image description (for screen readers)</label>
              <input
                {...register('thumbnailAlt', { maxLength: { value: 300, message: 'Max 300 characters' } })}
                type="text"
                placeholder="e.g. Pregnant woman resting on a sofa"
                className="w-full px-3 py-1.5 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.thumbnailAlt && <p className="text-[11px] text-danger mt-1">{errors.thumbnailAlt.message}</p>}
            </div>
            {thumbnailUrl && thumbnailLooksLikeLink && (
              <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden border border-border">
                <AppImage
                  key={thumbnailUrl}
                  src={thumbnailUrl}
                  alt="Thumbnail preview"
                  width={128}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Infographic URL */}
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              Infographic URL <span className="text-[11px] font-400 text-muted-foreground">(Cloudinary — optional)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">If provided, patients can tap to view full-screen with pinch-to-zoom</p>
            <div className="relative">
              <input
                {...register('infographicUrl', { pattern: HTTPS })}
                type="url"
                placeholder="https://res.cloudinary.com/... (optional)"
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
              />
              {infographicUrl && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${infographicValid ? 'text-success' : 'text-warning'}`}>
                  <Icon name={infographicValid ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} variant="solid" />
                </span>
              )}
            </div>
            {errors.infographicUrl && <p className="text-[11px] text-danger mt-1">{errors.infographicUrl.message}</p>}
            {infographicUrl && !errors.infographicUrl && !infographicValid && (
              <p className="text-[11px] text-warning mt-1">Not a Cloudinary link (res.cloudinary.com) — it will still work if the image is public.</p>
            )}
            {infographicUrl && infographicLooksLikeLink && (
              <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden border border-border">
                <AppImage
                  key={infographicUrl}
                  src={infographicUrl}
                  alt="Infographic preview"
                  width={128}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
          {/* Quiz URL */}
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              Quiz URL <span className="text-[11px] font-400 text-muted-foreground">(optional — e.g. Kahoot)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">Shown at the end of the session; the app records when it is completed</p>
            <input
              {...register('quizUrl', { pattern: HTTPS })}
              type="url"
              placeholder="https://kahoot.it/challenge/..."
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.quizUrl && <p className="text-[11px] text-danger mt-1">{errors.quizUrl.message}</p>}
            {quizUrl && !errors.quizUrl && (
              <a href={quizUrl} target="_blank" rel="noreferrer" className="inline-block text-[11px] text-primary hover:underline mt-1">
                Open quiz in a new tab ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* Script */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">Script / Content</h3>
        <label className="block text-[13px] font-500 text-foreground mb-1">Session Script</label>
        <p className="text-[11px] text-muted-foreground mb-2">Rich text content displayed below the media in the app</p>
        <Controller
          name="script"
          control={control}
          rules={{ maxLength: { value: 200000, message: 'Script is too long' } }}
          render={({ field }) => (
            <RichTextEditor
              value={field.value}
              onChange={field.onChange}
              invalid={!!errors.script}
              placeholder={
                isSession ? 'Write the lesson script or key points here…' : 'Details about this resource (hours, phone, eligibility)…'
              }
            />
          )}
        />
        {errors.script && <p className="text-[11px] text-danger mt-1">{errors.script.message}</p>}
      </div>

      {isSession && (
        <>
          <hr className="border-border" />

          {/* References */}
          <div>
            <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">References</h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              Shown at the end of the lesson in the app. The lesson&apos;s video, audio and the links in the script are listed
              automatically; add any other source here.
            </p>

            {ownReferences.length > 0 && (
              <div className="mb-4">
                <p className="text-[12px] font-500 text-foreground mb-1.5">Listed automatically</p>
                <ul className="space-y-1">
                  {ownReferences.map((r) => (
                    <li key={r.url} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-[12px]">
                      <Icon name="LinkIcon" size={13} variant="outline" className="shrink-0 text-muted-foreground" />
                      {r.title && <span className="shrink-0 font-500 text-foreground">{r.title}</span>}
                      <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-primary hover:underline">
                        {r.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[12px] font-500 text-foreground mb-1.5">Added by you</p>
            {references.length === 0 && <p className="text-[12px] text-muted-foreground mb-2">No extra references yet.</p>}
            <div className="space-y-2">
              {references.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <input
                    type="text"
                    value={r.title}
                    onChange={(e) => setReference(i, { title: e.target.value })}
                    maxLength={200}
                    placeholder="Title, e.g. ACOG: Preeclampsia FAQ"
                    aria-label={`Reference ${i + 1} title`}
                    className="w-2/5 px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="url"
                    value={r.url}
                    onChange={(e) => setReference(i, { url: e.target.value })}
                    maxLength={2000}
                    placeholder="https://..."
                    aria-label={`Reference ${i + 1} link`}
                    className={`flex-1 min-w-0 px-3 py-2 border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                      r.url.trim() && !HTTPS_LINK.test(r.url.trim()) ? 'border-danger' : 'border-border'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setReferenceError(null);
                      setReferences((list) => list.filter((_, j) => j !== i));
                    }}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-danger"
                    aria-label={`Remove reference ${i + 1}`}
                    title="Remove"
                  >
                    <Icon name="TrashIcon" size={16} variant="outline" />
                  </button>
                </div>
              ))}
            </div>
            {referenceError && <p className="text-[11px] text-danger mt-1.5">{referenceError}</p>}
            {references.length < MAX_REFERENCE_LINKS && (
              <button
                type="button"
                onClick={() => setReferences((list) => [...list, { title: '', url: '' }])}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[12px] font-600 text-foreground hover:bg-muted"
              >
                <Icon name="PlusIcon" size={13} variant="outline" />
                Add reference
              </button>
            )}
          </div>
        </>
      )}

      <hr className="border-border" />

      {/* Visibility */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">Visibility</h3>
        <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border">
          <div>
            <p className="text-[13px] font-600 text-foreground">Active (visible in mobile app)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">When off, this content is hidden from all patients immediately</p>
          </div>
          <Toggle
            checked={activeVal}
            onChange={(val) => setValue('active', val)}
          />
        </div>
      </div>

      {saveError && (
        <div className="p-3 rounded-lg border border-danger/30 bg-danger/5 text-[13px] text-danger">{saveError}</div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60 min-w-[120px] justify-center"
        >
          {saving ? (
            <>
              <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />
              Saving...
            </>
          ) : (
            item ? 'Save Changes' : 'Create Content'
          )}
        </button>
      </div>
    </form>
  );
}