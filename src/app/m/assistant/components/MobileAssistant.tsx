'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
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
import { bearerAuth, inApp, installBridge, onTokenChange, postToApp, requestFreshToken, waitForToken } from '@/lib/agent-bridge';
import MobileConversationList from './MobileConversationList';
import MobileChatThread from './MobileChatThread';

/** Colors of the Flutter app's AppTheme, mapped onto the dashboard's CSS variables. */
const APP_THEME = {
  '--background': '#F8FAFC',
  '--foreground': '#1E293B',
  '--primary': '#3B82F6',
  '--primary-foreground': '#FFFFFF',
  '--secondary': '#F1F5F9',
  '--secondary-foreground': '#475569',
  '--muted': '#F1F5F9',
  '--muted-foreground': '#64748B',
  '--card': '#FFFFFF',
  '--card-foreground': '#1E293B',
  '--border': '#E2E8F0',
  '--input': '#E2E8F0',
  '--ring': '#3B82F6',
  '--success': '#16A34A',
  '--warning': '#F59E0B',
  '--danger': '#EF4444',
} as React.CSSProperties;

type Thread = { key: string; conversationId: string | null; messages: UIMessage[]; loading?: boolean };
type Phase = 'connecting' | 'ready' | 'no-app' | 'error';

const newThread = (): Thread => ({ key: `new-${Date.now()}`, conversationId: null, messages: [] });

/** How many conversations at the top of the list are loaded ahead, so opening them is instant. */
const PREFETCH = 5;

