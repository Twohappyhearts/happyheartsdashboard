'use client';

import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative w-9 h-5 rounded-full transition-colors duration-200
          ${checked ? 'bg-primary' : 'bg-border'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span
          className={`
            absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
            ${checked ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </div>
      {label && <span className="text-[13px] font-500 text-foreground">{label}</span>}
    </label>
  );
}