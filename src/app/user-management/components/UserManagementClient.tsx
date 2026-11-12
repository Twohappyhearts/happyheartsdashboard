'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';

import SlideOver from '@/components/ui/SlideOver';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { displayName, initials, useAuth } from '@/contexts/AuthContext';
import { openConversationForPatient } from '@/lib/chat';
import { UsersError, formatPhone, listUsers, updateUser, type AccountRole, type ManagedUser } from '@/lib/users';
import { useStaffT } from '@/lib/i18n/staff/context';
import AddUserModal from './AddUserModal';
import EditUserModal from './EditUserModal';
import BroadcastModal from './BroadcastModal';
import ReenableConfirmModal from './ReenableConfirmModal';

type StatusFilter = 'all' | 'active' | 'disabled';
type RoleFilter = 'all' | AccountRole;
type SortKey = 'name' | 'username' | 'displayId' | 'role' | 'createdAt' | 'lastActiveAt' | 'lessonsOpened' | 'alertsSent' | 'active';

const PAGE_SIZE = 20;

// Theme colors are CSS variables, so /opacity modifiers don't apply: outline pills.
const ROLE_PILL: Record<AccountRole, string> = {
  patient: 'text-info border border-current',
  staff: 'text-success border border-current',
  admin: 'text-primary border border-current',
};

