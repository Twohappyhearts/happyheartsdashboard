'use client';

import React, { useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

const widthMap = { md: 'w-[480px]', lg: 'w-[600px]', xl: 'w-[720px]' };

export default function SlideOver({ open, onClose, title, subtitle, children, footer, width = 'lg' }: SlideOverProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-foreground/20 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
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
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors duration-150 text-muted-foreground mt-0.5"
            aria-label="Close panel"
          >
            <Icon name="XMarkIcon" size={18} variant="outline" />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}