export default function MobileAssistant() {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [view, setView] = useState<'chat' | 'list'>('chat');
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread>(newThread);
  const [deleteTarget, setDeleteTarget] = useState<AgentConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const currentId = useRef<string | null>(null);
  /** conversationId → its messages, as last seen (loaded, prefetched, or updated by the open chat). */
  const cache = useRef(new Map<string, UIMessage[]>());
  const inflight = useRef(new Map<string, Promise<UIMessage[]>>());

  /** Load a conversation's messages once; concurrent callers share the request. */
  const fetchMessages = useCallback((id: string) => {
    const running = inflight.current.get(id);
    if (running) return running;
    const p = loadAgentMessages(id, bearerAuth)
      .then(({ messages }) => {
        const ui = historyToUIMessages(messages);
        cache.current.set(id, ui);
        return ui;
      })
      .finally(() => inflight.current.delete(id));
    inflight.current.set(id, p);
    return p;
  }, []);

  const prefetch = useCallback(
    (list: AgentConversation[]) => {
      list
        .slice(0, PREFETCH)
        .filter((c) => !cache.current.has(c.id))
        .forEach((c) => void fetchMessages(c.id).catch(() => undefined));
    },
    [fetchMessages],
  );

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true);
    try {
      const list = await listAgentConversations(bearerAuth);
      setConversations(list);
      setListError(null);
      prefetch(list);
    } catch (e) {
      if (e instanceof AgentChatError && e.status === 401) requestFreshToken();
      setListError(e instanceof AgentChatError ? e.message : 'Could not load your conversations.');
    } finally {
      setListLoading(false);
    }
  }, [prefetch]);

  // Wait for the app to hand over the patient's token.
  useEffect(() => {
    installBridge();
    const off = onTokenChange((t) => t && setPhase('ready'));
    waitForToken(inApp() ? 15_000 : 2_000)
      .then(() => {
        setPhase('ready');
        void loadList();
      })
      .catch(() => setPhase(inApp() ? 'error' : 'no-app'));
    return () => {
      off();
    };
  }, [loadList]);

  // Links in answers open in the phone's browser, not inside the chat.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      const href = a?.getAttribute('href');
      if (!href || !/^(https?:|mailto:|tel:)/i.test(href) || !inApp()) return;
      e.preventDefault();
      postToApp('open_url', href);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const startNew = () => {
    currentId.current = null;
    setThread(newThread());
    setView('chat');
  };

  /** Switch right away; show cached messages instantly, otherwise a spinner while they load. */
  const open = async (id: string) => {
    setListError(null);
    if (id === currentId.current) {
      setView('chat');
      return;
    }
    currentId.current = id;
    const cached = cache.current.get(id);
    if (cached) {
      setThread({ key: id, conversationId: id, messages: cached });
      setView('chat');
      return;
    }
    setThread({ key: `loading-${id}`, conversationId: id, messages: [], loading: true });
    setView('chat');
    try {
      const messages = await fetchMessages(id);
      if (currentId.current === id) setThread({ key: id, conversationId: id, messages });
    } catch (e) {
      if (currentId.current !== id) return;
      if (e instanceof AgentChatError && e.status === 401) requestFreshToken();
      currentId.current = null;
      setThread(newThread());
      setView('list');
      setListError(e instanceof AgentChatError ? e.message : 'Could not open this conversation.');
    }
  };

  /** The open chat reports its messages, so coming back to it is instant and up to date. */
  const rememberMessages = useCallback((id: string, messages: UIMessage[]) => {
    cache.current.set(id, messages);
  }, []);

  const applyTitle = useCallback((id: string, title: string) => {
    setConversations((list) => {
      if (list.some((c) => c.id === id)) return list.map((c) => (c.id === id ? { ...c, title } : c));
      const now = new Date().toISOString();
      return [{ id, title, lastMessageAt: now, createdAt: now }, ...list];
    });
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAgentConversation(deleteTarget.id, bearerAuth);
      setConversations((list) => list.filter((c) => c.id !== deleteTarget.id));
      cache.current.delete(deleteTarget.id);
      if (deleteTarget.id === currentId.current) startNew();
      setDeleteTarget(null);
    } catch (e) {
      setListError(e instanceof AgentChatError ? e.message : 'Could not delete the conversation.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const title = thread.conversationId
    ? conversationTitle(conversations.find((c) => c.id === thread.conversationId) ?? { title: null })
    : 'New conversation';

  return (
    <div style={APP_THEME} className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      {phase !== 'ready' ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
          {phase === 'connecting' ? (
            <Icon name="ArrowPathIcon" size={22} variant="outline" className="animate-spin text-muted-foreground" />
          ) : (
            <>
              <Icon name="LockClosedIcon" size={28} variant="outline" className="text-muted-foreground" />
              <p className="text-[14px] text-secondary-foreground">
                {phase === 'no-app' ? 'Open the AI assistant from the HappyHearts app.' : 'Please sign in to the HappyHearts app again.'}
              </p>
            </>
          )}
        </div>
      ) : view === 'list' ? (
        <MobileConversationList
          conversations={conversations}
          activeId={thread.conversationId}
          loading={listLoading}
          error={listError}
          onBack={() => setView('chat')}
          onOpen={(id) => void open(id)}
          onNew={startNew}
          onDelete={setDeleteTarget}
          onRetry={() => void loadList()}
        />
      ) : thread.loading ? (
        <>
          <div className="h-12 shrink-0 px-2 flex items-center gap-1 border-b border-border bg-card">
            <button onClick={() => setView('list')} className="p-2 rounded-lg active:bg-muted" aria-label="Your conversations">
              <Icon name="Bars3Icon" size={20} variant="outline" />
            </button>
            <p className="flex-1 min-w-0 text-[15px] font-600 truncate">{title}</p>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <Icon name="ArrowPathIcon" size={20} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        </>
      ) : (
        <MobileChatThread
          key={thread.key}
          conversationId={thread.conversationId}
          title={title}
          initialMessages={thread.messages}
          onShowList={() => {
            setView('list');
            void loadList(true);
          }}
          onNew={startNew}
          onConversationCreated={(id) => {
            currentId.current = id;
            setThread((t) => ({ ...t, conversationId: id }));
            void loadList(true);
          }}
          onTitle={applyTitle}
          onTurnFinished={() => void loadList(true)}
          onMessagesChange={rememberMessages}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative w-full bg-card rounded-t-2xl px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h3 className="text-[16px] font-700">Delete this conversation?</h3>
            <p className="text-[14px] text-secondary-foreground mt-1.5 mb-5">
              “{conversationTitle(deleteTarget)}” will be removed from your list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 h-12 rounded-xl border border-border text-[15px] font-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 h-12 rounded-xl bg-danger text-white text-[15px] font-600 disabled:opacity-60"
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
