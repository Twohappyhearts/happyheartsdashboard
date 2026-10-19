'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

interface AppLayoutProps {
  children: React.ReactNode;
  alertCount?: number;
}

export default function AppLayout({ children, alertCount = 3 }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <Topbar sidebarCollapsed={collapsed} alertCount={alertCount} />
      <main
        className={`
          pt-16 min-h-screen content-transition
          ${collapsed ? 'ml-16' : 'ml-60'}
        `}
      >
        <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}