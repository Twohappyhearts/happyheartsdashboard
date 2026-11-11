'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { AgentConversation } from '@/lib/agent-chat';
import { formatListTimeIn } from '@/lib/i18n/patient';
import { usePatientText } from '@/lib/i18n/patient-context';

interface Props {
  conversations: AgentConversation[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (c: AgentConversation) => void;
  onRetry: () => void;
}

export default function MobileConversationList({ conversations, activeId, loading, error, onBack, onOpen, onNew, onDelete, onRetry }: Props) {
  const { t, lang } = usePatientText();
  const titleOf = (c: AgentConversation) => c.title?.trim() || t.newConversation;
  return (
    <>
      <div className="h-12 shrink-0 px-2 flex items-center gap-1 border-b border-border bg-card">
        <button onClick={onBack} className="p-2 rounded-lg active:bg-muted" aria-label={t.backToChat}>
          <Icon name="ChevronLeftIcon" size={20} variant="outline" className="rtl:rotate-180" />
        </button>
        <p className="flex-1 text-[15px] font-600">{t.yourConversations}</p>
        <button onClick={onNew} className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[13px] font-600">
          <Icon name="PlusIcon" size={15} variant="outline" />
          {t.newChat}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-danger/10 text-danger text-[13px] flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={onRetry} className="font-600 underline shrink-0">
              {t.retry}
            </button>
          </div>
        )}
        {loading && conversations.length === 0 ? (
          <div className="flex justify-center py-12">
            <Icon name="ArrowPathIcon" size={20} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-center text-[14px] text-muted-foreground py-12 px-8">{t.noConversations}</p>
        ) : (
          <ul className="py-1">
            {conversations.map((c) => (
              <li key={c.id} className={`flex items-center border-b border-border/60 ${c.id === activeId ? 'bg-primary/5' : ''}`}>
                <button onClick={() => onOpen(c.id)} className="flex-1 min-w-0 text-start ps-4 pe-2 py-3.5 active:bg-muted">
                  <p dir="auto" className="text-[15px] font-600 truncate text-start">
                    {titleOf(c)}
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{formatListTimeIn(lang, c.lastMessageAt ?? c.createdAt)}</p>
                </button>
                <button
                  onClick={() => onDelete(c)}
                  className="p-3 me-1 rounded-lg text-muted-foreground active:bg-danger/10 active:text-danger"
                  aria-label={t.deleteConversation(titleOf(c))}
                >
                  <Icon name="TrashIcon" size={18} variant="outline" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