function RolePill({ role }: { role: AccountRole }) {
  const T = useStaffT().t.users;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-700 tracking-wider ${ROLE_PILL[role]}`}>
      {T.roles[role]}
    </span>
  );
}

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

const nameOf = (u: ManagedUser) => displayName({ fullName: u.fullName, username: u.username });

export default function UserManagementClient() {
  const router = useRouter();
  const { profile } = useAuth();
  const callerIsAdmin = profile?.role === 'admin';
  const { t, locale } = useStaffT();
  const T = t.users;
  const date = (iso: string | null) => fmtDate(iso, locale);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [addOpen, setAddOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [reenableTarget, setReenableTarget] = useState<ManagedUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listUsers(createClient());
      setUsers(list);
      setError(null);
    } catch (e) {
      setError(e instanceof UsersError ? e.message : T.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPatient = users.find((u) => u.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const val = (u: ManagedUser): string | number => {
      switch (sortKey) {
        case 'name': return nameOf(u).toLowerCase();
        case 'username': return u.username.toLowerCase();
        case 'displayId': return u.displayId.toLowerCase();
        case 'role': return u.role;
        case 'createdAt': return u.createdAt;
        case 'lastActiveAt': return u.lastActiveAt ?? '';
        case 'lessonsOpened': return u.lessonsOpened;
        case 'alertsSent': return u.alertsSent;
        case 'active': return u.active ? 1 : 0;
      }
    };
    return users
      .filter((u) => {
        const matchSearch =
          !q ||
          u.username.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q) ||
          u.displayId.toLowerCase().includes(q) ||
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone.replace(/[^0-9]/g, '').includes(q.replace(/[^0-9]/g, '') || '\u0000');
        const matchStatus = statusFilter === 'all' ? true : statusFilter === 'active' ? u.active : !u.active;
        const matchRole = roleFilter === 'all' ? true : u.role === roleFilter;
        return matchSearch && matchStatus && matchRole;
      })
      .sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (typeof av === 'string' && typeof bv === 'string') {
          return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
        }
        return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number);
      });
  }, [users, search, statusFilter, roleFilter, sortKey, sortDir]);

  useEffect(() => setPage(1), [search, statusFilter, roleFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const canManage = (u: ManagedUser) => u.id !== profile?.id && (callerIsAdmin || u.role !== 'admin');

  const setActive = async (u: ManagedUser, active: boolean) => {
    setBusyId(u.id);
    try {
      await updateUser(u.id, { isActive: active });
      toast.success(active ? T.reenabled(u.username) : T.disabledToast(u.username));
      setReenableTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof UsersError ? e.message : T.statusFailed);
    } finally {
      setBusyId(null);
    }
  };

  const requestToggle = (u: ManagedUser) => {
    if (!canManage(u)) {
      toast.error(u.id === profile?.id ? T.cantDisableSelf : T.adminOnly);
      return;
    }
    if (u.active) setActive(u, false);
    else setReenableTarget(u); // warning dialog first
  };

  const openChat = async (u: ManagedUser) => {
    if (u.role !== 'patient') return;
    if (!u.active) {
      toast.error(T.reenableFirst);
      return;
    }
    setBusyId(u.id);
    try {
      const id = await openConversationForPatient(createClient(), u.id);
      router.push(`/messages?c=${encodeURIComponent(id)}`);
    } catch {
      toast.error(T.openChatFailed);
      setBusyId(null);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className={`ml-1 text-[10px] ${sortKey === col ? 'text-primary' : 'text-muted-foreground'}`}>
      {sortKey === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  const count = (f: (u: ManagedUser) => boolean) => users.filter(f).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">{T.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2.5 border border-border bg-card text-foreground rounded-lg text-[13px] font-600 hover:bg-muted transition-all duration-150 active:scale-95 whitespace-nowrap"
            onClick={() => setBroadcastOpen(true)}
            disabled={loading}
          >
            <Icon name="MegaphoneIcon" size={16} variant="outline" />
            {T.broadcast}
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap"
            onClick={() => setAddOpen(true)}
          >
            <Icon name="UserPlusIcon" size={16} variant="outline" />
            {T.add}
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: T.stats.total, value: users.length, color: 'text-foreground', bg: 'bg-card border-border' },
          { label: T.stats.active, value: count(u => u.active), color: 'text-success', bg: 'bg-success/5 border-success/20' },
          { label: T.stats.admins, value: count(u => u.role === 'admin'), color: 'text-primary', bg: 'bg-primary/5 border-primary/20' },
          { label: T.stats.careteam, value: count(u => u.role === 'staff'), color: 'text-success', bg: 'bg-card border-border' },
          { label: T.stats.patients, value: count(u => u.role === 'patient'), color: 'text-info', bg: 'bg-info/5 border-info/20' },
        ].map(stat => (
          <div key={`ustat-${stat.label}`} className={`rounded-xl border p-4 ${stat.bg}`}>
            <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
            {loading ? <Skeleton className="h-9 w-12" /> : <p className={`text-[28px] font-700 tabular-nums ${stat.color}`}>{stat.value}</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={T.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-80"
          />
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['all', 'active', 'disabled'] as const).map(f => (
            <button
              key={`uf-${f}`}
              onClick={() => setStatusFilter(f)}
              className={`
                px-3 py-1.5 rounded-md text-[12px] font-500 transition-all duration-150
                ${statusFilter === f ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              {T.status[f]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {([
            { key: 'all', label: T.roleFilters.all },
            { key: 'patient', label: T.roleFilters.patient },
            { key: 'staff', label: T.roleFilters.staff },
            { key: 'admin', label: T.roleFilters.admin },
          ] as { key: RoleFilter; label: string }[]).map(f => (
            <button
              key={`rf-${f.key}`}
              onClick={() => setRoleFilter(f.key)}
              className={`
                px-3 py-1.5 rounded-md text-[12px] font-500 transition-all duration-150
                ${roleFilter === f.key ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-muted-foreground ml-auto">{T.results(filtered.length)}</span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1080px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {(['name', 'username', 'displayId', 'role', 'createdAt', 'lastActiveAt', 'lessonsOpened', 'alertsSent', 'active'] as SortKey[])
                  .map((key) => ({ key, label: T.columns[key] }))
                  .map(col => (
                  <th
                    key={`uth-${col.key}`}
                    onClick={() => handleSort(col.key)}
                    className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                  >
                    {col.label}
                    <SortIcon col={col.key} />
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-32">{T.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`u-skel-${i}`} className="border-b border-border last:border-0">
                    <td colSpan={10} className="px-4 py-3"><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState icon="ExclamationTriangleIcon" title={T.loadFailedTitle} description={error} action={{ label: T.retry, onClick: () => { setLoading(true); load(); } }} />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon="UsersIcon"
                      title={T.emptyTitle}
                      description={T.emptyBody}
                      action={{ label: T.add, onClick: () => setAddOpen(true) }}
                    />
                  </td>
                </tr>
              ) : pageRows.map(user => {
                const name = nameOf(user);
                const isPatient = user.role === 'patient';
                const manageable = canManage(user);
                return (
                  <tr
                    key={user.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors duration-100 group cursor-pointer"
                    onClick={() => setSelectedId(user.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[11px] font-700 shrink-0">
                          {initials(name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-600 text-foreground truncate max-w-[200px]">{name}</p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{user.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[12px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{user.username}</code>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground">{user.displayId || '—'}</td>
                    <td className="px-4 py-3"><RolePill role={user.role} /></td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{date(user.createdAt)}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">{date(user.lastActiveAt)}</td>
                    <td className="px-4 py-3 text-[13px] tabular-nums font-500 text-foreground">{isPatient ? user.lessonsOpened : '—'}</td>
                    <td className="px-4 py-3 text-[13px] tabular-nums font-500 text-foreground">{isPatient ? user.alertsSent : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-0.5">
                        <Badge variant={user.active ? 'active' : 'suspended'} label={user.active ? T.active : T.disabled} />
                        {user.mustChangePassword && user.active && (
                          <span className="text-[10px] text-muted-foreground" title={T.tempPasswordHint}>{T.tempPassword}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(user)}
                          title={T.editUser}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                        >
                          <Icon name="PencilSquareIcon" size={14} variant="outline" />
                        </button>
                        {user.active ? (
                          <button
                            onClick={() => requestToggle(user)}
                            disabled={!manageable || busyId === user.id}
                            title={manageable ? T.disableAccount : T.cantDisable}
                            className="p-1.5 rounded-md hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors duration-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                          >
                            <Icon name="NoSymbolIcon" size={14} variant="outline" />
                          </button>
                        ) : (
                          <button
                            onClick={() => requestToggle(user)}
                            disabled={!manageable || busyId === user.id}
                            title={T.reenableAccount}
                            className="p-1.5 rounded-md hover:bg-success/10 text-muted-foreground hover:text-success transition-colors duration-100 disabled:opacity-40"
                          >
                            <Icon name="CheckCircleIcon" size={14} variant="outline" />
                          </button>
                        )}
                        {isPatient && (
                          <button
                            onClick={() => openChat(user)}
                            disabled={busyId === user.id}
                            title={T.openChat}
                            className="p-1.5 rounded-md hover:bg-info/10 text-muted-foreground hover:text-info transition-colors duration-100 disabled:opacity-40"
                          >
                            <Icon name="ChatBubbleLeftRightIcon" size={14} variant="outline" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedId(user.id)}
                          title={T.viewDetails}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                        >
                          <Icon name="EyeIcon" size={14} variant="outline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <p className="text-[12px] text-muted-foreground">
            {T.showing(pageRows.length, filtered.length)}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1.5 border border-border rounded-md text-[12px] text-muted-foreground hover:bg-muted transition-colors duration-100 disabled:opacity-40"
            >
              {T.prev}
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
              <button
                key={`page-${n}`}
                onClick={() => setPage(n)}
                className={n === currentPage
                  ? 'px-2.5 py-1.5 bg-primary text-primary-foreground rounded-md text-[12px] font-600'
                  : 'px-2.5 py-1.5 border border-border rounded-md text-[12px] text-muted-foreground hover:bg-muted transition-colors duration-100'}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              className="px-2.5 py-1.5 border border-border rounded-md text-[12px] text-muted-foreground hover:bg-muted transition-colors duration-100 disabled:opacity-40"
            >
              {T.next}
            </button>
          </div>
        </div>
      </div>

      {/* User Detail SlideOver */}
      <SlideOver
        open={!!selectedPatient}
        onClose={() => setSelectedId(null)}
        title={T.profileTitle}
        subtitle={selectedPatient ? `${T.roles[selectedPatient.role]} · @${selectedPatient.username}` : ''}
        width="md"
      >
        {selectedPatient && (
          <div className="space-y-5">
            {/* Avatar + info */}
            <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[18px] font-700 shrink-0">
                {initials(nameOf(selectedPatient))}
              </div>
              <div className="min-w-0">
                <h3 className="text-[16px] font-600 text-foreground truncate">{nameOf(selectedPatient)}</h3>
                <p className="text-[12px] font-mono text-muted-foreground">@{selectedPatient.username}</p>
                <p className="text-[12px] text-muted-foreground truncate">{selectedPatient.email || '—'}</p>
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">{T.accountStatus}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={selectedPatient.active ? 'active' : 'suspended'} label={selectedPatient.active ? T.active : T.disabled} />
                <RolePill role={selectedPatient.role} />
                {canManage(selectedPatient) && (
                  selectedPatient.active ? (
                    <button
                      onClick={() => requestToggle(selectedPatient)}
                      disabled={busyId === selectedPatient.id}
                      className="px-3 py-1 bg-warning/10 text-warning rounded-lg text-[12px] font-600 hover:bg-warning/20 transition-colors duration-150"
                    >
                      {T.disable}
                    </button>
                  ) : (
                    <button
                      onClick={() => requestToggle(selectedPatient)}
                      disabled={busyId === selectedPatient.id}
                      className="px-3 py-1 bg-success/10 text-success rounded-lg text-[12px] font-600 hover:bg-success/20 transition-colors duration-150"
                    >
                      {T.reenable}
                    </button>
                  )
                )}
                <button
                  onClick={() => setEditing(selectedPatient)}
                  className="px-3 py-1 bg-muted text-foreground rounded-lg text-[12px] font-600 hover:bg-muted/70 transition-colors duration-150"
                >
                  {T.edit}
                </button>
              </div>
              {selectedPatient.mustChangePassword && (
                <p className="text-[11px] text-muted-foreground mt-2">{T.hasTempPassword}</p>
              )}
            </div>

            {/* Key details */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: T.details.displayId, value: selectedPatient.displayId || '—' },
                { label: T.details.phone, value: formatPhone(selectedPatient.phone) || '—' },
                { label: T.details.joined, value: date(selectedPatient.createdAt) },
                { label: T.details.lastSignIn, value: date(selectedPatient.lastSignInAt) },
                { label: T.details.lastActive, value: date(selectedPatient.lastActiveAt) },
              ].map(detail => (
                <div key={`detail-${detail.label}`} className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">{detail.label}</p>
                  <p className="text-[13px] font-500 text-foreground mt-0.5">{detail.value}</p>
                </div>
              ))}
            </div>

            {selectedPatient.role === 'patient' && (
              <>
                {/* Activity stats */}
                <div>
                  <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">{T.activity}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: T.activityStats.sessions, value: selectedPatient.lessonsOpened, icon: 'BookOpenIcon' },
                      { label: T.activityStats.completed, value: selectedPatient.lessonsCompleted, icon: 'CheckCircleIcon' },
                      { label: T.activityStats.alerts, value: selectedPatient.alertsSent, icon: 'BellAlertIcon' },
                    ].map(stat => (
                      <div key={`pstat-${stat.label}`} className="p-3 bg-muted/30 rounded-lg text-center">
                        <Icon name={stat.icon as Parameters<typeof Icon>[0]['name']} size={16} variant="outline" className="text-muted-foreground mx-auto mb-1" />
                        <p className="text-[20px] font-700 tabular-nums text-foreground">{stat.value}</p>
                        <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* REDCap participant code */}
                <div>
                  <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">{T.participantCode}</p>
                  <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2.5 border border-border">
                    <code className="text-[13px] font-mono text-foreground flex-1">{selectedPatient.username}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(selectedPatient.username); toast.success(T.codeCopied); }}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                      title={T.copyCode}
                    >
                      <Icon name="ClipboardDocumentIcon" size={14} variant="outline" />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{T.codeHint}</p>
                </div>

                <button
                  onClick={() => openChat(selectedPatient)}
                  disabled={busyId === selectedPatient.id}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 disabled:opacity-60"
                >
                  <Icon name="ChatBubbleLeftRightIcon" size={15} variant="outline" />
                  {T.openChatButton}
                </button>
              </>
            )}
          </div>
        )}
      </SlideOver>

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} canCreateAdmin={callerIsAdmin} />
      <EditUserModal
        user={editing}
        callerId={profile?.id ?? null}
        callerIsAdmin={callerIsAdmin}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
      <BroadcastModal open={broadcastOpen} users={users} onClose={() => setBroadcastOpen(false)} onSent={load} />
      <ReenableConfirmModal
        open={!!reenableTarget}
        username={reenableTarget?.username ?? ''}
        busy={busyId === reenableTarget?.id}
        onCancel={() => setReenableTarget(null)}
        onConfirm={() => reenableTarget && setActive(reenableTarget, true)}
      />
    </div>
  );
}
