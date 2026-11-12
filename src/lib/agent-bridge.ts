'use client';

import { AgentChatError, getAgentDocumentUrl, type AgentAuth } from './agent-chat';

/**
 * Bridge between the patient assistant page (/m/assistant) and the HappyHearts
 * Flutter app that hosts it in a WebView.
 *
 *   page → app:  window.AgentBridge.postMessage(JSON.stringify({ event, data }))
 *                events: ready, token_expired, assistance_sent,
 *                open_url with data = the link as a plain string (an absolute https:, tel: or mailto:
 *                link the app opens with the phone: browser, dialer, mail). Kept a string so app
 *                builds from before Nov 11 (which read data as a string) still open links.
 *   app → page:  window.HappyHeartsAgent.setToken(accessToken)
 *
 * The Supabase access token lives only in memory here (never in the URL or
 * storage). The app pushes a fresh one whenever Supabase refreshes the session.
 */

declare global {
  interface Window {
    AgentBridge?: { postMessage: (message: string) => void };
    HappyHeartsAgent?: { setToken: (token: string | null) => void };
  }
}

let token: string | null = null;
let waiters: Array<(t: string) => void> = [];
const listeners = new Set<(t: string | null) => void>();

export const inApp = () => typeof window !== 'undefined' && !!window.AgentBridge;

export function postToApp(event: string, data?: unknown) {
  try {
    window.AgentBridge?.postMessage(JSON.stringify({ event, data: data ?? null }));
  } catch {
    // Not inside the app.
  }
}

/** Install `window.HappyHeartsAgent` and tell the app we are ready for a token. */
export function installBridge() {
  window.HappyHeartsAgent = {
    setToken(t) {
      token = t && typeof t === 'string' ? t : null;
      if (token) {
        const ready = waiters;
        waiters = [];
        ready.forEach((w) => w(token as string));
      }
      listeners.forEach((l) => l(token));
    },
  };
  postToApp('ready');
}

export function onTokenChange(fn: (t: string | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function waitForToken(timeoutMs = 10_000): Promise<string> {
  if (token) return Promise.resolve(token);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== done);
      reject(new AgentChatError('Please sign in again.', 401));
    }, timeoutMs);
    const done = (t: string) => {
      clearTimeout(timer);
      resolve(t);
    };
    waiters.push(done);
  });
}

/** The token was rejected: drop it and ask the app for a fresh one. */
export function requestFreshToken() {
  token = null;
  postToApp('token_expired');
}

export const bearerAuth: AgentAuth = async () => ({ Authorization: `Bearer ${await waitForToken()}` });

/** Absolute form of a link on this site ("/legal/terms" → "https://…/legal/terms"). */
export const absoluteUrl = (url: string) => new URL(url, window.location.href).href;

/**
 * Open a link outside the chat: in the app, the phone opens it (browser, dialer, mail);
 * on the web, a new tab (tel: and mailto: go to the system handler).
 */
export function openExternal(url: string) {
  const href = absoluteUrl(url);
  if (inApp()) {
    postToApp('open_url', href);
    return;
  }
  if (/^(tel|mailto):/i.test(href)) window.location.href = href;
  else window.open(href, '_blank', 'noopener,noreferrer');
}

/**
 * Open the original file of a knowledge-base source. On the web the tab opens right away (inside
 * the tap, so pop-up blockers allow it) and gets its address when the link arrives.
 */
export async function openAgentDocument(documentId: string, auth?: AgentAuth): Promise<void> {
  const tab = inApp() ? null : window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const { url } = await getAgentDocumentUrl(documentId, auth);
    if (tab) tab.location.href = url;
    else openExternal(url);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
