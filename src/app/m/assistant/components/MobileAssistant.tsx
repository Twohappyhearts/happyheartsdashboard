'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import Icon from '@/components/ui/AppIcon';
import {
  AgentChatError,
  acceptAgentConsent,
  deleteAgentConversation,
  getAgentConsent,
  historyToUIMessages,
  listAgentConversations,
  loadAgentMessages,
  type AgentConversation,
} from '@/lib/agent-chat';
import { bearerAuth, inApp, installBridge, onTokenChange, postToApp, requestFreshToken, waitForToken } from '@/lib/agent-bridge';
import { PATIENT_TEXT, type PatientText } from '@/lib/i18n/patient';
import { PatientTextProvider } from '@/lib/i18n/patient-context';
import { dirOf, matchLanguage, pickLanguage, type Language } from '@/lib/languages';
import MobileConversationList from './MobileConversationList';
import MobileChatThread from './MobileChatThread';
import AiNoticeDialog from './AiNoticeDialog';

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
/** Kept as a key, so the message follows a language change. */
type ListProblem = 'listError' | 'openError' | 'deleteError' | 'signInAgain';

const newThread = (): Thread => ({ key: `new-${Date.now()}`, conversationId: null, messages: [] });

/** How many conversations at the top of the list are loaded ahead, so opening them is instant. */
const PREFETCH = 5;

const problemOf = (e: unknown, fallback: ListProblem): ListProblem => (e instanceof AgentChatError && e.status === 401 ? 'signInAgain' : fallback);

interface Props {
  /** ?lang= from the app (e.g. "es", "zh-Hant"); otherwise the phone's languages, else English. */
  langParam?: string | null;
}

