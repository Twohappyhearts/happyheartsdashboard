'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Icon from '@/components/ui/AppIcon';
import Toggle from '@/components/ui/Toggle';
import type { ContentSession } from './ContentManagementClient';
import AppImage from '@/components/ui/AppImage';

interface ContentFormProps {
  item: ContentSession | null;
  onSave: (data: ContentSession) => void;
  onCancel: () => void;
  nextSessionNumber: string;
  type: 'sessions' | 'resources';
}

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
  return url.includes('soundcloud.com/');
}

function isCloudinaryUrl(url: string): boolean {
  return url.includes('cloudinary.com') || url.includes('res.cloudinary.com');
}

export default function ContentForm({ item, onSave, onCancel, nextSessionNumber, type }: ContentFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContentSession>({
    defaultValues: item || {
      id: '',
      title: '',
      groupId: '',
      sessionNumber: nextSessionNumber,
      videoUrl: '',
      audioUrl: '',
      thumbnailUrl: '',
      infographicUrl: '',
      videoDuration: '',
      audioDuration: '',
      description: '',
      script: '',
      tags: [],
      active: true,
      lastEdited: '',
    },
  });

  const videoUrl = watch('videoUrl');
  const audioUrl = watch('audioUrl');
  const thumbnailUrl = watch('thumbnailUrl');
  const infographicUrl = watch('infographicUrl');
  const activeVal = watch('active');
  const [tagInput, setTagInput] = useState((item?.tags || []).join(', '));
  const [saving, setSaving] = useState(false);

  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;
  const soundcloudValid = audioUrl ? isSoundCloudUrl(audioUrl) : false;
  const thumbnailValid = thumbnailUrl ? (isCloudinaryUrl(thumbnailUrl) || thumbnailUrl.startsWith('http')) : false;
  const infographicValid = infographicUrl ? (isCloudinaryUrl(infographicUrl) || infographicUrl.startsWith('http')) : false;

  const onSubmit = async (data: ContentSession) => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    // TODO: POST/PUT to /api/content with data
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    onSave({ ...data, tags, lastEdited: new Date().toISOString().split('T')[0] });
    setSaving(false);
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
              {...register('title', { required: 'Title is required' })}
              type="text"
              placeholder="e.g. Understanding Heart Failure"
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.title && <p className="text-[11px] text-danger mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">Description</label>
            <textarea
              {...register('description')}
              rows={2}
              placeholder="Brief description shown in the app session list..."
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">
                Group ID <span className="text-danger">*</span>
              </label>
              <p className="text-[11px] text-muted-foreground mb-1">Groups related sessions together (e.g. group-hf)</p>
              <input
                {...register('groupId', { required: 'Group ID is required' })}
                type="text"
                placeholder="e.g. group-hf"
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] font-mono text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.groupId && <p className="text-[11px] text-danger mt-1">{errors.groupId.message}</p>}
            </div>
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">
                Session Number <span className="text-danger">*</span>
              </label>
              <p className="text-[11px] text-muted-foreground mb-1">Auto-suggested — edit if needed</p>
              <input
                {...register('sessionNumber', { required: 'Session number is required' })}
                type="text"
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] font-mono text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.sessionNumber && <p className="text-[11px] text-danger mt-1">{errors.sessionNumber.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">Tags</label>
            <p className="text-[11px] text-muted-foreground mb-1">Comma-separated tags for filtering in the app</p>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="heart failure, basics, introduction"
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
                {...register('videoUrl')}
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
            {videoUrl && !youtubeId && <p className="text-[11px] text-danger mt-1">This doesn't look like a valid YouTube URL</p>}
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
                  pattern: { value: /^\d+:\d{2}$/, message: 'Format must be MM:SS (e.g. 5:47)' }
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
                {...register('audioUrl')}
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
            {audioUrl && !soundcloudValid && <p className="text-[11px] text-danger mt-1">This doesn't look like a valid SoundCloud URL</p>}
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
                  pattern: { value: /^\d+:\d{2}$/, message: 'Format must be MM:SS (e.g. 6:15)' }
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
              Thumbnail URL <span className="text-danger">*</span>
              <span className="text-[11px] font-400 text-muted-foreground ml-1">(Cloudinary — card image in app)</span>
            </label>
            <div className="relative">
              <input
                {...register('thumbnailUrl', { required: 'Thumbnail URL is required' })}
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
            {thumbnailUrl && thumbnailValid && (
              <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden border border-border">
                <AppImage
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
                {...register('infographicUrl')}
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
            {infographicUrl && infographicValid && (
              <div className="mt-2 w-32 h-20 rounded-lg overflow-hidden border border-border">
                <AppImage
                  src={infographicUrl}
                  alt="Infographic preview"
                  width={128}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* Script */}
      <div>
        <h3 className="text-[13px] font-600 text-muted-foreground uppercase tracking-wider mb-3">Script / Content</h3>
        <label className="block text-[13px] font-500 text-foreground mb-1">Session Script</label>
        <p className="text-[11px] text-muted-foreground mb-1">Rich text content displayed below the media in the app</p>
        <textarea
          {...register('script')}
          rows={6}
          placeholder="<p>Enter the session script or key points here...</p>"
          className="w-full px-3 py-2 border border-border rounded-lg text-[13px] font-mono text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      </div>

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