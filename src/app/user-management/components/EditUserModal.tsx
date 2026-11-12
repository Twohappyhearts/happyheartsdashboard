'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import {
  UsersError,
  formatPhone,
  normalizePhone,
  passwordProblem,
  phoneProblem,
  resetPassword,
  updateUser,
  type AccountRole,
  type ManagedUser,
} from '@/lib/users';
import PasswordField, { inputClass } from './PasswordField';
import ReenableConfirmModal from './ReenableConfirmModal';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  user: ManagedUser | null;
  callerId: string | null;
  callerIsAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditUserModal({ user, callerId, callerIsAdmin, onClose, onSaved }: Props) {
  const { t } = useStaffT();
  const T = t.users.editForm;
  const [displayId, setDisplayId] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AccountRole>('patient');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmReenable, setConfirmReenable] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayId(user.displayId);
    setPhone(formatPhone(user.phone));
    setRole(user.role);
    setEnabled(user.active);
    setShowReset(false);
    setNewPassword('');
    setConfirmReenable(false);
  }, [user]);

  if (!user) return null;

  const isSelf = user.id === callerId;
  // Careteam can manage patient/careteam accounts; only admins touch admins.
  const locked = !callerIsAdmin && user.role === 'admin';
  const roleDisabled = isSelf || locked;

  const save = async (skipConfirm = false) => {
    if (displayId.trim().length > 50) {
      toast.error(T.displayIdTooLong);
      return;
    }
    const phoneErr = phoneProblem(phone);
    if (phoneErr) {
      toast.error(phoneErr);
      return;
    }
    if (enabled && !user.active && !skipConfirm) {
      setConfirmReenable(true);
      return;
    }
    const changes: { role?: AccountRole; displayId?: string; isActive?: boolean; phone?: string } = {};
    if (displayId.trim() !== user.displayId) changes.displayId = displayId.trim();
    if (normalizePhone(phone) !== user.phone) changes.phone = phone.trim();
    if (role !== user.role) changes.role = role;
    if (enabled !== user.active) changes.isActive = enabled;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await updateUser(user.id, changes);
      toast.success(T.updated(user.username));
      setConfirmReenable(false);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof UsersError ? e.message : T.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  const doReset = async () => {
    const problem = passwordProblem(newPassword);
    if (problem) {
      toast.error(T.passwordProblem(problem));
      return;
    }
    setResetting(true);
    try {
      await resetPassword(user.id, newPassword);
      navigator.clipboard?.writeText(newPassword).catch(() => {});
      toast.success(T.passwordSet);
      setShowReset(false);
      setNewPassword('');
      onSaved();
    } catch (e) {
      toast.error(e instanceof UsersError ? e.message : T.resetFailed);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Modal
        open={!!user && !confirmReenable}
        onClose={onClose}
        title={T.title}
        size="md"
        footer={
          <>
            <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
              {T.cancel}
            </button>
            <button
              onClick={() => save()}
              disabled={saving || locked}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 disabled:opacity-60"
            >
              {saving && <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />}
              {T.update}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {locked && (
            <p className="text-[12px] text-warning bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
              {T.adminOnly}
            </p>
          )}
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">{T.userId}</label>
            <input value={user.id} readOnly className="w-full px-3 py-2 border border-border rounded-lg text-[12px] font-mono text-muted-foreground bg-muted/50 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">{T.username}</label>
            <input value={user.username} readOnly className="w-full px-3 py-2 border border-border rounded-lg text-[13px] font-mono text-muted-foreground bg-muted/50 cursor-not-allowed" />
            <p className="text-[11px] text-muted-foreground mt-1">{T.usernameLocked}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="eu-display" className="block text-[13px] font-500 text-foreground mb-1">{T.displayId}</label>
              <input
                id="eu-display"
                value={displayId}
                onChange={(e) => setDisplayId(e.target.value)}
                maxLength={50}
                disabled={locked}
                placeholder={T.displayIdPlaceholder}
                className={`${inputClass} disabled:opacity-60`}
              />
            </div>
            <div>
              <label htmlFor="eu-role" className="block text-[13px] font-500 text-foreground mb-1">{T.role}</label>
              <div className="relative">
                <select
                  id="eu-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AccountRole)}
                  disabled={roleDisabled}
                  className={`${inputClass} appearance-none pr-8 disabled:opacity-60`}
                >
                  <option value="patient">{t.users.roleNames.patient}</option>
                  <option value="staff">{t.users.roleNames.staff}</option>
                  <option value="admin" disabled={!callerIsAdmin}>{t.users.roleNames.admin}</option>
                </select>
                <Icon name="ChevronDownIcon" size={14} variant="outline" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              {isSelf && <p className="text-[11px] text-muted-foreground mt-1">{T.ownRole}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="eu-phone" className="block text-[13px] font-500 text-foreground mb-1">{T.phone}</label>
            <input
              id="eu-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              disabled={locked}
              placeholder={T.phonePlaceholder}
              className={`${inputClass} disabled:opacity-60`}
            />
            {phone && phoneProblem(phone) && <p className="text-[11px] text-danger mt-1">{phoneProblem(phone)}</p>}
          </div>

          <label className={`flex items-start gap-2.5 p-3 rounded-lg border border-border ${isSelf || locked ? 'opacity-60' : 'cursor-pointer hover:bg-muted/30'}`}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={isSelf || locked}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-[13px] font-500 text-foreground">{T.enabled}</span>
              <span className="block text-[11px] text-muted-foreground">
                {isSelf ? T.cantDisableSelf : T.enabledHint}
              </span>
            </span>
          </label>

          <div className="border-t border-border pt-4">
            {!showReset ? (
              <button
                onClick={() => setShowReset(true)}
                disabled={isSelf || locked}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="KeyIcon" size={13} variant="outline" />
                {T.resetPassword}
              </button>
            ) : (
              <div className="space-y-2">
                <label htmlFor="eu-newpw" className="block text-[13px] font-500 text-foreground">{T.newTempPassword}</label>
                <PasswordField id="eu-newpw" value={newPassword} onChange={setNewPassword} showStrength allowGenerate />
                <div className="flex items-center gap-2">
                  <button
                    onClick={doReset}
                    disabled={resetting}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-600 hover:opacity-90 disabled:opacity-60"
                  >
                    {resetting ? T.saving : T.setPassword}
                  </button>
                  <button
                    onClick={() => {
                      setShowReset(false);
                      setNewPassword('');
                    }}
                    className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted"
                  >
                    {T.cancel}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">{T.resetHint}</p>
              </div>
            )}
          </div>
        </div>
      </Modal>
      <ReenableConfirmModal
        open={confirmReenable}
        username={user.username}
        busy={saving}
        onCancel={() => setConfirmReenable(false)}
        onConfirm={() => save(true)}
      />
    </>
  );
}
