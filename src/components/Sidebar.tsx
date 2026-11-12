'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useOpenAlerts } from '@/contexts/OpenAlertsContext';
import { useStaffT } from '@/lib/i18n/staff/context';
import type { StaffText } from '@/lib/i18n/staff';

type NavLabel = Exclude<keyof StaffText['nav'], 'groups' | 'expandSidebar' | 'collapseSidebar' | 'collapse' | 'signOut'>;

interface NavItem {
  label: NavLabel;
  href: string;
  icon: string;
  badge?: number;
  /** Shown only to Admin accounts. */
  adminOnly?: boolean;
}

interface NavGroup {
  groupLabel: keyof StaffText['nav']['groups'];
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    groupLabel: 'patientCare',
    items: [
      { label: 'messages', href: '/messages', icon: 'ChatBubbleLeftRightIcon' },
      { label: 'content', href: '/content-management', icon: 'BookOpenIcon' },
      { label: 'surveys', href: '/survey-management', icon: 'ClipboardDocumentListIcon' },
      { label: 'alerts', href: '/alerts', icon: 'BellAlertIcon' },
    ],
  },
  {
    groupLabel: 'insights',
    items: [
      { label: 'analytics', href: '/analytics', icon: 'ChartBarIcon' },
      { label: 'aiNotice', href: '/ai-notice', icon: 'ShieldCheckIcon' },
    ],
  },
  {
    groupLabel: 'aiAssistant',
    items: [
      { label: 'aiChat', href: '/ai-chat', icon: 'SparklesIcon' },
      { label: 'knowledgeBase', href: '/knowledge-base', icon: 'CircleStackIcon' },
      { label: 'trustedWebsites', href: '/trusted-websites', icon: 'GlobeAltIcon' },
    ],
  },
  {
    groupLabel: 'admin',
    items: [
      { label: 'users', href: '/user-management', icon: 'UsersIcon' },
      { label: 'settings', href: '/settings', icon: 'Cog6ToothIcon' },
      { label: 'legalDocuments', href: '/legal-documents', icon: 'DocumentTextIcon', adminOnly: true },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut, profile } = useAuth();
  const { t } = useStaffT();
  const isAdmin = profile?.role === 'admin';
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) }))
    .filter((g) => g.items.length > 0);
  const { openCount } = useOpenAlerts();
  const badgeFor = (item: NavItem) => (item.href === '/alerts' ? openCount : item.badge);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/sign-up-login');
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`
        fixed top-0 left-0 h-full z-30 bg-card border-r border-border flex flex-col
        sidebar-transition shadow-sidebar
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Logo */}
      <div className={`flex items-center h-16 border-b border-border px-3 shrink-0 ${collapsed ? 'justify-center' : 'gap-2.5 px-4'}`}>
        <AppLogo size={32} />
        {!collapsed && (
          <span className="font-bold text-[15px] text-foreground tracking-tight">
            HappyHearts
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2">
        {groups.map((group) => (
          <div key={`group-${group.groupLabel}`} className="mb-4">
            {!collapsed && (
              <p className="text-[10px] font-600 tracking-widest text-muted-foreground uppercase px-2 mb-1.5">
                {t.nav.groups[group.groupLabel]}
              </p>
            )}
            {group.items.map((item) => (
              <Link
                key={`nav-${item.href}`}
                href={item.href}
                title={collapsed ? t.nav[item.label] : undefined}
                className={`
                  flex items-center gap-3 rounded-lg px-2.5 py-2 mb-0.5 text-sm font-medium
                  transition-all duration-150 group relative
                  ${isActive(item.href)
                    ? 'bg-primary/10 text-primary' :'text-secondary-foreground hover:bg-muted hover:text-foreground'
                  }
                  ${collapsed ? 'justify-center px-2' : ''}
                `}
              >
                <Icon
                  name={item.icon as Parameters<typeof Icon>[0]['name']}
                  size={18}
                  variant={isActive(item.href) ? 'solid' : 'outline'}
                  className="shrink-0"
                />
                {!collapsed && (
                  <span className="flex-1 text-[13.5px]">{t.nav[item.label]}</span>
                )}
                {!collapsed && (badgeFor(item) ?? 0) > 0 ? (
                  <span className="bg-primary text-primary-foreground text-[10px] font-700 rounded-full min-w-[18px] h-[18px] flex items-center justify-center leading-none px-1">
                    {(badgeFor(item) ?? 0) > 99 ? '99+' : badgeFor(item)}
                  </span>
                ) : null}
                {collapsed && (badgeFor(item) ?? 0) > 0 ? (
                  <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[9px] font-700 rounded-full min-w-[14px] h-3.5 flex items-center justify-center leading-none px-0.5">
                    {(badgeFor(item) ?? 0) > 99 ? '99+' : badgeFor(item)}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border p-2 shrink-0">
        <button
          onClick={onToggle}
          className={`
            w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium
            text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150
            ${collapsed ? 'justify-center' : ''}
          `}
          title={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
        >
          <Icon
            name={collapsed ? 'ChevronRightIcon' : 'ChevronLeftIcon'}
            size={16}
            variant="outline"
          />
          {!collapsed && <span className="text-[13px]">{t.nav.collapse}</span>}
        </button>
        <button
          onClick={handleSignOut}
          className={`
            w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium
            text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150
            ${collapsed ? 'justify-center' : ''}
          `}
          title={collapsed ? t.nav.signOut : undefined}
        >
          <Icon name="ArrowRightOnRectangleIcon" size={16} variant="outline" />
          {!collapsed && <span className="text-[13px]">{t.nav.signOut}</span>}
        </button>
      </div>
    </aside>
  );
}