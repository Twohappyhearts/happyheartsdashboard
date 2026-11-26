'use client';

import React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import Icon from '@/components/ui/AppIcon';

/**
 * The dashboard's dropdown (Radix Select), used instead of the native <select>: keyboard (arrows,
 * Home/End, type a letter to jump, Esc), screen readers, the list kept inside the window, the
 * same look on every browser.
 *
 * An option may use '' as its value (e.g. "All"). Radix reserves '' for "nothing chosen", so it
 * is mapped to a private value inside this component; callers keep using ''.
 */
export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  name?: string;
  /** Shown while the value matches no option. */
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  onBlur?: () => void;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** toolbar: filters above lists (default); field: a form field; compact: inline, small. */
  variant?: SelectVariant;
  /** Extra classes for the button, e.g. its width. */
  className?: string;
}

export type SelectVariant = 'toolbar' | 'field' | 'compact';

/** Height, padding and background of the button for each variant (shared with DatePicker). */
export const FIELD_VARIANTS: Record<SelectVariant, string> = {
  toolbar: 'h-9 pl-3 pr-2.5 text-[13px] bg-card',
  field: 'h-[38px] pl-3 pr-2.5 text-[13px] bg-background',
  compact: 'h-7 pl-2 pr-1.5 text-[12px] bg-card',
};

const EMPTY = '__hh_empty__';
const toRadix = (v: string) => (v === '' ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? '' : v);

export const Select = React.forwardRef<HTMLButtonElement, Props>(function Select(
  { value, onValueChange, options, id, name, placeholder, disabled, invalid, onBlur, variant = 'toolbar', className = '', ...aria },
  ref,
) {
  const known = options.some((o) => o.value === value);
  return (
    <RadixSelect.Root
      value={known ? toRadix(value) : ''}
      onValueChange={(v) => onValueChange(fromRadix(v))}
      name={name}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        ref={ref}
        id={id}
        onBlur={onBlur}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={invalid || undefined}
        className={`group inline-flex items-center justify-between gap-2 rounded-lg border text-left text-foreground transition-[border-color,box-shadow] duration-150 hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary/50 data-[state=open]:ring-2 data-[state=open]:ring-primary/15 data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 ${
          invalid ? 'border-danger' : 'border-border'
        } ${FIELD_VARIANTS[variant]} ${className}`}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon className="shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180">
          <Icon name="ChevronDownIcon" size={14} variant="outline" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className="popover-in z-[80] min-w-[var(--radix-select-trigger-width)] max-w-[min(420px,calc(100vw-16px))] max-h-[min(320px,var(--radix-select-content-available-height))] overflow-hidden rounded-xl border border-border bg-card shadow-modal"
          style={{ transformOrigin: 'var(--radix-select-content-transform-origin)' }}
        >
          <RadixSelect.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
            <Icon name="ChevronUpIcon" size={13} variant="outline" />
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value || EMPTY}
                value={toRadix(o.value)}
                disabled={o.disabled}
                className="relative flex min-h-9 cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-[13px] text-foreground outline-none transition-colors duration-100 data-[highlighted]:bg-muted data-[state=checked]:font-600 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
              >
                <RadixSelect.ItemIndicator className="absolute left-2.5 inline-flex text-primary">
                  <Icon name="CheckIcon" size={14} variant="outline" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
            <Icon name="ChevronDownIcon" size={13} variant="outline" />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
});

export default Select;
