'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ChatError,
  compareMessages,
  deleteMessage,
  editMessage,
  fetchPage,
  fetchProfiles,
  fetchSince,
  getConversation,
  listConversations,
  messageHistory,
  newMessageId,
  purgeMessage,
  restoreMessage,
  sendMessage,
  subscribeToAllMessages,
  type ChatMessage,
  type ConversationSummary,
  type MessageRevision,
} from '@/lib/chat';
import ConversationList from './ConversationList';
import ChatThread from './ChatThread';
import NewChatModal from './NewChatModal';
import { staffText } from '@/lib/i18n/staff';

export interface ThreadState {
  byId: Record<string, ChatMessage>;
  hasMore: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  loaded: boolean;
}

const emptyThread = (): ThreadState => ({
  byId: {},
  hasMore: false,
  loading: false,
  loadingOlder: false,
  error: null,
  loaded: false,
});

/** Merge by id. A confirmed ('sent') copy is never downgraded to pending/failed. */
function mergeInto(byId: Record<string, ChatMessage>, msgs: ChatMessage[]) {
  const next = { ...byId };
  for (const m of msgs) {
    const prev = next[m.id];
    if (prev && prev.state === 'sent' && m.state !== 'sent') continue;
    next[m.id] = m;
  }
  return next;
}

const newer = (a: ChatMessage | null, b: ChatMessage) => (!a || compareMessages(a, b) < 0 ? b : a);

