'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';


interface UserSessionEvent {
  sessionId: string;
  sessionTitle: string;
  opened: boolean;
  videoPlayed: boolean;
  audioPlayed: boolean;
  infographicViewed: boolean;
  completed: boolean;
  watchedVideo: boolean;
  reviewedInfographic: boolean;
  finishedQuiz: boolean;
  timeOnPage: number;
  lastOpenedAt: string;
}

interface UserAnalytics {
  id: string;
  username: string;
  fullName: string;
  lastActive: string;
  sessionsOpened: number;
  totalTimeSec: number;
  sessions: UserSessionEvent[];
}

const mockUserAnalytics: UserAnalytics[] = [
  {
    id: 'user-001',
    username: 'rocketcar',
    fullName: 'Maria Gonzalez',
    lastActive: '2026-10-07T05:30:00',
    sessionsOpened: 7,
    totalTimeSec: 3421,
    sessions: [
      { sessionId: 'session-001', sessionTitle: 'Understanding Heart Failure', opened: true, videoPlayed: true, audioPlayed: true, infographicViewed: true, completed: true, watchedVideo: true, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 612, lastOpenedAt: '2026-10-06' },
      { sessionId: 'session-002', sessionTitle: 'Managing Your Medications', opened: true, videoPlayed: true, audioPlayed: false, infographicViewed: false, completed: true, watchedVideo: true, reviewedInfographic: false, finishedQuiz: true, timeOnPage: 548, lastOpenedAt: '2026-10-06' },
      { sessionId: 'session-003', sessionTitle: 'Daily Weight Monitoring', opened: true, videoPlayed: false, audioPlayed: true, infographicViewed: true, completed: true, watchedVideo: false, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 390, lastOpenedAt: '2026-10-05' },
      { sessionId: 'session-004', sessionTitle: 'Low-Sodium Diet Guide', opened: true, videoPlayed: true, audioPlayed: false, infographicViewed: true, completed: false, watchedVideo: false, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 287, lastOpenedAt: '2026-10-05' },
      { sessionId: 'session-005', sessionTitle: 'Exercise & Physical Activity', opened: true, videoPlayed: true, audioPlayed: true, infographicViewed: false, completed: true, watchedVideo: true, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 421, lastOpenedAt: '2026-10-04' },
      { sessionId: 'session-006', sessionTitle: 'Recognizing Warning Signs', opened: true, videoPlayed: true, audioPlayed: true, infographicViewed: true, completed: true, watchedVideo: true, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 574, lastOpenedAt: '2026-10-03' },
      { sessionId: 'session-007', sessionTitle: 'Stress Management Techniques', opened: true, videoPlayed: false, audioPlayed: true, infographicViewed: false, completed: false, watchedVideo: false, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 189, lastOpenedAt: '2026-10-02' },
    ],
  },
  {
    id: 'user-002',
    username: 'sunflower42',
    fullName: 'James Okafor',
    lastActive: '2026-10-06T19:12:00',
    sessionsOpened: 5,
    totalTimeSec: 2187,
    sessions: [
      { sessionId: 'session-001', sessionTitle: 'Understanding Heart Failure', opened: true, videoPlayed: true, audioPlayed: false, infographicViewed: true, completed: true, watchedVideo: true, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 520, lastOpenedAt: '2026-10-05' },
      { sessionId: 'session-002', sessionTitle: 'Managing Your Medications', opened: true, videoPlayed: true, audioPlayed: true, infographicViewed: false, completed: true, watchedVideo: true, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 488, lastOpenedAt: '2026-10-05' },
      { sessionId: 'session-003', sessionTitle: 'Daily Weight Monitoring', opened: true, videoPlayed: false, audioPlayed: true, infographicViewed: false, completed: false, watchedVideo: false, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 212, lastOpenedAt: '2026-10-04' },
      { sessionId: 'session-004', sessionTitle: 'Low-Sodium Diet Guide', opened: true, videoPlayed: true, audioPlayed: false, infographicViewed: true, completed: true, watchedVideo: true, reviewedInfographic: true, finishedQuiz: true, timeOnPage: 601, lastOpenedAt: '2026-10-04' },
      { sessionId: 'session-005', sessionTitle: 'Exercise & Physical Activity', opened: true, videoPlayed: false, audioPlayed: false, infographicViewed: false, completed: false, watchedVideo: false, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 98, lastOpenedAt: '2026-10-03' },
      { sessionId: 'session-006', sessionTitle: 'Recognizing Warning Signs', opened: false, videoPlayed: false, audioPlayed: false, infographicViewed: false, completed: false, watchedVideo: false, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 0, lastOpenedAt: '' },
      { sessionId: 'session-007', sessionTitle: 'Stress Management Techniques', opened: false, videoPlayed: false, audioPlayed: false, infographicViewed: false, completed: false, watchedVideo: false, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 0, lastOpenedAt: '' },
    ],
  },
  {
    id: 'user-003',
    username: 'heartstrong',
    fullName: 'Linda Chen',
    lastActive: '2026-10-07T02:44:00',
    sessionsOpened: 6,
    totalTimeSec: 2890,
    sessions: [
      { sessionId: 'session-001', sessionTitle: 'Understanding Heart Failure', opened: true, videoPlayed: true, audioPlayed: true, infographicViewed: true, completed: true, watchedVideo: true, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 598, lastOpenedAt: '2026-10-06' },
      { sessionId: 'session-002', sessionTitle: 'Managing Your Medications', opened: true, videoPlayed: true, audioPlayed: true, infographicViewed: false, completed: true, watchedVideo: true, reviewedInfographic: false, finishedQuiz: true, timeOnPage: 542, lastOpenedAt: '2026-10-06' },
      { sessionId: 'session-003', sessionTitle: 'Daily Weight Monitoring', opened: true, videoPlayed: false, audioPlayed: true, infographicViewed: true, completed: true, watchedVideo: false, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 410, lastOpenedAt: '2026-10-05' },
      { sessionId: 'session-004', sessionTitle: 'Low-Sodium Diet Guide', opened: true, videoPlayed: true, audioPlayed: false, infographicViewed: true, completed: true, watchedVideo: true, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 534, lastOpenedAt: '2026-10-04' },
      { sessionId: 'session-005', sessionTitle: 'Exercise & Physical Activity', opened: true, videoPlayed: true, audioPlayed: true, infographicViewed: false, completed: false, watchedVideo: false, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 321, lastOpenedAt: '2026-10-03' },
      { sessionId: 'session-006', sessionTitle: 'Recognizing Warning Signs', opened: true, videoPlayed: false, audioPlayed: false, infographicViewed: true, completed: false, watchedVideo: false, reviewedInfographic: true, finishedQuiz: false, timeOnPage: 185, lastOpenedAt: '2026-10-02' },
      { sessionId: 'session-007', sessionTitle: 'Stress Management Techniques', opened: false, videoPlayed: false, audioPlayed: false, infographicViewed: false, completed: false, watchedVideo: false, reviewedInfographic: false, finishedQuiz: false, timeOnPage: 0, lastOpenedAt: '' },
    ],
  },
];

