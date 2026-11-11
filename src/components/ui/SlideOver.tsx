'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
  /**
   * The panel holds unsaved changes: Esc, a click outside, the close button (and a form's
   * Cancel button that uses useSlideOverClose) first ask "Discard changes?".
   */
  dirty?: boolean;
}

/** Text of the "Discard changes?" prompt (kept together for the dashboard translation). */
export const DISCARD_TEXT = {
  title: 'Discard changes?',
  body: 'You have changes that are not saved. If you close this panel, they will be lost.',
  keep: 'Keep editing',
  discard: 'Discard changes',
  closePanel: 'Close panel',
};

const widthMap = { md: 'w-[480px]', lg: 'w-[600px]', xl: 'w-[720px]' };

const SlideOverCloseContext = createContext<(() => void) | null>(null);

/**
 * Inside a SlideOver: closes it the same way as its close button, so unsaved changes are
 * confirmed first. Null outside a SlideOver.
 */
export const useSlideOverClose = () => useContext(SlideOverCloseContext);

export default function SlideOver({ open, onClose, title, subtitle, children, footer, width = 'lg', dirty = false }: SlideOverProps) {
  const [asking, setAsking] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) setAsking(false);
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A dialog on top (e.g. the discard prompt, or a modal opened from the panel) handles its own Esc.
      if (e.defaultPrevented || document.querySelector('[data-overlay="modal"]')) return;
      requestClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, requestClose]);

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

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-foreground/20 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={requestClose}
      />
      {/* Panel */}
      <div
        className={`
          absolute top-0 right-0 h-full bg-card shadow-modal flex flex-col
          transition-transform duration-300 ease-in-out
          ${widthMap[width]} max-w-full
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-[16px] font-600 text-foreground">{title}</h2>
            {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={requestClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors duration-150 text-muted-foreground mt-0.5"
            aria-label={DISCARD_TEXT.closePanel}
          >
            <Icon name="XMarkIcon" size={18} variant="outline" />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
          <SlideOverCloseContext.Provider value={requestClose}>{children}</SlideOverCloseContext.Provider>
        </div>
        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>

      <Modal
        open={open && asking}
        onClose={() => setAsking(false)}
        title={DISCARD_TEXT.title}
        size="sm"
        footer={
          <>
            <button
              autoFocus
              onClick={() => setAsking(false)}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
            >
              {DISCARD_TEXT.keep}
            </button>
            <button
              onClick={() => {
                setAsking(false);
                onClose();
              }}
              className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90"
            >
              {DISCARD_TEXT.discard}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-muted-foreground">{DISCARD_TEXT.body}</p>
      </Modal>
    </div>
  );
}
