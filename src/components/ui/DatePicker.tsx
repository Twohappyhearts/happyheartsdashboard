'use client';

import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker, type Matcher } from 'react-day-picker';
import { enUS, es } from 'react-day-picker/locale';
import Icon from '@/components/ui/AppIcon';
import { FIELD_VARIANTS, type SelectVariant } from '@/components/ui/Select';
import { useStaffT } from '@/lib/i18n/staff/context';

/**
 * The dashboard's date picker (Radix Popover + react-day-picker), used instead of
 * <input type="date">. Value in and out is 'YYYY-MM-DD' (as the native input), '' for none;
 * dates are local calendar days, never shifted by the time zone.
 */

function parse(v: string | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Earliest / latest day that can be picked ('YYYY-MM-DD'). */
  min?: string;
  max?: string;
  placeholder?: string;
  /** Offer "Clear" (the value can be empty). */
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  'aria-label'?: string;
  /** Same sizes as Select: toolbar (default), field, compact. */
  variant?: SelectVariant;
  /** Extra classes for the button, e.g. its width. */
  className?: string;
}

const NAV_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30';

export function DatePicker({
  value,
  onChange,
  id,
  min,
  max,
  placeholder,
  clearable = true,
  disabled,
  invalid,
  variant = 'toolbar',
  className = '',
  ...aria
}: Props) {
  const { t, lang, locale } = useStaffT();
  const selected = parse(value);
  const first = parse(min);
  const last = parse(max);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => selected ?? last ?? new Date());

  const today = new Date();
  const todayValue = toValue(today);
  const todayAllowed = (!min || todayValue >= min) && (!max || todayValue <= max);
  const unavailable: Matcher[] = [];
  if (first) unavailable.push({ before: first });
  if (last) unavailable.push({ after: last });

  const pick = (d: Date | undefined) => {
    onChange(d ? toValue(d) : '');
    setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setMonth(selected ?? last ?? new Date());
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={aria['aria-label']}
          aria-invalid={invalid || undefined}
          className={`group inline-flex items-center gap-2 rounded-lg border text-left transition-[border-color,box-shadow] duration-150 hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary/50 data-[state=open]:ring-2 data-[state=open]:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 ${
            selected ? 'text-foreground' : 'text-muted-foreground'
          } ${invalid ? 'border-danger' : 'border-border'} ${FIELD_VARIANTS[variant]} ${className}`}
        >
          <Icon name="CalendarDaysIcon" size={15} variant="outline" className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {selected
              ? selected.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
              : placeholder ?? t.common.pickDate}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="popover-in z-[80] rounded-xl border border-border bg-card p-3 shadow-modal focus:outline-none"
          style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => d && pick(d)}
            month={month}
            onMonthChange={setMonth}
            disabled={unavailable}
            startMonth={first}
            endMonth={last}
            locale={lang === 'es' ? es : enUS}
            showOutsideDays
            classNames={{
              root: 'text-[13px]',
              months: 'relative',
              month: 'space-y-2',
              month_caption: 'flex h-8 items-center justify-center',
              caption_label: 'text-[13.5px] font-600 capitalize text-foreground',
              nav: 'absolute inset-x-0 top-0 z-10 flex items-center justify-between',
              button_previous: NAV_BUTTON,
              button_next: NAV_BUTTON,
              month_grid: 'border-collapse',
              weekdays: 'flex',
              weekday: 'w-9 pb-1 text-center text-[11px] font-500 capitalize text-muted-foreground',
              week: 'mt-0.5 flex',
              day: 'h-9 w-9 p-0 text-center',
              day_button:
                'inline-flex h-9 w-9 items-center justify-center rounded-lg text-[13px] text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected:
                '[&>button]:bg-primary [&>button]:font-600 [&>button]:text-primary-foreground [&>button:hover]:bg-primary',
              today: '[&>button]:font-700 [&>button]:text-primary',
              outside: '[&>button]:text-muted-foreground/50',
              disabled: '[&>button]:pointer-events-none [&>button]:opacity-30',
              hidden: 'invisible',
            }}
            components={{
              Chevron: ({ orientation }) => (
                <Icon
                  name={orientation === 'left' ? 'ChevronLeftIcon' : 'ChevronRightIcon'}
                  size={15}
                  variant="outline"
                />
              ),
            }}
          />
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => pick(today)}
              disabled={!todayAllowed}
              className="h-8 rounded-lg px-2.5 text-[12.5px] font-600 text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
            >
              {t.common.today}
            </button>
            {clearable && value && (
              <button
                type="button"
                onClick={() => pick(undefined)}
                className="h-8 rounded-lg px-2.5 text-[12.5px] font-600 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t.common.clear}
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default DatePicker;
