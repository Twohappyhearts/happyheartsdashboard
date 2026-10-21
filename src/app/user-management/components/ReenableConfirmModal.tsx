'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';

interface Props {
  open: boolean;
  username: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Warning shown before re-enabling a disabled account (Prompt 6 wording). */
export default function ReenableConfirmModal({ open, username, busy, onCancel, onConfirm }: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Re-activating Account"
      size="sm"
      footer={
        <>
          <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 disabled:opacity-60"
          >
            OK
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <Icon name="ExclamationTriangleIcon" size={20} variant="outline" className="text-warning shrink-0 mt-0.5" />
        <div className="space-y-2 text-[13px] text-foreground">
          <p>
            This account (<span className="font-mono">@{username}</span>) was previously disabled. If it belonged to another patient,
            consider deleting it first to protect patient privacy (HIPAA compliance).
          </p>
          <p className="font-600">Do you want to re-enable this account?</p>
        </div>
      </div>
    </Modal>
  );
}
