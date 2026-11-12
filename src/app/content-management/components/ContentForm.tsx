'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import RichTextEditor from '@/components/ui/RichTextEditor';
import Icon from '@/components/ui/AppIcon';
import Toggle from '@/components/ui/Toggle';
import { useSlideOverClose } from '@/components/ui/SlideOver';
import type { ContentCategory, ContentInput, ContentItem, LessonAttachment, ReferenceLink } from '@/lib/content';
import { ContentError, MAX_REFERENCE_LINKS, lessonFileUrls, lessonOwnReferences } from '@/lib/content';
import AppImage from '@/components/ui/AppImage';
import { createClient } from '@/lib/supabase/client';
import { formatBytes } from '@/lib/format-bytes';
import {
  MAX_ATTACHMENTS,
  UploadError,
  acceptFor,
  attachmentKindOf,
  isLessonUploadUrl,
  releaseLessonFiles,
  uploadLessonFile,
  type UploadPurpose,
} from '@/lib/uploads';
import { useStaffT } from '@/lib/i18n/staff/context';

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
  /** Reports whether the form holds unsaved changes (the panel then asks before closing). */
  onDirtyChange?: (dirty: boolean) => void;
}

type FormValues = Omit<ContentInput, 'tags' | 'references' | 'attachments'>;
type ImageField = 'thumbnailUrl' | 'infographicUrl';

