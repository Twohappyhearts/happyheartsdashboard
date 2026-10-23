'use client';

import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Toggle from '@/components/ui/Toggle';
import { toast } from 'sonner';
import ChunkSettingsFields, { fromDraft, toDraft, type ChunkSettingsDraft } from './ChunkSettingsFields';
import {
  DEFAULT_CHUNK_SETTINGS,
  KB_SLUG_RE,
  KnowledgeError,
  createKnowledgeBase,
  suggestSlug,
  updateKnowledgeBase,
  type KnowledgeBase,
} from '@/lib/knowledge';

interface Props {
  open: boolean;
  /** null = create a new knowledge base. */
  knowledgeBase: KnowledgeBase | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}

const inputClass =
  'mt-1 w-full px-3 py-2 border border-border rounded-lg text-[13px] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
const labelClass = 'text-[11px] font-600 text-muted-foreground uppercase tracking-wider';

export default function KnowledgeBaseFormModal({ open, knowledgeBase, onClose, onSaved }: Props) {
  const editing = !!knowledgeBase;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [chunk, setChunk] = useState<ChunkSettingsDraft>(toDraft(DEFAULT_CHUNK_SETTINGS));
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(knowledgeBase?.name ?? '');
    setSlug(knowledgeBase?.slug ?? '');
    setSlugTouched(false);
    setDescription(knowledgeBase?.description ?? '');
    setChunk(toDraft(knowledgeBase?.chunkSettings ?? DEFAULT_CHUNK_SETTINGS));
    setActive(knowledgeBase?.active ?? true);
    setError(null);
    setSaving(false);
  }, [open, knowledgeBase]);

  const settings = fromDraft(chunk);
  const problem = !name.trim()
    ? 'Enter a name.'
    : !editing && !KB_SLUG_RE.test(slug)
      ? 'ID must start with a letter and use 2–50 lowercase letters, numbers or underscores.'
      : typeof settings === 'string'
        ? settings
        : null;

  const save = async () => {
    if (problem || typeof settings === 'string') {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const input = {
      name: name.trim(),
      description: description.trim(),
      chunkTargetChars: settings.targetChars,
      chunkOverlapChars: settings.overlapChars,
      chunkToleranceFactor: settings.toleranceFactor,
    };
    try {
      if (knowledgeBase) {
        await updateKnowledgeBase(knowledgeBase.id, { ...input, isActive: active });
        toast.success('Knowledge base saved');
        onSaved(knowledgeBase.id);
      } else {
        const { id } = await createKnowledgeBase({ ...input, slug });
        toast.success(`Created “${input.name}”`);
        onSaved(id);
      }
    } catch (e) {
      setError(e instanceof KnowledgeError ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-3 w-full">
      <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
        Cancel
      </button>
      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60"
      >
        {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
      </button>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Knowledge base settings' : 'New knowledge base'} size="md" footer={footer}>
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>Name</span>
          <input
            value={name}
            maxLength={100}
            autoFocus
            placeholder="e.g. Patient Education"
            onChange={(e) => {
              setName(e.target.value);
              if (!editing && !slugTouched) setSlug(suggestSlug(e.target.value));
            }}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>ID</span>
          <input
            value={slug}
            maxLength={50}
            disabled={editing}
            placeholder="patient_education"
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className={`${inputClass} font-mono`}
          />
          <span className="text-[11px] text-muted-foreground">
            {editing ? 'The ID can’t be changed — the AI assistant uses it to find this knowledge base.' : 'Lowercase letters, numbers and underscores. Used by the AI assistant; can’t be changed later.'}
          </span>
        </label>
        <label className="block">
          <span className={labelClass}>Description</span>
          <textarea
            value={description}
            maxLength={1000}
            rows={2}
            placeholder="What kind of documents go here?"
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </label>
        <div>
          <p className={`${labelClass} mb-2`}>Default chunk settings</p>
          <ChunkSettingsFields value={chunk} onChange={setChunk} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-[12px] font-600 text-foreground">Embedding model</p>
            <p className="text-[11px] text-muted-foreground">Not set — added when vector search is switched on.</p>
          </div>
          <span className="text-[12px] text-muted-foreground font-mono">{knowledgeBase?.embeddingModel ?? '—'}</span>
        </div>
        {editing && (
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-[12px] font-600 text-foreground">Use in AI</p>
              <p className="text-[11px] text-muted-foreground">When off, the AI assistant ignores every document in this knowledge base.</p>
            </div>
            <Toggle checked={active} onChange={setActive} />
          </div>
        )}
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
