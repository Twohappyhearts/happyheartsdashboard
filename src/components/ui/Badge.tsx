import React from 'react';

type BadgeVariant = 'new' | 'ack' | 'resolved' | 'active' | 'inactive' | 'suspended' | 'info' | 'warning';

interface BadgeProps {
  variant: BadgeVariant;
  label: string;
  size?: 'sm' | 'md';
}

const variantMap: Record<BadgeVariant, string> = {
  new: 'status-new',
  ack: 'status-ack',
  resolved: 'status-resolved',
  active: 'status-active',
  inactive: 'status-inactive',
  suspended: 'status-suspended',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
};

export default function Badge({ variant, label, size = 'md' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5';
  return (
    <span className={`inline-flex items-center rounded-full font-600 ${sizeClass} ${variantMap[variant]}`}>
      {label}
    </span>
  );
}