/** Hidden file input behind a button. */
function UploadButton({
  purpose,
  multiple = false,
  busy,
  disabled,
  label,
  busyLabel,
  onFiles,
}: {
  purpose: UploadPurpose;
  multiple?: boolean;
  busy: boolean;
  disabled?: boolean;
  label: string;
  busyLabel: string;
  onFiles: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy || disabled}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[12px] font-600 text-foreground hover:bg-muted disabled:opacity-60 whitespace-nowrap"
      >
        <Icon name={busy ? 'ArrowPathIcon' : 'ArrowUpTrayIcon'} size={14} variant="outline" className={busy ? 'animate-spin' : ''} />
        {busy ? busyLabel : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={acceptFor(purpose)}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

const HTTPS_LINK = /^https:\/\/\S+$/i;

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
  onDirtyChange,
}: ContentFormProps) {
  const isSession = type === 'sessions';
  const T = useStaffT().t.content.form;
  const HTTPS = { value: HTTPS_LINK, message: T.httpsOnly };
  const supabase = useMemo(() => createClient(), []);
  const requestClose = useSlideOverClose();
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
          active: false,
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

  // ---- Uploads ----
  const [attachments, setAttachments] = useState<LessonAttachment[]>(item?.attachments ?? []);
  const [pendingMaterials, setPendingMaterials] = useState<{ key: string; name: string; size: number }[]>([]);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<ImageField | null>(null);
  const [imageError, setImageError] = useState<Partial<Record<ImageField, string>>>({});
  /** Files uploaded while this form was open; deleted again if the form is closed without saving. */
  const sessionUploads = useRef<string[]>([]);
  const saved = useRef(false);
  const uploadsBusy = uploadingImage !== null || pendingMaterials.length > 0;

  useEffect(
    () => () => {
      if (!saved.current) releaseLessonFiles(sessionUploads.current);
    },
    []
  );

  const uploadImage = async (field: ImageField, file: File) => {
    setUploadingImage(field);
    setImageError((e) => ({ ...e, [field]: undefined }));
    try {
      const up = await uploadLessonFile(supabase, file, { purpose: 'image', contentId: item?.id });
      sessionUploads.current.push(up.url);
      setValue(field, up.url, { shouldDirty: true, shouldValidate: true });
      toast.success(T.uploadedOk);
    } catch (e) {
      setImageError((x) => ({ ...x, [field]: e instanceof UploadError ? e.message : T.imageUploadFailed }));
    } finally {
      setUploadingImage(null);
    }
  };

  const addMaterials = async (files: File[]) => {
    setMaterialsError(null);
    const room = MAX_ATTACHMENTS - attachments.length - pendingMaterials.length;
    if (room <= 0) {
      setMaterialsError(T.limitReached);
      return;
    }
    const batch = files.slice(0, room);
    const errors: string[] = files.length > room ? [T.roomLeft(room)] : [];
    const queued = batch.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, file: f }));
    setPendingMaterials((p) => [...p, ...queued.map(({ key, name, size }) => ({ key, name, size }))]);
    for (const q of queued) {
      try {
        const up = await uploadLessonFile(supabase, q.file, { purpose: 'material', contentId: item?.id });
        sessionUploads.current.push(up.url);
        setAttachments((list) => [
          ...list,
          { name: up.name.trim().slice(0, 200) || 'File', url: up.url, kind: attachmentKindOf(up.mime), sizeBytes: up.size },
        ]);
      } catch (e) {
        errors.push(e instanceof UploadError ? e.message : T.fileUploadFailed(q.name));
      } finally {
        setPendingMaterials((p) => p.filter((x) => x.key !== q.key));
      }
    }
    if (errors.length) setMaterialsError(errors.join(' '));
  };

  const setAttachmentName = (i: number, name: string) =>
    setAttachments((list) => list.map((a, j) => (j === i ? { ...a, name } : a)));

  // ---- Unsaved changes ----
  const values = watch();
  const snapshot = JSON.stringify({ values, tags: tagInput.trim(), references, attachments });
  const initialSnapshot = useRef(snapshot);
  const dirty = snapshot !== initialSnapshot.current || uploadsBusy;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;
  const soundcloudValid = audioUrl ? isSoundCloudUrl(audioUrl) : false;
  // Uploaded here (our storage) or a Cloudinary link.
  const knownImageHost = (url: string) => isCloudinaryUrl(url) || isLessonUploadUrl(url);
  const thumbnailValid = thumbnailUrl ? knownImageHost(thumbnailUrl) : false;
  const infographicValid = infographicUrl ? knownImageHost(infographicUrl) : false;
  const thumbnailLooksLikeLink = /^https:\/\//i.test(thumbnailUrl || '');
  const infographicLooksLikeLink = /^https:\/\//i.test(infographicUrl || '');

  // Active categories, plus the item's current one even if it was deactivated.
  const categoryOptions = categories.filter((c) => c.isActive || c.id === item?.categoryId);

  const onSubmit = async (data: FormValues) => {
    if (uploadsBusy) {
      setSaveError(T.waitForUploads);
      return;
    }
    // Rows left completely empty are dropped; a row with text needs a full https link.
    const cleaned = references
      .map((r) => ({ title: r.title.trim(), url: r.url.trim() }))
      .filter((r) => r.title || r.url);
    if (cleaned.some((r) => !HTTPS_LINK.test(r.url))) {
      setReferenceError(T.referenceNeedsHttps);
      return;
    }
    setReferenceError(null);
    setSaving(true);
    setSaveError(null);
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const cleanedAttachments = attachments.map((a) => ({ ...a, name: a.name.trim() || 'File' }));
    // Set before saving: a successful save closes the panel, and the files must not be released then.
    saved.current = true;
    try {
      await onSave({ ...data, categoryId: data.categoryId || null, tags, references: cleaned, attachments: cleanedAttachments });
      // Files the lesson no longer uses (replaced or removed); the server keeps any still in use.
      releaseLessonFiles([...(item ? lessonFileUrls(item) : []), ...sessionUploads.current]);
    } catch (e) {
      saved.current = false;
      setSaveError(e instanceof ContentError ? e.message : T.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Info */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">{T.basicInfo}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              {T.title} <span className="text-danger">*</span>
            </label>
            <input
              {...register('title', { required: T.titleRequired, maxLength: { value: 200, message: T.maxChars(200) } })}
              type="text"
              placeholder={isSession ? T.titlePlaceholderSession : T.titlePlaceholderResource}
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.title && <p className="text-[11px] text-danger mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">{T.description}</label>
            <textarea
              {...register('description', { maxLength: { value: 2000, message: T.maxChars(2000) } })}
              rows={2}
              placeholder={T.descriptionPlaceholder}
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {isSession && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[13px] font-500 text-foreground">
                  {T.category} <span className="text-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={onManageCategories}
                  className="text-[11px] font-600 text-primary hover:underline"
                >
                  {T.manageCategories}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-1">{T.categoryHint}</p>
              <div className="relative">
                <select
                  {...register('categoryId', {
                    validate: (v) => !!v || T.chooseCategory,
                  })}
                  className="w-full appearance-none pl-3 pr-9 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  <option value="">{T.selectCategory}</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isActive ? '' : T.inactiveSuffix}
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
              <label className="block text-[13px] font-500 text-foreground mb-1">{T.groupId}</label>
              <p className="text-[11px] text-muted-foreground mb-1">{T.groupIdHint}</p>
              <input
                value={item ? item.groupId : nextGroupId}
                readOnly
                disabled
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] font-mono text-muted-foreground bg-muted/50 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">{T.groupName}</label>
              <p className="text-[11px] text-muted-foreground mb-1">
                {isSession ? T.groupNameHintSession : T.groupNameHintResource}
              </p>
              <input
                {...register('groupName', { maxLength: { value: 100, message: T.maxChars(100) } })}
                type="text"
                placeholder={nextGroupName}
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.groupName && <p className="text-[11px] text-danger mt-1">{errors.groupName.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">{T.tags}</label>
            <p className="text-[11px] text-muted-foreground mb-1">{T.tagsHint}</p>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder={isSession ? T.tagsPlaceholderSession : T.tagsPlaceholderResource}
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* Media URLs */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">{T.mediaLinks}</h3>
        <div className="space-y-5">
          {/* Video URL */}
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              {T.videoUrl} <span className="text-[11px] font-400 text-muted-foreground">(YouTube)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">{T.videoHint}</p>
            <div className="relative">
              <input
                {...register('videoUrl', {
                  pattern: HTTPS,
                  validate: (v) => !v || !!getYouTubeId(v) || T.mustYouTube,
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
              videoUrl && !youtubeId && <p className="text-[11px] text-danger mt-1">{T.notYouTube}</p>
            )}
            {youtubeId && (
              <div className="mt-2 rounded-lg overflow-hidden border border-border aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={T.videoPreview}
                />
              </div>
            )}
            <div className="mt-2">
              <label className="block text-[12px] font-500 text-foreground mb-1">{T.videoDuration}</label>
              <input
                {...register('videoDuration', {
                  pattern: { value: /^\d{1,3}:[0-5]\d$/, message: T.durationFormat('5:47') }
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
              {T.audioUrl} <span className="text-[11px] font-400 text-muted-foreground">(SoundCloud)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">{T.audioHint}</p>
            <div className="relative">
              <input
                {...register('audioUrl', {
                  pattern: HTTPS,
                  validate: (v) => !v || isSoundCloudUrl(v) || T.mustSoundCloud,
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
              audioUrl && !soundcloudValid && <p className="text-[11px] text-danger mt-1">{T.notSoundCloud}</p>
            )}
            {soundcloudValid && (
              <div className="mt-2 rounded-lg overflow-hidden border border-border">
                <iframe
                  width="100%"
                  height="166"
                  allow="autoplay"
                  src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(audioUrl)}&color=%23E05C6B&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false`}
                  title={T.audioPreview}
                />
              </div>
            )}
            <div className="mt-2">
              <label className="block text-[12px] font-500 text-foreground mb-1">{T.audioDuration}</label>
              <input
                {...register('audioDuration', {
                  pattern: { value: /^\d{1,3}:[0-5]\d$/, message: T.durationFormat('6:15') }
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
              {T.thumbnailLabel} {isSession && <span className="text-danger">*</span>}
              <span className="text-[11px] font-400 text-muted-foreground ml-1">({T.thumbnailNote})</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">{T.imageHint}</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  {...register('thumbnailUrl', {
                    required: isSession ? T.thumbnailRequired : false,
                    pattern: HTTPS,
                  })}
                  type="url"
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
                />
                {thumbnailUrl && (
                  <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${thumbnailValid ? 'text-success' : 'text-warning'}`}>
                    <Icon name={thumbnailValid ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} variant="solid" />
                  </span>
                )}
              </div>
              <UploadButton
                purpose="image"
                busy={uploadingImage === 'thumbnailUrl'}
                disabled={uploadingImage !== null}
                label={T.uploadImage}
                busyLabel={T.uploadingImage}
                onFiles={([f]) => void uploadImage('thumbnailUrl', f)}
              />
            </div>
            {imageError.thumbnailUrl && <p className="text-[11px] text-danger mt-1">{imageError.thumbnailUrl}</p>}
            {errors.thumbnailUrl && <p className="text-[11px] text-danger mt-1">{errors.thumbnailUrl.message}</p>}
            {thumbnailUrl && !errors.thumbnailUrl && !thumbnailValid && (
              <p className="text-[11px] text-warning mt-1">{T.notKnownHost}</p>
            )}
            <div className="mt-2">
              <label className="block text-[12px] font-500 text-foreground mb-1">{T.imageAlt}</label>
              <input
                {...register('thumbnailAlt', { maxLength: { value: 300, message: T.maxChars(300) } })}
                type="text"
                placeholder={T.imageAltPlaceholder}
                className="w-full px-3 py-1.5 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.thumbnailAlt && <p className="text-[11px] text-danger mt-1">{errors.thumbnailAlt.message}</p>}
            </div>
            {thumbnailUrl && thumbnailLooksLikeLink && (
              <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden border border-border">
                <AppImage
                  key={thumbnailUrl}
                  src={thumbnailUrl}
                  alt={T.thumbnailPreview}
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
              {T.infographicLabel} <span className="text-[11px] font-400 text-muted-foreground">({T.infographicNote})</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">{T.infographicHint} {T.imageHint}</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  {...register('infographicUrl', { pattern: HTTPS })}
                  type="url"
                  placeholder={T.optionalLink}
                  className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
                />
                {infographicUrl && (
                  <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${infographicValid ? 'text-success' : 'text-warning'}`}>
                    <Icon name={infographicValid ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} variant="solid" />
                  </span>
                )}
              </div>
              <UploadButton
                purpose="image"
                busy={uploadingImage === 'infographicUrl'}
                disabled={uploadingImage !== null}
                label={T.uploadImage}
                busyLabel={T.uploadingImage}
                onFiles={([f]) => void uploadImage('infographicUrl', f)}
              />
            </div>
            {imageError.infographicUrl && <p className="text-[11px] text-danger mt-1">{imageError.infographicUrl}</p>}
            {errors.infographicUrl && <p className="text-[11px] text-danger mt-1">{errors.infographicUrl.message}</p>}
            {infographicUrl && !errors.infographicUrl && !infographicValid && (
              <p className="text-[11px] text-warning mt-1">{T.notKnownHost}</p>
            )}
            {infographicUrl && infographicLooksLikeLink && (
              <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden border border-border">
                <AppImage
                  key={infographicUrl}
                  src={infographicUrl}
                  alt={T.infographicPreview}
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
              {T.quizUrl} <span className="text-[11px] font-400 text-muted-foreground">({T.quizNote})</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">{T.quizHint}</p>
            <input
              {...register('quizUrl', { pattern: HTTPS })}
              type="url"
              placeholder="https://kahoot.it/challenge/..."
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.quizUrl && <p className="text-[11px] text-danger mt-1">{errors.quizUrl.message}</p>}
            {quizUrl && !errors.quizUrl && (
              <a href={quizUrl} target="_blank" rel="noreferrer" className="inline-block text-[11px] text-primary hover:underline mt-1">
                {T.openQuiz}
              </a>
            )}
          </div>
        </div>
      </div>

      {isSession && (
        <>
          <hr className="border-border" />

          {/* Materials (uploaded files) */}
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider">{T.materialsTitle}</h3>
                <p className="text-[11px] text-muted-foreground mt-1">{T.materialsHint}</p>
              </div>
              <UploadButton
                purpose="material"
                multiple
                busy={pendingMaterials.length > 0}
                disabled={attachments.length + pendingMaterials.length >= MAX_ATTACHMENTS}
                label={T.uploadFiles}
                busyLabel={T.uploading}
                onFiles={(files) => void addMaterials(files)}
              />
            </div>
            {attachments.length === 0 && pendingMaterials.length === 0 && (
              <p className="text-[12px] text-muted-foreground">{T.materialsEmpty}</p>
            )}
            <ul className="space-y-2">
              {attachments.map((a, i) => (
                <li key={a.url} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/20">
                  <Icon
                    name={a.kind === 'pdf' ? 'DocumentTextIcon' : 'PhotoIcon'}
                    size={18}
                    variant="outline"
                    className="shrink-0 text-muted-foreground"
                  />
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={a.name}
                      onChange={(e) => setAttachmentName(i, e.target.value)}
                      maxLength={200}
                      placeholder={T.materialNamePlaceholder}
                      aria-label={T.materialName(i)}
                      className={`w-full px-2 py-1 border rounded-md text-[13px] text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                        a.name.trim() ? 'border-border' : 'border-danger'
                      }`}
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {T.kindLabel[a.kind]} · {formatBytes(a.sizeBytes)}
                    </p>
                  </div>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    title={T.open}
                    aria-label={`${T.open}: ${a.name}`}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Icon name="ArrowTopRightOnSquareIcon" size={16} variant="outline" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setAttachments((list) => list.filter((_, j) => j !== i))}
                    title={T.remove}
                    aria-label={`${T.remove}: ${a.name}`}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-danger"
                  >
                    <Icon name="TrashIcon" size={16} variant="outline" />
                  </button>
                </li>
              ))}
              {pendingMaterials.map((p) => (
                <li key={p.key} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border">
                  <Icon name="ArrowPathIcon" size={16} variant="outline" className="shrink-0 text-muted-foreground animate-spin" />
                  <span className="flex-1 min-w-0 truncate text-[13px] text-foreground">{p.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {T.uploading} {formatBytes(p.size)}
                  </span>
                </li>
              ))}
            </ul>
            {materialsError && <p className="text-[11px] text-danger mt-1.5">{materialsError}</p>}
          </div>
        </>
      )}

      <hr className="border-border" />

      {/* Script */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">{T.scriptSection}</h3>
        <label className="block text-[13px] font-500 text-foreground mb-1">{T.script}</label>
        <p className="text-[11px] text-muted-foreground mb-2">{T.scriptHint}</p>
        <Controller
          name="script"
          control={control}
          rules={{ maxLength: { value: 200000, message: T.scriptTooLong } }}
          render={({ field }) => (
            <RichTextEditor
              value={field.value}
              onChange={field.onChange}
              invalid={!!errors.script}
              placeholder={isSession ? T.scriptPlaceholderSession : T.scriptPlaceholderResource}
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
            <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">{T.references}</h3>
            <p className="text-[11px] text-muted-foreground mb-3">{T.referencesHint}</p>

            {ownReferences.length > 0 && (
              <div className="mb-4">
                <p className="text-[12px] font-500 text-foreground mb-1.5">{T.listedAutomatically}</p>
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

            <p className="text-[12px] font-500 text-foreground mb-1.5">{T.addedByYou}</p>
            {references.length === 0 && <p className="text-[12px] text-muted-foreground mb-2">{T.noReferences}</p>}
            <div className="space-y-2">
              {references.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <input
                    type="text"
                    value={r.title}
                    onChange={(e) => setReference(i, { title: e.target.value })}
                    maxLength={200}
                    placeholder={T.referenceTitlePlaceholder}
                    aria-label={T.referenceTitle(i)}
                    className="w-2/5 px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="url"
                    value={r.url}
                    onChange={(e) => setReference(i, { url: e.target.value })}
                    maxLength={2000}
                    placeholder="https://..."
                    aria-label={T.referenceLink(i)}
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
                    aria-label={T.removeReference(i)}
                    title={T.remove}
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
                {T.addReference}
              </button>
            )}
          </div>
        </>
      )}

      <hr className="border-border" />

      {/* Visibility */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">{T.visibility}</h3>
        <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border">
          <div>
            <p className="text-[13px] font-600 text-foreground">{T.activeLabel}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{T.activeHint}</p>
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
          onClick={() => (requestClose ?? onCancel)()}
          className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
        >
          {T.cancel}
        </button>
        <button
          type="submit"
          disabled={saving || uploadsBusy}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60 min-w-[120px] justify-center"
        >
          {saving ? (
            <>
              <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />
              {T.saving}
            </>
          ) : item ? (
            T.saveChanges
          ) : (
            T.create
          )}
        </button>
      </div>
    </form>
  );
}