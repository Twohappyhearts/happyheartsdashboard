'use client';

import React, { createContext, useContext, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useDiscardGuard } from '@/components/ui/Modal';
import { useStaffT } from '@/lib/i18n/staff/context';

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

const widthMap = { md: 'w-[480px]', lg: 'w-[600px]', xl: 'w-[720px]' };

const SlideOverCloseContext = createContext<(() => void) | null>(null);

/**
 * Inside a SlideOver: closes it the same way as its close button, so unsaved changes are
 * confirmed first. Null outside a SlideOver.
 */
export const useSlideOverClose = () => useContext(SlideOverCloseContext);

export default function SlideOver({ open, onClose, title, subtitle, children, footer, width = 'lg', dirty = false }: SlideOverProps) {
  const DISCARD_TEXT = useStaffT().t.discard;
  const { requestClose, discardPrompt } = useDiscardGuard(open, dirty, onClose);

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

      {discardPrompt}
    </div>
  );
}
