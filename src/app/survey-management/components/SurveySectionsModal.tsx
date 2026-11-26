'use client';

import React, { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import {
  SECTION_NAME_MAX,
  SurveyError,
  createCategory,
  deleteCategory,
  renameCategory,
  reorderCategories,
  type SurveyCategory,
} from '@/lib/surveys';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  open: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  categories: SurveyCategory[];
  /** Section name -> number of survey links in it. */
  usage: Map<string, number>;
  /** Reload sections and survey links (a rename or delete changes the links too). */
  onChanged: () => Promise<void>;
}

const inputClass =
  'w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const iconButton =
  'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-100 disabled:opacity-30 disabled:pointer-events-none';

export default function SurveySectionsModal({ open, onClose, supabase, categories, usage, onChanged }: Props) {
  const { t } = useStaffT();
  const S = t.surveys.sections;
  const [items, setItems] = useState<SurveyCategory[]>(categories);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setItems(categories), [categories]);

  useEffect(() => {
    if (open) return;
    setNewName('');
    setEditingId(null);
    setConfirmId(null);
  }, [open]);

  const fail = (e: unknown, fallback: string) => toast.error(e instanceof SurveyError ? e.message : fallback);

  const add = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error(S.nameRequired);
      return;
    }
    setAdding(true);
    try {
      const created = await createCategory(supabase, name);
      setNewName('');
      toast.success(S.added(created.name));
      await onChanged();
    } catch (e) {
      fail(e, S.errors.add);
    } finally {
      setAdding(false);
    }
  };

  const startRename = (c: SurveyCategory) => {
    setConfirmId(null);
    setEditingId(c.id);
    setEditName(c.name);
  };

  const saveRename = async (c: SurveyCategory) => {
    const name = editName.trim();
    if (!name) {
      toast.error(S.nameRequired);
      return;
    }
    if (name === c.name) {
      setEditingId(null);
      return;
    }
    setBusyId(c.id);
    try {
      await renameCategory(supabase, c.id, name);
      setEditingId(null);
      toast.success(S.renamed);
      await onChanged();
    } catch (e) {
      fail(e, S.errors.rename);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: SurveyCategory) => {
    setBusyId(c.id);
    try {
      await deleteCategory(supabase, c.id);
      setConfirmId(null);
      toast.success(S.deleted(c.name));
      await onChanged();
    } catch (e) {
      fail(e, S.errors.delete);
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    try {
      await reorderCategories(supabase, next.map((c) => c.id));
      await onChanged();
    } catch (e) {
      setItems(previous);
      fail(e, S.errors.reorder);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={S.title} size="md">
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-4 text-center">{S.empty}</p>
        ) : (
          <ul className="border border-border rounded-xl divide-y divide-border overflow-hidden">
            {items.map((c, i) => {
              const count = usage.get(c.name) ?? 0;
              const busy = busyId === c.id;
              if (confirmId === c.id) {
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 bg-danger/5">
                    <p className="flex-1 min-w-0 text-[13px] text-foreground">{S.deleteConfirm(c.name, count)}</p>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
                    >
                      {S.cancel}
                    </button>
                    <button
                      onClick={() => remove(c)}
                      disabled={busy}
                      className="px-3 py-1.5 bg-danger text-white rounded-lg text-[12px] font-600 hover:opacity-90 transition-opacity duration-150 disabled:opacity-60"
                    >
                      {S.delete}
                    </button>
                  </li>
                );
              }
              if (editingId === c.id) {
                return (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                    <input
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      value={editName}
                      maxLength={SECTION_NAME_MAX}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          saveRename(c);
                        } else if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditingId(null);
                        }
                      }}
                      aria-label={S.rename}
                      className={inputClass}
                    />
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150 shrink-0"
                    >
                      {S.cancel}
                    </button>
                    <button
                      onClick={() => saveRename(c)}
                      disabled={busy}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-600 hover:opacity-90 transition-opacity duration-150 disabled:opacity-60 shrink-0"
                    >
                      {S.save}
                    </button>
                  </li>
                );
              }
              return (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors duration-100">
                  <span className="flex-1 min-w-0 truncate text-[13px] font-500 text-foreground">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0 mr-1">{S.surveys(count)}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} title={S.moveUp} aria-label={S.moveUp} className={iconButton}>
                    <Icon name="ChevronUpIcon" size={14} variant="outline" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    title={S.moveDown}
                    aria-label={S.moveDown}
                    className={iconButton}
                  >
                    <Icon name="ChevronDownIcon" size={14} variant="outline" />
                  </button>
                  <button onClick={() => startRename(c)} title={S.rename} aria-label={S.rename} className={iconButton}>
                    <Icon name="PencilIcon" size={14} variant="outline" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setConfirmId(c.id);
                    }}
                    title={S.delete}
                    aria-label={S.delete}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors duration-100"
                  >
                    <Icon name="TrashIcon" size={14} variant="outline" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={newName}
            maxLength={SECTION_NAME_MAX}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={S.namePlaceholder}
            aria-label={S.namePlaceholder}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-50 shrink-0"
          >
            <Icon name="PlusIcon" size={14} variant="outline" />
            {S.add}
          </button>
        </form>
      </div>
    </Modal>
  );
}
