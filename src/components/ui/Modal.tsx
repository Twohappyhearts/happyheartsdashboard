'use client';

import React, { useCallback, useEffect, useId, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useStaffT } from '@/lib/i18n/staff/context';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * As a function it receives the close that checks `dirty` first, for the footer's Cancel button.
   * Closing after a successful save should call onClose directly.
   */
  footer?: React.ReactNode | ((requestClose: () => void) => React.ReactNode);
  /**
   * The dialog holds unsaved input: Esc, a click outside, the close button (and a footer Cancel
   * that uses requestClose) first ask "Discard changes?".
   */
  dirty?: boolean;
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/** The "Discard changes?" prompt shared by Modal and SlideOver. */
function DiscardPrompt({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const DISCARD_TEXT = useStaffT().t.discard;
  return (
    <Modal
      open
      onClose={onKeep}
      title={DISCARD_TEXT.title}
      size="sm"
      footer={
        <>
          <button
            autoFocus
            onClick={onKeep}
            className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
          >
            {DISCARD_TEXT.keep}
          </button>
          <button
            onClick={onDiscard}
            className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90"
          >
            {DISCARD_TEXT.discard}
          </button>
        </>
      }
    >
      <p className="text-[13px] text-muted-foreground">{DISCARD_TEXT.body}</p>
    </Modal>
  );
}

/**
 * Unsaved-changes guard of a dialog or panel. While `dirty`, requestClose() shows the in-page
 * "Discard changes?" prompt (render `discardPrompt`) instead of closing, and leaving the page
 * lets the browser ask.
 */
export function useDiscardGuard(open: boolean, dirty: boolean, onClose: () => void) {
  const [asking, setAsking] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) setAsking(false);
  }, [open]);

  // Leaving the page (reload, closing the tab) with unsaved changes: let the browser ask.
  useEffect(() => {
    if (!open || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [open, dirty]);

  const discardPrompt =
    open && asking ? (
      <DiscardPrompt
        onKeep={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false);
          onClose();
        }}
      />
    ) : null;

  return { requestClose, asking, discardPrompt };
}

export default function Modal({ open, onClose, title, children, size = 'md', footer, dirty = false }: ModalProps) {
  const { t } = useStaffT();
  const { requestClose, asking, discardPrompt } = useDiscardGuard(open, dirty, onClose);
  // Unique per dialog: the discard prompt is a second dialog on top of this one.
  const titleId = useId();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Already handled by a control inside (e.g. Esc cancels an inline rename and calls preventDefault).
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // The discard prompt on top handles this Esc itself ("Keep editing").
      if (asking) return;
      // Marks the Esc as handled so a SlideOver underneath does not close as well.
      e.preventDefault();
      requestClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, asking, requestClose]);

  if (!open) return null;

  const footerContent = typeof footer === 'function' ? footer(requestClose) : footer;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 fade-in"
        data-overlay="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
          onClick={requestClose}
        />
        <div className={`relative bg-card rounded-xl shadow-modal w-full ${sizeMap[size]} scale-in flex flex-col max-h-[90vh]`}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h2 id={titleId} className="text-[16px] font-600 text-foreground">{title}</h2>
            <button
              onClick={requestClose}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors duration-150 text-muted-foreground"
              aria-label={t.dialog.closeModal}
            >
              <Icon name="XMarkIcon" size={18} variant="outline" />
            </button>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
            {children}
          </div>
          {/* Footer */}
          {footerContent && (
            <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-end gap-3">
              {footerContent}
            </div>
          )}
        </div>
      </div>
      {discardPrompt}
    </>
  );
}
