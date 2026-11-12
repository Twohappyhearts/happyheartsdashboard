'use client';

import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import { KnowledgeError, updateDocument, type KnowledgeDocument } from '@/lib/knowledge';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  doc: KnowledgeDocument | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  'mt-1 w-full px-3 py-2 border border-border rounded-lg text-[13px] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export default function DocumentEditModal({ doc, onClose, onSaved }: Props) {
  const T = useStaffT().t.kb.docEdit;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title);
    setDescription(doc.description);
    setSaving(false);
    setError(null);
  }, [doc]);

  const save = async () => {
    if (!doc) return;
    if (!title.trim()) {
      setError(T.enterTitle);
      return;
    }
    setSaving(true);
    try {
      await updateDocument(doc.id, { title: title.trim(), description: description.trim() });
      toast.success(T.saved);
      onSaved();
    } catch (e) {
      setError(e instanceof KnowledgeError ? e.message : T.saveFailed);
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title={T.title}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
            {T.cancel}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60"
          >
            {saving ? T.saving : T.save}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.fieldTitle}</span>
          <input value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          <span className="text-[11px] text-muted-foreground">{T.titleHint}</span>
        </label>
        <label className="block">
          <span className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.description}</span>
          <textarea
            value={description}
            maxLength={1000}
            rows={3}
            placeholder={T.descriptionPlaceholder}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </label>
        {doc && <p className="text-[11px] text-muted-foreground">{T.file(doc.fileName)}</p>}
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