export default function MessagesClient() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('c');

  const [conversations, setConversations] = useState<Record<string, ConversationSummary>>({});
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ThreadState>>({});
  const [failReasons, setFailReasons] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const namesRef = useRef(names);
  namesRef.current = names;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const fetchingConv = useRef(new Set<string>());

  const updateThread = useCallback((id: string, fn: (t: ThreadState) => ThreadState) => {
    setThreads((all) => ({ ...all, [id]: fn(all[id] ?? emptyThread()) }));
  }, []);

  const bumpSummary = useCallback((m: ChatMessage) => {
    if (m.state !== 'sent') return;
    setConversations((all) => {
      const c = all[m.conversationId];
      if (!c) return all;
      const last = newer(c.lastMessage, m);
      return { ...all, [c.id]: { ...c, lastMessage: last, lastMessageAt: last.createdAt } };
    });
  }, []);

  const ensureNames = useCallback(
    async (msgs: ChatMessage[]) => {
      const missing = Array.from(
        new Set(
          msgs
            .filter((m) => m.senderRole === 'team' && m.senderId && !(m.senderId in namesRef.current))
            .map((m) => m.senderId as string)
        )
      );
      if (missing.length === 0) return;
      // Mark as requested so we don't refetch while in flight.
      setNames((n) => ({ ...n, ...Object.fromEntries(missing.map((id) => [id, n[id] ?? ''])) }));
      const rows = await fetchProfiles(supabase, missing);
      setNames((n) => ({
        ...n,
        ...Object.fromEntries(rows.map((p) => [p.id, p.fullName || (p.username ? `@${p.username}` : '')])),
      }));
    },
    [supabase]
  );

  // ---- Conversation list -------------------------------------------------------
  const loadList = useCallback(
    async (silent = false) => {
      if (!silent) setListLoading(true);
      try {
        const list = await listConversations(supabase);
        setConversations((prev) => {
          const next: Record<string, ConversationSummary> = {};
          for (const c of list) {
            const old = prev[c.id];
            const last = old?.lastMessage && c.lastMessage ? newer(old.lastMessage, c.lastMessage) : c.lastMessage ?? old?.lastMessage ?? null;
            next[c.id] = { ...c, lastMessage: last, lastMessageAt: last?.createdAt ?? c.lastMessageAt };
          }
          // Keep conversations opened locally that the list query hasn't returned yet.
          for (const id of Object.keys(prev)) if (!next[id]) next[id] = prev[id];
          return next;
        });
        setListError(null);
      } catch (e) {
        setListError(e instanceof ChatError ? e.message : staffText().messages.loadListFailed);
      } finally {
        setListLoading(false);
      }
    },
    [supabase]
  );

  const addConversation = useCallback(
    async (id: string) => {
      if (conversationsRef.current[id] || fetchingConv.current.has(id)) return;
      fetchingConv.current.add(id);
      try {
        const c = await getConversation(supabase, id);
        if (c) setConversations((all) => (all[id] ? all : { ...all, [id]: c }));
      } catch {
        /* surfaced on next list refresh */
      } finally {
        fetchingConv.current.delete(id);
      }
    },
    [supabase]
  );

  // ---- Thread loading -----------------------------------------------------------
  const loadThread = useCallback(
    async (id: string, force = false) => {
      const t = threadsRef.current[id];
      if (!force && (t?.loaded || t?.loading)) return;
      updateThread(id, (s) => ({ ...s, loading: true, error: null }));
      try {
        const page = await fetchPage(supabase, id);
        updateThread(id, (s) => ({
          ...s,
          byId: mergeInto(s.byId, page.messages),
          hasMore: page.hasMore,
          loading: false,
          loaded: true,
        }));
        const last = page.messages[page.messages.length - 1];
        if (last) bumpSummary(last);
        void ensureNames(page.messages);
      } catch (e) {
        updateThread(id, (s) => ({
          ...s,
          loading: false,
          error: e instanceof ChatError ? e.message : staffText().messages.loadFailed,
        }));
      }
    },
    [supabase, updateThread, bumpSummary, ensureNames]
  );

  const loadOlder = useCallback(
    async (id: string) => {
      const t = threadsRef.current[id];
      if (!t || !t.hasMore || t.loadingOlder || t.loading) return;
      const oldest = Object.values(t.byId)
        .filter((m) => m.state === 'sent')
        .sort(compareMessages)[0];
      if (!oldest) return;
      updateThread(id, (s) => ({ ...s, loadingOlder: true }));
      try {
        const page = await fetchPage(supabase, id, oldest);
        updateThread(id, (s) => ({
          ...s,
          byId: mergeInto(s.byId, page.messages),
          hasMore: page.hasMore,
          loadingOlder: false,
        }));
        void ensureNames(page.messages);
      } catch {
        updateThread(id, (s) => ({ ...s, loadingOlder: false }));
      }
    },
    [supabase, updateThread, ensureNames]
  );

  const resyncActive = useCallback(async () => {
    const id = activeRef.current;
    const t = id ? threadsRef.current[id] : undefined;
    if (!id || !t?.loaded) return;
    const confirmed = Object.values(t.byId).filter((m) => m.state === 'sent').sort(compareMessages);
    const lastSent = confirmed[confirmed.length - 1];
    try {
      const since = lastSent
        ? new Date(Date.parse(lastSent.createdAt) - 5000).toISOString()
        : new Date(0).toISOString();
      const missed = await fetchSince(supabase, id, since);
      updateThread(id, (s) => ({ ...s, byId: mergeInto(s.byId, missed) }));
      void ensureNames(missed);
    } catch {
      /* keep what we have */
    }
  }, [supabase, updateThread, ensureNames]);

  // ---- Realtime -----------------------------------------------------------------
  const handleIncoming = useCallback(
    (m: ChatMessage) => {
      if (threadsRef.current[m.conversationId]?.loaded) {
        updateThread(m.conversationId, (s) => ({ ...s, byId: mergeInto(s.byId, [m]) }));
      }
      if (conversationsRef.current[m.conversationId]) {
        bumpSummary(m);
      } else {
        void addConversation(m.conversationId).then(() => bumpSummary(m));
      }
      void ensureNames([m]);
      if (m.senderRole === 'user' && m.conversationId !== activeRef.current) {
        const c = conversationsRef.current[m.conversationId];
        const who = c ? c.patient.fullName || `@${c.patient.username}` : staffText().messages.aPatient;
        toast(staffText().messages.newMessageFrom(who), { description: m.content.slice(0, 120) });
      }
    },
    [updateThread, bumpSummary, addConversation, ensureNames]
  );

  /** An edited or deleted message (Realtime UPDATE, or our own action): replace it by id. */
  const handleUpdated = useCallback(
    (m: ChatMessage) => {
      if (threadsRef.current[m.conversationId]?.loaded) {
        updateThread(m.conversationId, (s) => ({ ...s, byId: { ...s.byId, [m.id]: m } }));
      }
      setConversations((all) => {
        const c = all[m.conversationId];
        if (!c || c.lastMessage?.id !== m.id) return all;
        return { ...all, [c.id]: { ...c, lastMessage: m } };
      });
    },
    [updateThread]
  );

  const handleIncomingRef = useRef(handleIncoming);
  handleIncomingRef.current = handleIncoming;
  const handleUpdatedRef = useRef(handleUpdated);
  handleUpdatedRef.current = handleUpdated;
  const wasConnected = useRef(false);

  useEffect(() => {
    if (!user) return;
    void loadList();
    let channel: RealtimeChannel | null = subscribeToAllMessages(
      supabase,
      `${user.id}:${Date.now()}`,
      (m) => handleIncomingRef.current(m),
      (m) => handleUpdatedRef.current(m),
      (ok) => {
        setConnected(ok);
        if (ok && wasConnected.current === false) {
          // (Re)connected: recover anything missed while offline.
          void loadList(true);
          void resyncActive();
        }
        wasConnected.current = ok;
      }
    );

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadList(true);
        void resyncActive();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      wasConnected.current = false;
    };
  }, [supabase, user, loadList, resyncActive]);

  // Load the selected thread (and make sure it's in the list, e.g. from a deep link).
  useEffect(() => {
    if (!activeId) return;
    void loadThread(activeId);
    if (!listLoading) void addConversation(activeId);
  }, [activeId, listLoading, loadThread, addConversation]);

  // ---- Sending --------------------------------------------------------------------
  const deliver = useCallback(
    async (m: ChatMessage) => {
      try {
        const saved = await sendMessage(supabase, m.conversationId, m.id, m.content);
        updateThread(m.conversationId, (s) => ({ ...s, byId: mergeInto(s.byId, [saved]) }));
        bumpSummary(saved);
        setFailReasons((f) => {
          if (!(m.id in f)) return f;
          const { [m.id]: _drop, ...rest } = f;
          return rest;
        });
      } catch (e) {
        const reason =
          e instanceof ChatError ? e.message : staffText().messages.unreachable;
        updateThread(m.conversationId, (s) => ({
          ...s,
          byId: mergeInto(s.byId, [{ ...m, state: 'failed' }]),
        }));
        setFailReasons((f) => ({ ...f, [m.id]: reason }));
      }
    },
    [supabase, updateThread, bumpSummary]
  );

  const send = useCallback(
    (conversationId: string, text: string) => {
      const content = text.trim();
      if (!content) return;
      const pending: ChatMessage = {
        id: newMessageId(),
        conversationId,
        senderId: user?.id ?? null,
        senderRole: 'team',
        content,
        createdAt: new Date().toISOString(),
        state: 'pending',
        editedAt: null,
        deletedAt: null,
        deletedByRole: null,
        purged: false,
      };
      updateThread(conversationId, (s) => ({ ...s, byId: mergeInto(s.byId, [pending]) }));
      void deliver(pending);
    },
    [user, updateThread, deliver]
  );

  const retry = useCallback(
    (m: ChatMessage) => {
      const again: ChatMessage = { ...m, state: 'pending' };
      updateThread(m.conversationId, (s) => ({ ...s, byId: mergeInto(s.byId, [again]) }));
      void deliver(again);
    },
    [updateThread, deliver]
  );

  // ---- Editing and deleting (database functions; Realtime echoes the same change) ------
  const act = useCallback(
    async (run: () => Promise<ChatMessage>, fallback: string): Promise<boolean> => {
      try {
        handleUpdated(await run());
        return true;
      } catch (e) {
        toast.error(e instanceof ChatError ? e.message : fallback);
        return false;
      }
    },
    [handleUpdated]
  );

  const E = staffText().messages.errors;
  const onEdit = useCallback(
    (m: ChatMessage, text: string) => act(() => editMessage(supabase, m.id, text), E.editFailed),
    [act, supabase, E]
  );
  const onDelete = useCallback(
    (m: ChatMessage, reason?: string) => act(() => deleteMessage(supabase, m.id, reason), E.deleteFailed),
    [act, supabase, E]
  );
  const onRestore = useCallback(
    (m: ChatMessage) => act(() => restoreMessage(supabase, m.id), E.restoreFailed),
    [act, supabase, E]
  );
  const onPurge = useCallback(
    (m: ChatMessage, reason: string) => act(() => purgeMessage(supabase, m.id, reason), E.purgeFailed),
    [act, supabase, E]
  );
  const loadHistory = useCallback(
    (m: ChatMessage): Promise<MessageRevision[]> => messageHistory(supabase, m.id),
    [supabase]
  );

  const select = useCallback(
    (id: string) => {
      router.replace(`/messages?c=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router]
  );

  const onOpenedFromModal = useCallback(
    async (id: string) => {
      setNewChatOpen(false);
      await addConversation(id);
      select(id);
    },
    [addConversation, select]
  );

  const sorted = useMemo(
    () =>
      Object.values(conversations).sort((a, b) => {
        const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
        const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
        return tb - ta;
      }),
    [conversations]
  );

  const active = activeId ? conversations[activeId] : undefined;
  const activeThread = activeId ? threads[activeId] : undefined;

  return (
    <div className="h-full flex bg-card">
      <ConversationList
        conversations={sorted}
        activeId={activeId}
        loading={listLoading}
        error={listError}
        myId={user?.id ?? null}
        connected={connected}
        onSelect={select}
        onRetry={() => loadList()}
        onNewChat={() => setNewChatOpen(true)}
      />
      <div className="flex-1 min-w-0 border-l border-border flex flex-col">
        <ChatThread
          key={activeId ?? 'none'}
          conversation={active}
          conversationId={activeId}
          thread={activeThread}
          myId={user?.id ?? null}
          myName={profile?.fullName?.trim() || ''}
          names={names}
          failReasons={failReasons}
          connected={connected}
          isAdmin={profile?.role === 'admin'}
          onSend={send}
          onRetry={retry}
          onEdit={onEdit}
          onDelete={onDelete}
          onRestore={onRestore}
          onPurge={onPurge}
          loadHistory={loadHistory}
          onLoadOlder={loadOlder}
          onReload={(id) => void loadThread(id, true)}
          onNewChat={() => setNewChatOpen(true)}
        />
      </div>
      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onOpened={onOpenedFromModal}
      />
    </div>
  );
}
