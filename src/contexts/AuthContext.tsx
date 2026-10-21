'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type AccountRole = 'patient' | 'staff' | 'admin';

export interface StaffProfile {
  id: string;
  fullName: string;
  username: string;
  role: AccountRole | null;
  isActive: boolean;
  /** Created / reset by staff with a temporary password. */
  mustChangePassword: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: StaffProfile | null;
  /** True only for an active staff/admin account. */
  isStaff: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Sets the user's own new password and clears the temporary-password flag. */
  changeOwnPassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export class AuthError extends Error {}

async function loadProfile(userId: string): Promise<StaffProfile> {
  const supabase = createClient();
  const [{ data: roleRow, error: roleErr }, { data: profileRow }] = await Promise.all([
    supabase
      .from('account_roles')
      .select('role, is_active, must_change_password')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('profiles').select('full_name, username').eq('id', userId).maybeSingle(),
  ]);
  if (roleErr) throw roleErr;
  return {
    id: userId,
    fullName: profileRow?.full_name ?? '',
    username: profileRow?.username ?? '',
    role: (roleRow?.role as AccountRole | undefined) ?? null,
    isActive: roleRow?.is_active === true,
    mustChangePassword: roleRow?.must_change_password === true,
  };
}

const isStaffProfile = (p: StaffProfile | null) =>
  !!p && p.isActive && (p.role === 'staff' || p.role === 'admin');

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedFor = useRef<string | null>(null);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    const uid = next?.user.id ?? null;
    if (!uid) {
      loadedFor.current = null;
      setProfile(null);
      setLoading(false);
      return;
    }
    if (loadedFor.current === uid) {
      setLoading(false);
      return;
    }
    try {
      const p = await loadProfile(uid);
      loadedFor.current = uid;
      setProfile(p);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      // Defer: never await Supabase calls inside this callback (auth lock).
      setTimeout(() => applySession(next), 0);
    });
    return () => subscription.unsubscribe();
  }, [supabase, applySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new AuthError(
          error.message === 'Invalid login credentials'
            ? 'Incorrect email or password.'
            : error.message
        );
      }
      const p = await loadProfile(data.user.id);
      if (!isStaffProfile(p)) {
        await supabase.auth.signOut();
        throw new AuthError(
          p.role === 'patient'
            ? 'This is a patient account. Only research staff can use the dashboard.'
            : 'This staff account is not active. Ask an admin to enable it.'
        );
      }
      loadedFor.current = data.user.id;
      setProfile(p);
      setSession(data.session);
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    loadedFor.current = null;
    setProfile(null);
    setSession(null);
  }, [supabase]);

  const changeOwnPassword = useCallback(
    async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        throw new AuthError(
          error.message.toLowerCase().includes('different')
            ? 'Choose a password different from the temporary one.'
            : error.message
        );
      }
      const { error: rpcErr } = await supabase.rpc('complete_password_change');
      if (rpcErr) throw new AuthError('Password changed, but the account could not be updated. Please refresh.');
      setProfile((p) => (p ? { ...p, mustChangePassword: false } : p));
    },
    [supabase]
  );

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    profile,
    isStaff: isStaffProfile(profile),
    loading,
    signIn,
    signOut,
    changeOwnPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function displayName(p: { fullName?: string; full_name?: string; username?: string } | null | undefined) {
  if (!p) return 'Unknown';
  const name = (p.fullName ?? p.full_name ?? '').trim();
  return name || (p.username ? `@${p.username}` : 'Unknown');
}

export function initials(name: string) {
  const parts = name.replace(/^@/, '').split(/[\s_]+/).filter(Boolean);
  return (parts.slice(0, 2).map((s) => s[0]!.toUpperCase()).join('') || '?');
}
