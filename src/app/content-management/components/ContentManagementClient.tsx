'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';

import Toggle from '@/components/ui/Toggle';
import SlideOver from '@/components/ui/SlideOver';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import ContentForm from './ContentForm';
import CategoryManager from './CategoryManager';
import AppImage from '@/components/ui/AppImage';
import { createClient } from '@/lib/supabase/client';
import {
  ContentError,
  createContent,
  deleteContent,
  lessonFileUrls,
  listCategories,
  listContent,
  previewNextGroupId,
  setContentActive,
  updateContent,
  type ContentCategory,
  type ContentInput,
  type ContentItem,
  type ContentKind,
} from '@/lib/content';
import { releaseLessonFiles } from '@/lib/uploads';
import { useStaffT } from '@/lib/i18n/staff/context';
import ResourceDirectory from './ResourceDirectory';

/**
 * Sessions are content_items (kind 'session'). The Community Resources tab is the resource
 * directory (public.community_resources, ResourceDirectory); the old content_items rows of kind
 * 'resource' are kept in the database but no longer listed.
 */
type Tab = 'sessions' | 'resources';
const SESSION: ContentKind = 'session';

function formatEdited(iso: string, locale: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ContentManagementClient() {
  const supabase = useMemo(() => createClient(), []);
  const { t, locale } = useStaffT();
  const T = t.content.page;
  const [activeTab, setActiveTab] = useState<Tab>('sessions');
  const [sessions, setSessions] = useState<ContentItem[] | null>(null);
  const [resourceCount, setResourceCount] = useState<number | null>(null);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  /** The edit panel holds unsaved changes (closing it asks first). */
  const [formDirty, setFormDirty] = useState(false);
  /** Turning Active off hides the lesson from every patient at once, so it is confirmed first. */
  const [hideTarget, setHideTarget] = useState<ContentItem | null>(null);

  const closePanel = useCallback(() => {
    setSlideOverOpen(false);
    setFormDirty(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([listContent(supabase, SESSION), listCategories(supabase)]);
      setSessions(s);
      setCategories(c);
      setLoadError(null);
      // Only the tab label; the directory loads itself when its tab opens.
      const { count } = await supabase.from('community_resources').select('id', { count: 'exact', head: true });
      if (count != null) setResourceCount(count);
    } catch (e) {
      setLoadError(e instanceof ContentError ? e.message : T.loadFailed);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = sessions ?? [];
  const setItems = setSessions;
  const loading = sessions === null && !loadError;

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch =
      item.title.toLowerCase().includes(q) ||
      item.groupId.toLowerCase().includes(q) ||
      item.groupName.toLowerCase().includes(q) ||
      (item.categoryName ?? '').toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q));
    const matchActive =
      filterActive === 'all' ? true : filterActive === 'active' ? item.active : !item.active;
    return matchSearch && matchActive;
  });

  const requestToggleActive = (item: ContentItem) => {
    if (item.active) setHideTarget(item);
    else void handleToggleActive(item);
  };

  const handleToggleActive = async (item: ContentItem) => {
    const next = !item.active;
    // Optimistic: flip now, roll back if the database refuses.
    setItems((prev) => prev && prev.map((i) => (i.id === item.id ? { ...i, active: next } : i)));
    setToggling((t) => ({ ...t, [item.id]: true }));
    try {
      await setContentActive(supabase, item.id, next);
      toast.success(next ? T.nowVisible(item.title) : T.nowHidden(item.title));
    } catch (e) {
      setItems((prev) => prev && prev.map((i) => (i.id === item.id ? { ...i, active: item.active } : i)));
      toast.error(e instanceof ContentError ? e.message : T.visibilityFailed);
    } finally {
      setToggling((t) => {
        const { [item.id]: _done, ...rest } = t;
        return rest;
      });
    }
  };

  const handleEdit = (item: ContentItem) => {
    setEditingItem(item);
    setSlideOverOpen(true);
  };

  const handleNew = () => {
    setEditingItem(null);
    setSlideOverOpen(true);
  };

  /** Throws on failure so the form can keep the user's input and show the error. */
  const handleSave = async (input: ContentInput) => {
    if (editingItem) {
      const saved = await updateContent(supabase, editingItem.id, input);
      setItems((prev) => prev && prev.map((i) => (i.id === saved.id ? saved : i)));
      toast.success(T.updated);
    } else {
      const saved = await createContent(supabase, SESSION, input);
      setItems((prev) => [...(prev ?? []), saved]);
      toast.success(T.created(saved.groupName || saved.groupId));
    }
    closePanel();
    void listCategories(supabase).then(setCategories).catch(() => {});
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteContent(supabase, id);
      const removed = items.find((item) => item.id === id);
      if (removed) releaseLessonFiles(lessonFileUrls(removed));
      setItems((prev) => prev && prev.filter((item) => item.id !== id));
      setDeleteConfirmId(null);
      toast.success(T.deleted);
    } catch (e) {
      toast.error(e instanceof ContentError ? e.message : T.deleteFailed);
    } finally {
      setDeleting(false);
    }
  };

  const nextGroup = previewNextGroupId(SESSION, items);
  const deleteTarget = items.find((i) => i.id === deleteConfirmId) ?? null;
  const isSessions = activeTab === 'sessions';
  const colCount = 10;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">{T.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.subtitle}</p>
        </div>
        {isSessions && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCategoriesOpen(true)}
            className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
          >
            <Icon name="TagIcon" size={16} variant="outline" />
            {T.categories}
          </button>
          <button
            onClick={handleNew}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm disabled:opacity-60"
          >
            <Icon name="PlusIcon" size={16} variant="outline" />
            {T.newSession}
          </button>
        </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {(['sessions', 'resources'] as Tab[]).map((tab) => (
          <button
            key={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-1.5 rounded-md text-[13px] font-600 transition-all duration-150
              ${activeTab === tab ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            {tab === 'sessions'
              ? T.tabSessions(String(sessions?.length ?? '…'))
              : T.tabResources(String(resourceCount ?? '…'))}
          </button>
        ))}
      </div>

      {!isSessions && <ResourceDirectory onCountChange={setResourceCount} />}

      {isSessions && (
      <>
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Icon
            name="MagnifyingGlassIcon"
            size={14}
            variant="outline"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder={isSessions ? T.searchSessions : T.searchResources}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-72"
          />
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={`filter-${f}`}
              onClick={() => setFilterActive(f)}
              className={`
                px-3 py-1.5 rounded-md text-[12px] font-500 transition-all duration-150
                ${filterActive === f ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              {T.filters[f]}
              {f !== 'all' && (
                <span className="ml-1 text-muted-foreground">
                  ({items.filter((i) => (f === 'active' ? i.active : !i.active)).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-muted-foreground ml-auto">
          {T.countOf(filtered.length, items.length, isSessions)}
        </span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-12">{T.columns.thumb}</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.title}</th>
                {isSessions && (
                  <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.category}</th>
                )}
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.group}</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.media}</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.duration}</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.tags}</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.active}</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.columns.lastEdited}</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-20">{T.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2].map((i) => (
                  <tr key={`sk-${i}`} className="border-b border-border last:border-0 animate-pulse">
                    {Array.from({ length: colCount }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-muted rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : loadError ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <p className="text-[13px] text-danger mb-3">{loadError}</p>
                    <button onClick={() => void load()} className="text-[13px] font-600 text-primary hover:underline">
                      {t.common.tryAgain}
                    </button>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount}>
                    <EmptyState
                      icon="BookOpenIcon"
                      title={T.emptyTitle(isSessions)}
                      description={items.length === 0 ? T.emptyNone(isSessions) : T.emptyFiltered(isSessions)}
                      action={{ label: isSessions ? T.createSession : T.createResource, onClick: handleNew }}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors duration-100 group ${
                      item.active ? '' : 'opacity-70'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                        {item.thumbnailUrl ? (
                          <AppImage
                            key={item.thumbnailUrl}
                            src={item.thumbnailUrl}
                            alt={item.thumbnailAlt || T.thumbAlt(item.title)}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon name="PhotoIcon" size={16} variant="outline" className="text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-600 text-foreground max-w-[220px] truncate">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[220px] truncate">{item.description}</p>
                    </td>
                    {isSessions && (
                      <td className="px-4 py-3">
                        {item.categoryName ? (
                          <span className="text-[11px] font-500 px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">
                            {item.categoryName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-warning">{T.noCategory}</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="text-[12px] font-500 text-foreground">{item.groupName || '—'}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{item.groupId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          title={item.videoUrl ? `YouTube: ${item.videoUrl}` : T.noVideo}
                          className={`w-6 h-6 rounded-md flex items-center justify-center ${item.videoUrl ? 'bg-danger/10' : 'bg-muted'}`}
                        >
                          <Icon name="PlayIcon" size={12} variant={item.videoUrl ? 'solid' : 'outline'} className={item.videoUrl ? 'text-danger' : 'text-muted-foreground'} />
                        </span>
                        <span
                          title={item.audioUrl ? `SoundCloud: ${item.audioUrl}` : T.noAudio}
                          className={`w-6 h-6 rounded-md flex items-center justify-center ${item.audioUrl ? 'bg-warning/10' : 'bg-muted'}`}
                        >
                          <Icon name="MusicalNoteIcon" size={12} variant={item.audioUrl ? 'solid' : 'outline'} className={item.audioUrl ? 'text-warning' : 'text-muted-foreground'} />
                        </span>
                        <span
                          title={item.infographicUrl ? T.hasInfographic : T.noInfographic}
                          className={`w-6 h-6 rounded-md flex items-center justify-center ${item.infographicUrl ? 'bg-info/10' : 'bg-muted'}`}
                        >
                          <Icon name="PhotoIcon" size={12} variant={item.infographicUrl ? 'solid' : 'outline'} className={item.infographicUrl ? 'text-info' : 'text-muted-foreground'} />
                        </span>
                        <span
                          title={item.quizUrl ? T.quiz(item.quizUrl) : T.noQuiz}
                          className={`w-6 h-6 rounded-md flex items-center justify-center ${item.quizUrl ? 'bg-success/10' : 'bg-muted'}`}
                        >
                          <Icon name="PuzzlePieceIcon" size={12} variant={item.quizUrl ? 'solid' : 'outline'} className={item.quizUrl ? 'text-success' : 'text-muted-foreground'} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {item.videoDuration && <p className="text-[11px] text-muted-foreground font-mono tabular-nums">▶ {item.videoDuration}</p>}
                        {item.audioDuration && <p className="text-[11px] text-muted-foreground font-mono tabular-nums">♪ {item.audioDuration}</p>}
                        {!item.videoDuration && !item.audioDuration && <p className="text-[11px] text-muted-foreground">—</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {item.tags.slice(0, 2).map((tag) => (
                          <span key={`tag-${item.id}-${tag}`} className="text-[10px] font-500 px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                        {item.tags.length > 2 && (
                          <span className="text-[10px] font-500 px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground">
                            +{item.tags.length - 2}
                          </span>
                        )}
                        {item.tags.length === 0 && <span className="text-[11px] text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={item.active}
                        disabled={!!toggling[item.id]}
                        onChange={() => requestToggleActive(item)}
                      />
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatEdited(item.updatedAt, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(item)}
                          title={T.editContent}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                        >
                          <Icon name="PencilIcon" size={14} variant="outline" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(item.id)}
                          title={T.deleteHint}
                          className="p-1.5 rounded-md hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors duration-100"
                        >
                          <Icon name="TrashIcon" size={14} variant="outline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      </>
      )}

      {/* Delete Confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => !deleting && setDeleteConfirmId(null)} />
          <div className="relative bg-card rounded-xl shadow-modal p-6 w-full max-w-sm scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                <Icon name="ExclamationTriangleIcon" size={20} variant="outline" className="text-danger" />
              </div>
              <h3 className="text-[15px] font-600 text-foreground">{T.deleteTitle}</h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-2">
              {deleteTarget ? <strong className="text-foreground">{deleteTarget.title}</strong> : T.thisContent}
              {T.deleteBody}
            </p>
            <p className="text-[12px] text-muted-foreground mb-5">
              {T.deleteHideBefore}
              <strong>{T.deleteHideActive}</strong>
              {T.deleteHideAfter}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
              >
                {T.cancel}
              </button>
              <button
                onClick={() => void handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 active:scale-95 disabled:opacity-60"
              >
                {deleting ? T.deleting : T.deleteButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over form */}
      <SlideOver
        open={slideOverOpen}
        onClose={closePanel}
        dirty={formDirty}
        title={editingItem ? T.editTitle : isSessions ? T.newSession : T.newResource}
        subtitle={editingItem ? T.editing(editingItem.title) : T.newSubtitle}
        width="xl"
        footer={undefined}
      >
        {slideOverOpen && (
          <ContentForm
            key={editingItem?.id ?? `new-${activeTab}`}
            item={editingItem}
            onSave={handleSave}
            onCancel={closePanel}
            onDirtyChange={setFormDirty}
            nextGroupId={nextGroup.groupId}
            nextGroupName={nextGroup.groupName}
            categories={categories}
            onManageCategories={() => setCategoriesOpen(true)}
            type={activeTab}
          />
        )}
      </SlideOver>

      <Modal
        open={!!hideTarget}
        onClose={() => setHideTarget(null)}
        title={T.hideTitle}
        size="sm"
        footer={
          <>
            <button
              onClick={() => setHideTarget(null)}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
            >
              {T.cancel}
            </button>
            <button
              onClick={() => {
                const target = hideTarget;
                setHideTarget(null);
                if (target) void handleToggleActive(target);
              }}
              className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90"
            >
              {T.hideConfirm}
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
            <Icon name="EyeSlashIcon" size={18} variant="outline" className="text-warning" />
          </div>
          <p className="text-[13px] text-foreground">{hideTarget ? T.hideBody(hideTarget.title) : ''}</p>
        </div>
      </Modal>

      <CategoryManager
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        categories={categories}
        onChanged={async () => {
          const [c, s] = await Promise.all([listCategories(supabase), listContent(supabase, 'session')]);
          setCategories(c);
          setSessions(s);
        }}
      />
    </div>
  );
}
