'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import {
  ReviewError,
  listReviewConversations,
  openReviewConversation,
  type ReviewConversation,
  type ReviewRole,
  type ReviewThread,
} from '@/lib/ai-review';
import { useStaffT } from '@/lib/i18n/staff/context';
import AiReviewList from './AiReviewList';
import AiReviewThread from './AiReviewThread';

/**
 * AI Conversations: the research team (Careteam and Admin) reads everyone's AI assistant
 * conversations (patients and Careteam/Admin test chats), read-only. The open conversation is in
 * the URL (?c=), so it can be linked.
 */
export default function AiReviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlId = searchParams.get('c');
  // ?m=<message id>: open the branch that holds this message and bring it into view.
  const focusId = searchParams.get('m');
  const { t } = useStaffT();
  const T = t.aiReview;
  const messageOf = (e: unknown, fallback: string) => (e instanceof ReviewError ? e.message : fallback);

  // ------------------------------------------------------------ list
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<ReviewRole | null>(null);
  const [conversations, setConversations] = useState<ReviewConversation[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRequest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadList = useCallback(async () => {
    const request = ++listRequest.current;
    setListLoading(true);
    try {
      const page = await listReviewConversations(search, role, null);
      if (request !== listRequest.current) return;
      setConversations(page.conversations);
      setNext(page.next);
      setListError(null);
    } catch (e) {
      if (request === listRequest.current) setListError(messageOf(e, T.loadListFailed));
    } finally {
      if (request === listRequest.current) setListLoading(false);
    }
  }, [search, role]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadMore = async () => {
    if (!next || loadingMore) return;
    const request = listRequest.current;
    setLoadingMore(true);
    try {
      const page = await listReviewConversations(search, role, next);
      if (request !== listRequest.current) return;
      setConversations((list) => [...list, ...page.conversations.filter((c) => !list.some((x) => x.id === c.id))]);
      setNext(page.next);
    } catch (e) {
      toast.error(messageOf(e, T.loadListFailed));
    } finally {
      setLoadingMore(false);
    }
  };

  // ------------------------------------------------------------ open conversation
  const [thread, setThread] = useState<ReviewThread | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setThread(null);
    setThreadError(null);
    if (!urlId) return;
    let cancelled = false;
    openReviewConversation(urlId, focusId ?? undefined)
      .then((t) => {
        if (!cancelled) setThread(t);
      })
      .catch((e) => {
        if (!cancelled) setThreadError(messageOf(e, T.loadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [urlId, focusId, reload]);

  const switchVersion = async (versionId: string) => {
    if (!thread || switching) return;
    const id = thread.conversation.id;
    setSwitching(true);
    try {
      const fresh = await openReviewConversation(id, versionId);
      setThread((t) => (t && t.conversation.id === id ? fresh : t));
    } catch {
      toast.error(T.versionFailed);
    } finally {
      setSwitching(false);
    }
  };

  const select = (id: string) => router.push(`/ai-conversations?c=${encodeURIComponent(id)}`);

  const owner = thread?.conversation.user;
  const ownerLine = owner
    ? [
        owner.role && owner.role !== 'patient' ? t.users.roleNames[owner.role] : null,
        owner.fullName,
        owner.username && `@${owner.username}`,
        owner.displayId,
      ]
        .filter(Boolean)
        .join(' · ') || T.unknownUser
    : '';

  return (
    <div className="h-full flex bg-card">
      <AiReviewList
        conversations={conversations}
        activeId={urlId}
        query={query}
        onQuery={setQuery}
        role={role}
        onRole={setRole}
        searching={search.length > 0}
        loading={listLoading}
        error={listError}
        hasMore={next != null}
        loadingMore={loadingMore}
        onSelect={select}
        onRetry={() => void loadList()}
        onLoadMore={() => void loadMore()}
      />
      <div className="flex-1 min-w-0 border-l border-border flex flex-col">
        {!urlId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-background">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <Icon name="ChatBubbleBottomCenterTextIcon" size={28} variant="outline" className="text-muted-foreground" />
            </div>
            <p className="text-[14px] font-600 text-foreground">{T.selectConversation}</p>
          </div>
        ) : threadError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-background">
            <p className="text-[13px] text-danger">{threadError}</p>
            <button onClick={() => setReload((n) => n + 1)} className="text-[13px] font-600 text-primary hover:underline">
              {T.tryAgain}
            </button>
          </div>
        ) : !thread ? (
          <div className="flex-1 flex items-center justify-center bg-background">
            <Icon name="ArrowPathIcon" size={20} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AiReviewThread
            key={thread.conversation.id}
            thread={thread}
            title={thread.conversation.title?.trim() || T.untitled}
            ownerLine={ownerLine}
            switching={switching}
            focusId={focusId}
            onSwitch={(id) => void switchVersion(id)}
          />
        )}
      </div>
    </div>
  );
}
