'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { AuthError, useAuth } from '@/contexts/AuthContext';
import { passwordProblem } from '@/lib/users';
import PasswordField from '@/app/user-management/components/PasswordField';

/** Full-page step shown until a user with a temporary password sets their own. */
export default function ChangePasswordGate() {
  const { user, changeOwnPassword, signOut } = useAuth();
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const problem = passwordProblem(pw);
  const mismatch = confirm !== pw;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem || mismatch || saving) return;
    setSaving(true);
    try {
      await changeOwnPassword(pw);
      toast.success('Password updated');
    } catch (err) {
      toast.error(err instanceof AuthError ? err.message : 'Could not update your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <form onSubmit={submit} className="bg-card border border-border rounded-xl shadow-card p-8 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Icon name="KeyIcon" size={24} variant="outline" className="text-primary" />
          </div>
          <h1 className="text-[16px] font-600 text-foreground">Set a new password</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {user?.email} is using a temporary password. Choose your own to continue.
          </p>
        </div>
        <div>
          <label htmlFor="cp-new" className="block text-[13px] font-500 text-foreground mb-1">New password</label>
          <PasswordField id="cp-new" value={pw} onChange={setPw} showStrength />
          {touched && problem && <p className="text-[11px] text-danger mt-1">{problem}</p>}
        </div>
        <div>
          <label htmlFor="cp-confirm" className="block text-[13px] font-500 text-foreground mb-1">Confirm password</label>
          <PasswordField id="cp-confirm" value={confirm} onChange={setConfirm} />
          {touched && mismatch && <p className="text-[11px] text-danger mt-1">Passwords do not match</p>}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 disabled:opacity-60"
        >
          {saving && <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />}
          Save password
        </button>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace('/sign-up-login');
          }}
          className="w-full text-[12px] text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
