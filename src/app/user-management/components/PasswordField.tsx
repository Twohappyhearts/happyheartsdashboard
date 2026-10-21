'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { generateTempPassword, passwordStrength } from '@/lib/users';

export const inputClass =
  'w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const STRENGTH_COLORS = ['bg-muted', 'bg-danger', 'bg-warning', 'bg-info', 'bg-success'];

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  showStrength?: boolean;
  allowGenerate?: boolean;
  placeholder?: string;
}

/** Password input with Show toggle, optional Generate button and strength meter. */
export default function PasswordField({ id, value, onChange, showStrength, allowGenerate, placeholder }: Props) {
  const [show, setShow] = useState(false);
  const strength = passwordStrength(value);
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={id}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
            placeholder={placeholder}
            className={`${inputClass} pr-16 font-mono`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[11px] font-600 text-muted-foreground hover:text-foreground"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        {allowGenerate && (
          <button
            type="button"
            onClick={() => {
              onChange(generateTempPassword());
              setShow(true);
            }}
            title="Generate a strong temporary password"
            className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150 whitespace-nowrap"
          >
            <Icon name="SparklesIcon" size={13} variant="outline" />
            Generate
          </button>
        )}
      </div>
      {showStrength && value && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex gap-1 flex-1">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={`pw-bar-${i}`}
                className={`h-1 flex-1 rounded-full ${i <= strength.score ? STRENGTH_COLORS[strength.score] : 'bg-muted'}`}
              />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground w-12 text-right">{strength.label}</span>
        </div>
      )}
    </div>
  );
}
