'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UIMessage } from 'ai';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import {
  AgentChatError,
  conversationTitle,
  deleteAgentConversation,
  historyToUIMessages,
  listAgentConversations,
  loadAgentMessages,
  type AgentConversation,
} from '@/lib/agent-chat';
import AiConversationList from './AiConversationList';
import AiChatThread from './AiChatThread';

type Loaded = { key: string; conversationId: string | null; messages: UIMessage[] };

export default function AiChatClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlId = searchParams.get('c');

  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // The open thread. A new chat keeps its key when the server assigns an id,
  // so the stream in progress is not interrupted by the URL change.
  const [thread, setThread] = useState<Loaded | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const createdId = useRef<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AgentConversation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true);
    try {
      const list = await listAgentConversations();
      setConversations(list);
      setListError(null);
      return list;
    } catch (e) {
      setListError(e instanceof AgentChatError ? e.message : 'Could not load conversations.');
      return null;
    } finally {
      setListLoading(false);
    }
  }, []);

  /** The title arrives over the chat stream; show it right away (the list may not have the row yet). */
  const applyTitle = useCallback((id: string, title: string) => {
    setConversations((list) => {
      if (list.some((c) => c.id === id)) return list.map((c) => (c.id === id ? { ...c, title } : c));
      const now = new Date().toISOString();
      return [{ id, title, lastMessageAt: now, createdAt: now }, ...list];
    });
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!urlId) {
      setThread((t) => (t && t.conversationId === null ? t : { key: `new-${Date.now()}`, conversationId: null, messages: [] }));
      return;
    }
    if (urlId === createdId.current) return; // the chat we just started; already open
    let cancelled = false;
    setThread(null);
    setThreadError(null);
    loadAgentMessages(urlId)
      .then(({ messages }) => {
        if (cancelled) return;
        setThread({
          key: urlId,
          conversationId: urlId,
          messages: historyToUIMessages(messages),
        });
      })
      .catch((e) => {
        if (!cancelled) setThreadError(e instanceof AgentChatError ? e.message : 'Could not load this conversation.');
      });
    return () => {
      cancelled = true;
    };
  }, [urlId]);

  const select = (id: string) => {
    createdId.current = null;
    router.push(`/ai-chat?c=${encodeURIComponent(id)}`);
  };

  const newChat = () => {
    createdId.current = null;
    setThread({ key: `new-${Date.now()}`, conversationId: null, messages: [] });
    router.push('/ai-chat');
  };

  const onCreated = (id: string) => {
    createdId.current = id;
    router.replace(`/ai-chat?c=${encodeURIComponent(id)}`);
    void loadList(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAgentConversation(deleteTarget.id);
      setConversations((list) => list.filter((c) => c.id !== deleteTarget.id));
      if (deleteTarget.id === (thread?.conversationId ?? urlId)) newChat();
      toast.success('Conversation deleted');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof AgentChatError ? e.message : 'Could not delete the conversation.');
    } finally {
      setDeleting(false);
    }
  };

  const active = conversations.find((c) => c.id === (thread?.conversationId ?? urlId));

  return (
    <div className="h-full flex bg-card">
      <AiConversationList
        conversations={conversations}
        activeId={urlId}
        loading={listLoading}
        error={listError}
        onSelect={select}
        onRetry={() => loadList()}
        onNewChat={newChat}
        onDelete={setDeleteTarget}
      />
      <div className="flex-1 min-w-0 border-l border-border flex flex-col">
        {threadError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-background">
            <p className="text-[13px] text-danger">{threadError}</p>
            <button onClick={newChat} className="text-[13px] font-600 text-primary hover:underline">
              Start a new conversation
            </button>
          </div>
        ) : !thread ? (
          <div className="flex-1 flex items-center justify-center bg-background">
            <Icon name="ArrowPathIcon" size={20} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AiChatThread
            key={thread.key}
            conversationId={thread.conversationId}
            title={active ? conversationTitle(active) : thread.conversationId ? 'Conversation' : 'New conversation'}
            initialMessages={thread.messages}
            onConversationCreated={onCreated}
            onTurnFinished={() => void loadList(true)}
            onTitle={applyTitle}
          />
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 fade-in">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-card rounded-xl shadow-modal p-6 w-full max-w-sm scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                <Icon name="ExclamationTriangleIcon" size={20} variant="outline" className="text-danger" />
              </div>
              <h3 className="text-[15px] font-600 text-foreground">Delete conversation?</h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              “{conversationTitle(deleteTarget)}” will be removed from your list and the assistant will no longer use it.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 active:scale-95 disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