function fmtTime(sec: number): string {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function EventDot({ active, color }: { active: boolean; color: string }) {
  return (
    <span className={`w-2.5 h-2.5 rounded-full inline-block ${active ? color : 'bg-muted'}`} />
  );
}

export default function IndividualAnalytics() {
  const [selectedUser, setSelectedUser] = useState<UserAnalytics>(mockUserAnalytics[0]);
  const [search, setSearch] = useState('');

  const filteredUsers = mockUserAnalytics.filter(u =>
    u.fullName.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
      {/* User list */}
      <div className="xl:col-span-1 bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Icon name="MagnifyingGlassIcon" size={13} variant="outline" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Find patient..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-[12px] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="overflow-y-auto max-h-[500px] scrollbar-thin">
          {filteredUsers.map(user => (
            <button
              key={`ulist-${user.id}`}
              onClick={() => setSelectedUser(user)}
              className={`
                w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors duration-100
                ${selectedUser.id === user.id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/30'}
              `}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[11px] font-700 shrink-0">
                  {user.fullName.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-600 text-foreground truncate">{user.fullName}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">@{user.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5 pl-9">
                <span className="text-[10px] text-muted-foreground">{user.sessionsOpened}/7 sessions</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{fmtTime(user.totalTimeSec)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="xl:col-span-3 space-y-4">
        {/* User summary */}
        <div className="bg-card rounded-xl border border-border shadow-card p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[16px] font-700 shrink-0">
              {selectedUser.fullName.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <h3 className="text-[16px] font-600 text-foreground">{selectedUser.fullName}</h3>
              <p className="text-[12px] font-mono text-muted-foreground">@{selectedUser.username}</p>
            </div>
            <div className="ml-auto grid grid-cols-3 gap-6 text-right">
              <div>
                <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">Last Active</p>
                <p className="text-[13px] font-600 text-foreground mt-0.5">
                  {new Date(selectedUser.lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">Sessions</p>
                <p className="text-[13px] font-600 text-foreground mt-0.5">{selectedUser.sessionsOpened} / 7</p>
              </div>
              <div>
                <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">Total Time</p>
                <p className="text-[13px] font-600 text-foreground mt-0.5">{fmtTime(selectedUser.totalTimeSec)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Session timeline */}
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-[14px] font-600 text-foreground">Session Activity Timeline</h3>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-info inline-block" /> Opened</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger inline-block" /> Video</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning inline-block" /> Audio</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" /> Infographic</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" /> Completed</span>
            </div>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Session</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Opened</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Video</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Audio</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Infographic</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Completed</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Self-Report</th>
                  <th className="text-right px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody>
                {selectedUser.sessions.map((s) => (
                  <tr key={`timeline-${selectedUser.id}-${s.sessionId}`} className={`border-b border-border last:border-0 transition-colors duration-100 ${!s.opened ? 'opacity-40' : 'hover:bg-muted/20'}`}>
                    <td className="px-5 py-3 text-[12px] font-500 text-foreground">{s.sessionTitle}</td>
                    <td className="px-3 py-3 text-center"><EventDot active={s.opened} color="bg-info" /></td>
                    <td className="px-3 py-3 text-center"><EventDot active={s.videoPlayed} color="bg-danger" /></td>
                    <td className="px-3 py-3 text-center"><EventDot active={s.audioPlayed} color="bg-warning" /></td>
                    <td className="px-3 py-3 text-center"><EventDot active={s.infographicViewed} color="bg-accent" /></td>
                    <td className="px-3 py-3 text-center"><EventDot active={s.completed} color="bg-success" /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <span title="Watched the video" className={`w-2 h-2 rounded-sm ${s.watchedVideo ? 'bg-danger' : 'bg-muted'}`} />
                        <span title="Reviewed the infographic" className={`w-2 h-2 rounded-sm ${s.reviewedInfographic ? 'bg-accent' : 'bg-muted'}`} />
                        <span title="Finished the quiz" className={`w-2 h-2 rounded-sm ${s.finishedQuiz ? 'bg-success' : 'bg-muted'}`} />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-[12px] tabular-nums text-muted-foreground">
                      {s.timeOnPage ? fmtTime(s.timeOnPage) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}