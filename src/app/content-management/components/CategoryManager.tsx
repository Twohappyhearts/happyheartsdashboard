'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import Toggle from '@/components/ui/Toggle';
import { createClient } from '@/lib/supabase/client';
import {
  ContentError,
  createCategory,
  deleteCategory,
  updateCategory,
  type ContentCategory,
} from '@/lib/content';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  open: boolean;
  onClose: () => void;
  categories: ContentCategory[];
  /** Reload categories (and content, whose category names may have changed). */
  onChanged: () => Promise<void>;
}

/**
 * Staff manage the category list used by the app's category filter.
 * Order here = order of the filter buttons in the app. Categories still used
 * by content can't be deleted (database rule) — deactivate them instead.
 */
export default function CategoryManager({ open, onClose, categories, onChanged }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const T = useStaffT().t.content.categories;
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  // A typed new category or a changed name not saved yet: closing asks before discarding it.
  const renamedFrom = editing ? categories.find((c) => c.id === editing.id)?.name : undefined;
  const dirty = newName.trim() !== '' || (editing !== null && editing.name.trim() !== (renamedFrom ?? '').trim());
  const close = () => {
    setNewName('');
    setEditing(null);
    onClose();
  };

  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await work();
      await onChanged();
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(e instanceof ContentError ? e.message : T.failed);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const nextOrder = sorted.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
    if (await run(() => createCategory(supabase, name, nextOrder), T.added(name))) setNewName('');
  };

  const rename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    if (await run(() => updateCategory(supabase, editing.id, { name }), T.renamed)) setEditing(null);
  };

  /** Swap positions with the neighbour, then renumber 1..n so orders stay clean. */
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void run(
      async () => {
        await Promise.all(
          reordered
            .map((c, i) => ({ c, order: i + 1 }))
            .filter(({ c, order }) => c.sortOrder !== order)
            .map(({ c, order }) => updateCategory(supabase, c.id, { sortOrder: order }))
        );
      },
      T.orderUpdated
    );
  };

  return (
    <Modal open={open} onClose={close} title={T.title} size="md" dirty={dirty}>
      <div className="space-y-4">
        <p className="text-[12px] text-muted-foreground">{T.intro}</p>

        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {sorted.length === 0 && (
            <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">{T.none}</li>
          )}
          {sorted.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2.5 bg-card">
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={busy || i === 0}
                  title={T.moveUp}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <Icon name="ChevronUpIcon" size={12} variant="outline" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={busy || i === sorted.length - 1}
                  title={T.moveDown}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <Icon name="ChevronDownIcon" size={12} variant="outline" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                {editing?.id === c.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editing.name}
                      maxLength={60}
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void rename();
                        if (e.key === 'Escape') {
                          // Cancels only this rename; the dialog stays open.
                          e.preventDefault();
                          setEditing(null);
                        }
                      }}
                      className="flex-1 px-2 py-1 border border-border rounded-md text-[13px] bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={() => void rename()}
                      disabled={busy}
                      className="px-2 py-1 bg-primary text-primary-foreground rounded-md text-[11.5px] font-600 disabled:opacity-60"
                    >
                      {T.save}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="px-2 py-1 border border-border rounded-md text-[11.5px] font-500"
                    >
                      {T.cancel}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className={`text-[13px] font-600 truncate ${c.isActive ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                      {c.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {T.items(c.usageCount)}
                      {c.isActive ? '' : T.hiddenSuffix}
                    </p>
                  </>
                )}
              </div>

              {editing?.id !== c.id && (
                <>
                  <Toggle
                    checked={c.isActive}
                    disabled={busy}
                    onChange={(val) =>
                      void run(
                        () => updateCategory(supabase, c.id, { isActive: val }),
                        val ? T.visible(c.name) : T.hidden(c.name)
                      )
                    }
                  />
                  <button
                    onClick={() => setEditing({ id: c.id, name: c.name })}
                    disabled={busy}
                    title={T.rename}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Icon name="PencilIcon" size={14} variant="outline" />
                  </button>
                  <button
                    onClick={() => void run(() => deleteCategory(supabase, c.id), T.deleted(c.name))}
                    disabled={busy || c.usageCount > 0}
                    title={c.usageCount > 0 ? T.inUse : T.delete}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    <Icon name="TrashIcon" size={14} variant="outline" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <input
            value={newName}
            maxLength={60}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            placeholder={T.newPlaceholder}
            className="flex-1 px-3 py-2 border border-border rounded-lg text-[13px] bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => void add()}
            disabled={busy || !newName.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="PlusIcon" size={14} variant="outline" />
            {T.add}
          </button>
        </div>
      </div>
    </Modal>
  );
}
