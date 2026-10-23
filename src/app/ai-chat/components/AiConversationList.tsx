'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { conversationTitle, type AgentConversation } from '@/lib/agent-chat';
import { formatListTime } from '@/app/messages/components/format';

interface Props {
  conversations: AgentConversation[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onNewChat: () => void;
  onDelete: (conversation: AgentConversation) => void;
}

export default function AiConversationList({ conversations, activeId, loading, error, onSelect, onRetry, onNewChat, onDelete }: Props) {
  return (
    <aside className="w-[300px] xl:w-[320px] shrink-0 flex flex-col bg-card">
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-[17px] font-700 text-foreground">AI Chat</h1>
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-600 hover:opacity-90 transition-opacity"
            title="Start a new conversation with the assistant"
          >
            <Icon name="PencilSquareIcon" size={14} variant="outline" />
            New
          </button>
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-1.5">Try the patient assistant. Your test chats are private to you.</p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex justify-center py-10">
            <Icon name="ArrowPathIcon" size={18} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[12.5px] text-danger mb-2">{error}</p>
            <button onClick={onRetry} className="text-[12.5px] font-600 text-primary hover:underline">
              Try again
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">No conversations yet.</p>
        ) : (
          <ul className="py-1">
            {conversations.map((c) => (
              <li key={c.id} className="relative group">
                <button
                  onClick={() => onSelect(c.id)}
                  className={`w-full text-left pl-4 pr-10 py-3 flex items-center gap-3 border-l-2 transition-colors ${
                    c.id === activeId ? 'bg-primary/5 border-primary' : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon name="SparklesIcon" size={15} variant="outline" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-600 text-foreground truncate">{conversationTitle(c)}</p>
                    <p className="text-[11px] text-muted-foreground">{formatListTime(c.lastMessageAt ?? c.createdAt)}</p>
                  </div>
                </button>
                <button
                  onClick={() => onDelete(c)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title="Delete conversation"
                  aria-label={`Delete ${conversationTitle(c)}`}
                >
                  <Icon name="TrashIcon" size={14} variant="outline" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
