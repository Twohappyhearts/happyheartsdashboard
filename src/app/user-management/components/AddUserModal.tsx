'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import {
  EMAIL_RE,
  ROLE_LABELS,
  USERNAME_RE,
  UsersError,
  createUser,
  passwordProblem,
  phoneProblem,
  type AccountRole,
} from '@/lib/users';
import PasswordField, { inputClass } from './PasswordField';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  canCreateAdmin: boolean;
}

const EMPTY = { username: '', email: '', phone: '', password: '', confirm: '', role: 'patient' as AccountRole, displayId: '' };

export default function AddUserModal({ open, onClose, onCreated, canCreateAdmin }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ username: string; email: string; password: string } | null>(null);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const errors = {
    username: !form.username
      ? 'Username is required'
      : !USERNAME_RE.test(form.username)
        ? '3–20 letters or numbers only (no spaces or symbols)'
        : null,
    email: !form.email ? 'Email is required' : !EMAIL_RE.test(form.email.trim()) ? 'Enter a valid email address' : null,
    phone: phoneProblem(form.phone),
    password: !form.password ? 'Temporary password is required' : passwordProblem(form.password),
    confirm: form.confirm !== form.password ? 'Passwords do not match' : null,
    displayId: form.displayId.length > 50 ? 'Max 50 characters' : null,
  };
  const valid = Object.values(errors).every((e) => !e);

  const close = () => {
    setForm(EMPTY);
    setTouched(false);
    setCreated(null);
    onClose();
  };

  const submit = async () => {
    setTouched(true);
    if (!valid || saving) return;
    setSaving(true);
    try {
      await createUser({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        displayId: form.displayId.trim(),
        phone: form.phone.trim(),
      });
      setCreated({ username: form.username.trim(), email: form.email.trim().toLowerCase(), password: form.password });
      onCreated();
      toast.success(`Account “${form.username.trim()}” created`);
    } catch (e) {
      toast.error(e instanceof UsersError ? e.message : 'Could not create the account.');
    } finally {
      setSaving(false);
    }
  };

  const Err = ({ msg }: { msg: string | null }) =>
    touched && msg ? <p className="text-[11px] text-danger mt-1">{msg}</p> : null;

  if (created) {
    const text = `Happy Hearts sign-in\nUsername: ${created.username}\nEmail: ${created.email}\nTemporary password: ${created.password}`;
    return (
      <Modal
        open={open}
        onClose={close}
        title="Account Created"
        size="md"
        footer={
          <button onClick={close} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150">
            Done
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-success/5 border border-success/20">
            <Icon name="CheckCircleIcon" size={18} variant="solid" className="text-success shrink-0 mt-0.5" />
            <p className="text-[13px] text-foreground">
              Share these sign-in details with the user securely. The temporary password is shown only now — they will be asked to choose a new one at first sign-in.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 font-mono text-[12px] text-foreground space-y-1">
            <p>Username: {created.username}</p>
            <p>Email: {created.email}</p>
            <p>Temporary password: {created.password}</p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(text);
              toast.success('Sign-in details copied');
            }}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
          >
            <Icon name="ClipboardDocumentIcon" size={13} variant="outline" />
            Copy sign-in details
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create New User"
      size="md"
      footer={
        <>
          <button onClick={close} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 disabled:opacity-60"
          >
            {saving && <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />}
            Create User
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label htmlFor="nu-username" className="block text-[13px] font-500 text-foreground mb-1">
            Username <span className="text-danger">*</span>
          </label>
          <input
            id="nu-username"
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            maxLength={20}
            autoComplete="off"
            placeholder="e.g. HH001"
            className={`${inputClass} font-mono`}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            3–20 letters or numbers. Used as the REDCap participant code and cannot be changed later.
          </p>
          <Err msg={errors.username} />
        </div>

        <div>
          <label htmlFor="nu-email" className="block text-[13px] font-500 text-foreground mb-1">
            Email <span className="text-danger">*</span>
          </label>
          <input
            id="nu-email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="off"
            placeholder="name@example.com"
            className={inputClass}
          />
          <p className="text-[11px] text-muted-foreground mt-1">The user signs in to the app with this email.</p>
          <Err msg={errors.email} />
        </div>

        <div>
          <label htmlFor="nu-phone" className="block text-[13px] font-500 text-foreground mb-1">Phone Number</label>
          <input
            id="nu-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            maxLength={30}
            autoComplete="off"
            placeholder="e.g. (949) 555-0100"
            className={inputClass}
          />
          <Err msg={errors.phone} />
        </div>

        <div>
          <label htmlFor="nu-password" className="block text-[13px] font-500 text-foreground mb-1">
            Temporary Password <span className="text-danger">*</span>
          </label>
          <PasswordField id="nu-password" value={form.password} onChange={(v) => set('password', v)} showStrength allowGenerate />
          <Err msg={errors.password} />
        </div>

        <div>
          <label htmlFor="nu-confirm" className="block text-[13px] font-500 text-foreground mb-1">
            Confirm Password <span className="text-danger">*</span>
          </label>
          <PasswordField id="nu-confirm" value={form.confirm} onChange={(v) => set('confirm', v)} />
          <Err msg={errors.confirm} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nu-role" className="block text-[13px] font-500 text-foreground mb-1">Role</label>
            <div className="relative">
              <select
                id="nu-role"
                value={form.role}
                onChange={(e) => set('role', e.target.value as AccountRole)}
                className={`${inputClass} appearance-none pr-8`}
              >
                <option value="patient">Patient</option>
                <option value="staff">Careteam</option>
                <option value="admin" disabled={!canCreateAdmin}>
                  Admin{canCreateAdmin ? '' : ' (admins only)'}
                </option>
              </select>
              <Icon name="ChevronDownIcon" size={14} variant="outline" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div>
            <label htmlFor="nu-display" className="block text-[13px] font-500 text-foreground mb-1">Display ID</label>
            <input
              id="nu-display"
              value={form.displayId}
              onChange={(e) => set('displayId', e.target.value)}
              maxLength={50}
              placeholder="Friendly name for display"
              className={inputClass}
            />
            <Err msg={errors.displayId} />
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-info/5 border border-info/20">
          <Icon name="InformationCircleIcon" size={16} variant="outline" className="text-info shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground">
            The user will be required to change this password on first login. Role: <strong>{ROLE_LABELS[form.role]}</strong>.
          </p>
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
