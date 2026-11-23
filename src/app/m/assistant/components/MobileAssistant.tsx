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
  type AgentAuth,
  type AgentConversation,
} from '@/lib/agent-chat';
import { absoluteUrl, bearerAuth, inApp, installBridge, onTokenChange, postToApp, requestFreshToken, waitForToken } from '@/lib/agent-bridge';
import { PATIENT_TEXT, type PatientText } from '@/lib/i18n/patient';
import { PatientTextProvider } from '@/lib/i18n/patient-context';
import { dirOf, matchLanguage, pickLanguage, type Language } from '@/lib/languages';
import MobileConversationList from './MobileConversationList';
import MobileChatThread from './MobileChatThread';
import HistoryButton from './HistoryButton';
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

/**
 * Patients use this page inside the HappyHearts app, which passes their token (agent-bridge.ts).
 *
 * Staff preview: opened in a normal browser by a signed-in staff or admin account (the
 * dashboard's session cookie; "Open patient view" on the AI Chat page), the page shows the
 * same patient UI. The AI notice appears once per page load and accepting it is not recorded;
 * care-team messages go through the same steps but create no alert (as on the AI Chat page).
 */
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
  /** Staff preview in a browser (see above): cookie auth instead of the app's token. */
  const [preview, setPreview] = useState(false);
  const previewRef = useRef(false);
  /** The patient's token from the app; undefined = the session cookie (staff preview). */
  const auth = (): AgentAuth | undefined => (previewRef.current ? undefined : bearerAuth);

  // In the app, iOS moved the whole page when a swipe reached it (a short chat, the message list
  // already at its end, or a finger on the header or the composer). Only the lists should scroll.
  useEffect(() => {
    if (preview) return;
    const roots = [document.documentElement, document.body];
    const before = roots.map((el) => el.style.overscrollBehavior);
    roots.forEach((el) => (el.style.overscrollBehavior = 'none'));
    return () => roots.forEach((el, i) => (el.style.overscrollBehavior = before[i]));
  }, [preview]);
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
    const p = loadAgentMessages(id, auth())
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
        const list = await listAgentConversations(auth());
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
    if (previewRef.current) return;
    const consent = await getAgentConsent(bearerAuth).catch(() => null);
    setNoticeNeeded(!consent || (consent.required && !consent.agreed));
    const careTeam = matchLanguage(consent?.careTeamLanguage);
    if (careTeam) setCareTeamLanguage(careTeam);
  }, []);

  // Wait for the app to hand over the patient's token (or, in a browser, check for a staff session).
  useEffect(() => {
    installBridge();
    const off = onTokenChange((tk) => tk && setPhase('ready'));
    let cancelled = false;
    void (async () => {
      if (!inApp()) {
        // Signed in on the dashboard as staff or admin (consent not required): the staff preview.
        const staff = await getAgentConsent().catch(() => null);
        if (cancelled) return;
        if (staff && !staff.required) {
          previewRef.current = true;
          setPreview(true);
          const careTeam = matchLanguage(staff.careTeamLanguage);
          if (careTeam) setCareTeamLanguage(careTeam);
          // Shown once per page load so staff see it; accepting is kept in this page only.
          setNoticeNeeded(true);
          void loadList();
          setPhase('ready');
          return;
        }
      }
      try {
        await waitForToken(inApp() ? 15_000 : 2_000);
      } catch {
        if (!cancelled) setPhase(inApp() ? 'error' : 'no-app');
        return;
      }
      if (cancelled) return;
      void loadList();
      // Known before the chat shows, so the notice never appears over a half-typed message.
      await checkNotice();
      setPhase('ready');
    })();
    return () => {
      cancelled = true;
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
      postToApp('open_url', absoluteUrl(href));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const acceptNotice = async () => {
    if (previewRef.current) {
      // Staff preview: nothing is written to agent_consents.
      setNoticeNeeded(false);
      return;
    }
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

  /**
   * Back to the open chat. The thread is unmounted while the list shows, and `thread.messages`
   * holds only what it started with (nothing, for a chat started here), so remount it with the
   * latest messages the chat reported. Without this the questions and answers vanished.
   */
  const showChat = () => {
    const id = currentId.current;
    const latest = id ? cache.current.get(id) : undefined;
    if (id && latest) setThread((th) => (th.conversationId === id ? { ...th, messages: latest } : th));
    setView('chat');
  };

  /** Switch right away; show cached messages instantly, otherwise a spinner while they load. */
  const open = async (id: string) => {
    setListProblem(null);
    if (id === currentId.current) {
      showChat();
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
      await deleteAgentConversation(deleteTarget.id, auth());
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

  const page = (
    <div
      lang={lang}
      dir={dirOf(lang)}
      style={APP_THEME}
      className={`h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden ${
        // Phone width on a desktop; transform keeps the sheets and dialogs inside this frame.
        preview ? 'w-full max-w-[430px] shadow-xl [transform:translateZ(0)]' : ''
      }`}
    >
      {preview && (
        <div dir="ltr" lang="en" className="shrink-0 px-3 py-1.5 border-b border-amber-300 bg-amber-100 text-[12px] leading-snug font-600 text-[#92400E] flex items-start gap-1.5">
          <Icon name="EyeIcon" size={14} variant="outline" className="shrink-0 mt-px" />
          <span>Staff preview – patients see this page inside the app. Care-team messages create no real alert, and accepting the notice here is not recorded.</span>
        </div>
      )}
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
          onBack={showChat}
          onOpen={(id) => void open(id)}
          onNew={startNew}
          onDelete={setDeleteTarget}
          onRetry={() => void loadList()}
        />
      ) : thread.loading ? (
        <>
          <div className="h-12 shrink-0 px-2 flex items-center gap-1 border-b border-border bg-card">
            <HistoryButton label={t.history} ariaLabel={t.yourConversations} onClick={() => setView('list')} />
            <p className="flex-1 min-w-0 px-1 text-[15px] font-600 truncate">{title}</p>
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
          auth={preview ? undefined : bearerAuth}
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
  );

  return (
    <PatientTextProvider lang={lang}>
      {preview ? <div className="min-h-[100dvh] bg-[#E2E8F0] flex justify-center">{page}</div> : page}
    </PatientTextProvider>
  );
}