export default function MobileAssistant({ langParam }: Props) {
  const requested = matchLanguage(langParam);
  const [lang, setLang] = useState<Language>(requested ?? 'en');
  const t: PatientText = PATIENT_TEXT[lang];
  const [phase, setPhase] = useState<Phase>('connecting');
  const [view, setView] = useState<'chat' | 'list'>('chat');
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listProblem, setListProblem] = useState<ListProblem | null>(null);
  const [thread, setThread] = useState<Thread>(newThread);
  const [deleteTarget, setDeleteTarget] = useState<AgentConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** The patient still has to accept the AI notice (first use, or the notice or Terms of Use changed). */
  const [noticeNeeded, setNoticeNeeded] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [noticeFailed, setNoticeFailed] = useState(false);
  /** Language messages to the care team are written in (Settings). */
  const [careTeamLanguage, setCareTeamLanguage] = useState<Language>('en');
  const currentId = useRef<string | null>(null);
  /** conversationId → its messages, as last seen (loaded, prefetched, or updated by the open chat). */
  const cache = useRef(new Map<string, UIMessage[]>());
  const inflight = useRef(new Map<string, Promise<UIMessage[]>>());

  // No usable ?lang=: the phone's preferred languages.
  useEffect(() => {
    if (!requested) setLang(pickLanguage(...(navigator.languages ?? []), navigator.language));
  }, [requested]);

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

  const loadList = useCallback(
    async (silent = false) => {
      if (!silent) setListLoading(true);
      try {
        const list = await listAgentConversations(bearerAuth);
        setConversations(list);
        setListProblem(null);
        prefetch(list);
      } catch (e) {
        if (e instanceof AgentChatError && e.status === 401) requestFreshToken();
        setListProblem(problemOf(e, 'listError'));
      } finally {
        setListLoading(false);
      }
    },
    [prefetch],
  );

  /** Has the patient accepted the current notice and Terms of Use? If the check fails, show the notice: accepting again changes nothing. */
  const checkNotice = useCallback(async () => {
    const consent = await getAgentConsent(bearerAuth).catch(() => null);
    setNoticeNeeded(!consent || (consent.required && !consent.agreed));
    const careTeam = matchLanguage(consent?.careTeamLanguage);
    if (careTeam) setCareTeamLanguage(careTeam);
  }, []);

  // Wait for the app to hand over the patient's token.
  useEffect(() => {
    installBridge();
    const off = onTokenChange((tk) => tk && setPhase('ready'));
    waitForToken(inApp() ? 15_000 : 2_000)
      .then(async () => {
        void loadList();
        // Known before the chat shows, so the notice never appears over a half-typed message.
        await checkNotice();
        setPhase('ready');
      })
      .catch(() => setPhase(inApp() ? 'error' : 'no-app'));
    return () => {
      off();
    };
  }, [loadList, checkNotice]);

  // Links in answers open in the phone's browser / dialer, not inside the chat.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      const href = a?.getAttribute('href');
      if (!href || !/^(https?:|mailto:|tel:)/i.test(href) || !inApp()) return;
      e.preventDefault();
      postToApp('open_url', { url: href });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const acceptNotice = async () => {
    setAccepting(true);
    setNoticeFailed(false);
    try {
      const consent = await acceptAgentConsent(bearerAuth);
      setNoticeNeeded(false);
      const careTeam = matchLanguage(consent.careTeamLanguage);
      if (careTeam) setCareTeamLanguage(careTeam);
    } catch (e) {
      if (e instanceof AgentChatError && e.status === 401) requestFreshToken();
      setNoticeFailed(true);
    } finally {
      setAccepting(false);
    }
  };

  const startNew = () => {
    currentId.current = null;
    setThread(newThread());
    setView('chat');
  };

  /** Switch right away; show cached messages instantly, otherwise a spinner while they load. */
  const open = async (id: string) => {
    setListProblem(null);
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
      setListProblem(problemOf(e, 'openError'));
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
      setListProblem(problemOf(e, 'deleteError'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const titleOf = (c: Pick<AgentConversation, 'title'> | undefined) => c?.title?.trim() || t.newConversation;
  const title = thread.conversationId ? titleOf(conversations.find((c) => c.id === thread.conversationId)) : t.newConversation;

  return (
    <PatientTextProvider lang={lang}>
      <div lang={lang} dir={dirOf(lang)} style={APP_THEME} className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
        {phase !== 'ready' ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
            {phase === 'connecting' ? (
              <Icon name="ArrowPathIcon" size={22} variant="outline" className="animate-spin text-muted-foreground" />
            ) : (
              <>
                <Icon name="LockClosedIcon" size={28} variant="outline" className="text-muted-foreground" />
                <p className="text-[14px] text-secondary-foreground">{phase === 'no-app' ? t.openFromApp : t.signInAgain}</p>
              </>
            )}
          </div>
        ) : view === 'list' ? (
          <MobileConversationList
            conversations={conversations}
            activeId={thread.conversationId}
            loading={listLoading}
            error={listProblem ? t[listProblem] : null}
            onBack={() => setView('chat')}
            onOpen={(id) => void open(id)}
            onNew={startNew}
            onDelete={setDeleteTarget}
            onRetry={() => void loadList()}
          />
        ) : thread.loading ? (
          <>
            <div className="h-12 shrink-0 px-2 flex items-center gap-1 border-b border-border bg-card">
              <button onClick={() => setView('list')} className="p-2 rounded-lg active:bg-muted" aria-label={t.yourConversations}>
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
            auth={bearerAuth}
            careTeamLanguage={careTeamLanguage}
            onShowList={() => {
              setView('list');
              void loadList(true);
            }}
            onNew={startNew}
            onConversationCreated={(id) => {
              currentId.current = id;
              setThread((th) => ({ ...th, conversationId: id }));
              void loadList(true);
            }}
            onTitle={applyTitle}
            onTurnFinished={() => void loadList(true)}
            // A new notice or Terms of Use came out while the chat was open: ask again.
            onForbidden={() => void checkNotice()}
            onMessagesChange={rememberMessages}
          />
        )}

        {phase === 'ready' && noticeNeeded && (
          <AiNoticeDialog lang={lang} onLanguageChange={setLang} busy={accepting} failed={noticeFailed} onAgree={() => void acceptNotice()} />
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-end">
            <div className="absolute inset-0 bg-black/30" onClick={() => !deleting && setDeleteTarget(null)} />
            <div className="relative w-full bg-card rounded-t-2xl px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <h3 className="text-[16px] font-700">{t.deleteTitle}</h3>
              <p className="text-[14px] text-secondary-foreground mt-1.5 mb-5">{t.deleteBody(titleOf(deleteTarget))}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-xl border border-border text-[15px] font-600"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-xl bg-danger text-white text-[15px] font-600 disabled:opacity-60"
                >
                  {deleting ? t.deleting : t.delete}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PatientTextProvider>
  );
}
