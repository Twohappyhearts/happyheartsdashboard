import React from 'react';
import Icon from '@/components/ui/AppIcon';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={28} variant="outline" className="text-muted-foreground" />
      </div>
      <h3 className="text-[15px] font-600 text-foreground mb-1">{title}</h3>
      <p className="text-[13px] text-muted-foreground max-w-xs mb-5">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}