'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

import Toggle from '@/components/ui/Toggle';
import SlideOver from '@/components/ui/SlideOver';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import ContentForm from './ContentForm';
import AppImage from '@/components/ui/AppImage';

export interface ContentSession {
  id: string;
  title: string;
  groupId: string;
  sessionNumber: string;
  videoUrl: string;
  audioUrl: string;
  thumbnailUrl: string;
  infographicUrl: string;
  videoDuration: string;
  audioDuration: string;
  description: string;
  script: string;
  tags: string[];
  active: boolean;
  lastEdited: string;
}

const mockSessions: ContentSession[] = [
{
  id: 'session-001',
  title: 'Understanding Heart Failure',
  groupId: 'group-hf',
  sessionNumber: 'session1',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  audioUrl: 'https://soundcloud.com/happyhearts/heart-failure-intro',
  thumbnailUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_135545a7c-1778531153234.png",
  infographicUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_135545a7c-1778531153234.png",
  videoDuration: '8:32',
  audioDuration: '6:15',
  description: 'An introduction to heart failure, its causes, and what to expect.',
  script: '<p>Heart failure occurs when the heart cannot pump enough blood...</p>',
  tags: ['heart failure', 'basics', 'introduction'],
  active: true,
  lastEdited: '2026-10-05'
},
{
  id: 'session-002',
  title: 'Managing Your Medications',
  groupId: 'group-hf',
  sessionNumber: 'session2',
  videoUrl: 'https://www.youtube.com/watch?v=abc123def456',
  audioUrl: 'https://soundcloud.com/happyhearts/medications',
  thumbnailUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_18e2bf560-1769076259607.png",
  infographicUrl: '',
  videoDuration: '10:45',
  audioDuration: '9:20',
  description: 'Understanding your heart failure medications and how to take them correctly.',
  script: '<p>Your medications are a critical part of managing heart failure...</p>',
  tags: ['medications', 'adherence', 'pharmacy'],
  active: true,
  lastEdited: '2026-10-04'
},
{
  id: 'session-003',
  title: 'Daily Weight Monitoring',
  groupId: 'group-hf',
  sessionNumber: 'session3',
  videoUrl: '',
  audioUrl: 'https://soundcloud.com/happyhearts/weight-monitoring',
  thumbnailUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_4267c9e94-1791353862479.png",
  infographicUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_4267c9e94-1791353862479.png",
  videoDuration: '',
  audioDuration: '4:55',
  description: 'Why weighing yourself every day matters for heart failure patients.',
  script: '<p>Daily weight checks help detect fluid buildup early...</p>',
  tags: ['monitoring', 'fluid', 'daily habits'],
  active: true,
  lastEdited: '2026-10-03'
},
{
  id: 'session-004',
  title: 'Low-Sodium Diet Guide',
  groupId: 'group-diet',
  sessionNumber: 'session1',
  videoUrl: 'https://www.youtube.com/watch?v=xyz789',
  audioUrl: '',
  thumbnailUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_15425cab8-1766083989384.png",
  infographicUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_15425cab8-1766083989384.png",
  videoDuration: '12:10',
  audioDuration: '',
  description: 'How to reduce sodium in your diet to protect your heart.',
  script: '<p>Sodium causes the body to retain water, increasing heart strain...</p>',
  tags: ['diet', 'sodium', 'nutrition'],
  active: true,
  lastEdited: '2026-10-01'
},
{
  id: 'session-005',
  title: 'Exercise & Physical Activity',
  groupId: 'group-lifestyle',
  sessionNumber: 'session1',
  videoUrl: 'https://www.youtube.com/watch?v=exercise001',
  audioUrl: 'https://soundcloud.com/happyhearts/exercise',
  thumbnailUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_14549dca2-1779314576529.png",
  infographicUrl: '',
  videoDuration: '7:22',
  audioDuration: '5:40',
  description: 'Safe exercise guidelines for heart failure patients.',
  script: '<p>Regular, moderate exercise improves heart function and quality of life...</p>',
  tags: ['exercise', 'lifestyle', 'physical activity'],
  active: false,
  lastEdited: '2026-09-28'
},
{
  id: 'session-006',
  title: 'Recognizing Warning Signs',
  groupId: 'group-hf',
  sessionNumber: 'session4',
  videoUrl: 'https://www.youtube.com/watch?v=warning001',
  audioUrl: 'https://soundcloud.com/happyhearts/warning-signs',
  thumbnailUrl: "https://images.unsplash.com/photo-1565524358227-96c5242f9d64",
  infographicUrl: "https://images.unsplash.com/photo-1565524358227-96c5242f9d64",
  videoDuration: '9:05',
  audioDuration: '7:30',
  description: 'Learn the warning signs that require immediate medical attention.',
  script: '<p>Knowing when to call your doctor can save your life...</p>',
  tags: ['warning signs', 'emergency', 'symptoms'],
  active: true,
  lastEdited: '2026-09-25'
},
{
  id: 'session-007',
  title: 'Stress Management Techniques',
  groupId: 'group-lifestyle',
  sessionNumber: 'session2',
  videoUrl: '',
  audioUrl: 'https://soundcloud.com/happyhearts/stress-management',
  thumbnailUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_15f4bcc5c-1768260747914.png",
  infographicUrl: '',
  videoDuration: '',
  audioDuration: '11:15',
  description: 'Effective techniques for managing stress with heart failure.',
  script: '<p>Chronic stress elevates cortisol and strains the cardiovascular system...</p>',
  tags: ['stress', 'mental health', 'relaxation'],
  active: true,
  lastEdited: '2026-09-20'
}];


const mockResources: ContentSession[] = [
{
  id: 'resource-001',
  title: 'Heart Failure Support Group',
  groupId: 'group-community',
  sessionNumber: 'resource1',
  videoUrl: 'https://www.youtube.com/watch?v=support001',
  audioUrl: '',
  thumbnailUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_17d69b072-1767618009555.png",
  infographicUrl: '',
  videoDuration: '15:00',
  audioDuration: '',
  description: 'Connect with others living with heart failure.',
  script: '<p>Our community support group meets every Tuesday...</p>',
  tags: ['community', 'support', 'group'],
  active: true,
  lastEdited: '2026-10-02'
},
{
  id: 'resource-002',
  title: 'Caregiver Resources',
  groupId: 'group-community',
  sessionNumber: 'resource2',
  videoUrl: '',
  audioUrl: 'https://soundcloud.com/happyhearts/caregivers',
  thumbnailUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_1c71c77cc-1769714606338.png",
  infographicUrl: "https://img.rocket.new/generatedImages/rocket_gen_img_1c71c77cc-1769714606338.png",
  videoDuration: '',
  audioDuration: '8:45',
  description: 'Tools and guidance for family caregivers supporting heart failure patients.',
  script: '<p>Caregivers play a vital role in heart failure management...</p>',
  tags: ['caregiver', 'family', 'support'],
  active: true,
  lastEdited: '2026-09-30'
}];


type Tab = 'sessions' | 'resources';

export default function ContentManagementClient() {
  const [activeTab, setActiveTab] = useState<Tab>('sessions');
  const [sessions, setSessions] = useState<ContentSession[]>(mockSessions);
  const [resources, setResources] = useState<ContentSession[]>(mockResources);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentSession | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const items = activeTab === 'sessions' ? sessions : resources;
  const setItems = activeTab === 'sessions' ? setSessions : setResources;

  const filtered = items.filter((item) => {
    const matchSearch = item.title.toLowerCase().includes(search.toLowerCase()) ||
    item.groupId.toLowerCase().includes(search.toLowerCase()) ||
    item.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchActive =
    filterActive === 'all' ? true :
    filterActive === 'active' ? item.active :
    !item.active;
    return matchSearch && matchActive;
  });

  const handleToggleActive = (id: string) => {
    setItems((prev) => prev.map((item) =>
    item.id === id ? { ...item, active: !item.active } : item
    ));
    toast.success('Content visibility updated');
  };

  const handleEdit = (item: ContentSession) => {
    setEditingItem(item);
    setSlideOverOpen(true);
  };

  const handleNew = () => {
    setEditingItem(null);
    setSlideOverOpen(true);
  };

  const handleSave = (data: ContentSession) => {
    if (editingItem) {
      setItems((prev) => prev.map((item) => item.id === data.id ? data : item));
      toast.success('Content updated successfully');
    } else {
      const newItem = { ...data, id: `${activeTab === 'sessions' ? 'session' : 'resource'}-${Date.now()}`, lastEdited: new Date().toISOString().split('T')[0] };
      setItems((prev) => [...prev, newItem]);
      toast.success('Content created successfully');
    }
    setSlideOverOpen(false);
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setDeleteConfirmId(null);
    toast.success('Content deleted');
  };

  const nextSessionNumber = () => {
    const nums = items.map((i) => parseInt(i.sessionNumber.replace(/\D/g, ''), 10)).filter(Boolean);
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `session${max + 1}`;
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">Content Management</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage educational sessions and community resources visible in the mobile app.
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm">
          
          <Icon name="PlusIcon" size={16} variant="outline" />
          {activeTab === 'sessions' ? 'New Session' : 'New Resource'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {(['sessions', 'resources'] as Tab[]).map((tab) =>
        <button
          key={`tab-${tab}`}
          onClick={() => setActiveTab(tab)}
          className={`
              px-4 py-1.5 rounded-md text-[13px] font-600 transition-all duration-150
              ${activeTab === tab ?
          'bg-card text-foreground shadow-card' :
          'text-muted-foreground hover:text-foreground'}
            `
          }>
          
            {tab === 'sessions' ? `Sessions (${sessions.length})` : `Community Resources (${resources.length})`}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title, group, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-64" />
          
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['all', 'active', 'inactive'] as const).map((f) =>
          <button
            key={`filter-${f}`}
            onClick={() => setFilterActive(f)}
            className={`
                px-3 py-1.5 rounded-md text-[12px] font-500 transition-all duration-150 capitalize
                ${filterActive === f ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
              `}>
            
              {f}
            </button>
          )}
        </div>
        <span className="text-[12px] text-muted-foreground ml-auto">
          {filtered.length} of {items.length} {activeTab}
        </span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-12">Thumb</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Group / Session</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Media</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Tags</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Active</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Last Edited</th>
                <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ?
              <tr>
                  <td colSpan={9}>
                    <EmptyState
                    icon="BookOpenIcon"
                    title={`No ${activeTab} found`}
                    description={`No ${activeTab} match your current filters. Try adjusting your search or create a new ${activeTab === 'sessions' ? 'session' : 'resource'}.`}
                    action={{ label: `Create ${activeTab === 'sessions' ? 'Session' : 'Resource'}`, onClick: handleNew }} />
                  
                  </td>
                </tr> :
              filtered.map((item) =>
              <tr
                key={item.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors duration-100 group">
                
                  <td className="px-4 py-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                      {item.thumbnailUrl ?
                    <AppImage
                      src={item.thumbnailUrl}
                      alt={`Thumbnail for ${item.title}`}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover" /> :


                    <div className="w-full h-full flex items-center justify-center">
                          <Icon name="PhotoIcon" size={16} variant="outline" className="text-muted-foreground" />
                        </div>
                    }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-600 text-foreground max-w-[200px] truncate">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] truncate">{item.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[12px] font-500 text-foreground">{item.groupId}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{item.sessionNumber}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span
                      title={item.videoUrl ? `YouTube: ${item.videoUrl}` : 'No video'}
                      className={`w-6 h-6 rounded-md flex items-center justify-center ${item.videoUrl ? 'bg-danger/10' : 'bg-muted'}`}>
                      
                        <Icon name="PlayIcon" size={12} variant={item.videoUrl ? 'solid' : 'outline'} className={item.videoUrl ? 'text-danger' : 'text-muted-foreground'} />
                      </span>
                      <span
                      title={item.audioUrl ? `SoundCloud: ${item.audioUrl}` : 'No audio'}
                      className={`w-6 h-6 rounded-md flex items-center justify-center ${item.audioUrl ? 'bg-warning/10' : 'bg-muted'}`}>
                      
                        <Icon name="MusicalNoteIcon" size={12} variant={item.audioUrl ? 'solid' : 'outline'} className={item.audioUrl ? 'text-warning' : 'text-muted-foreground'} />
                      </span>
                      <span
                      title={item.infographicUrl ? 'Has infographic' : 'No infographic'}
                      className={`w-6 h-6 rounded-md flex items-center justify-center ${item.infographicUrl ? 'bg-info/10' : 'bg-muted'}`}>
                      
                        <Icon name="PhotoIcon" size={12} variant={item.infographicUrl ? 'solid' : 'outline'} className={item.infographicUrl ? 'text-info' : 'text-muted-foreground'} />
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {item.videoDuration && <p className="text-[11px] text-muted-foreground font-mono tabular-nums">▶ {item.videoDuration}</p>}
                      {item.audioDuration && <p className="text-[11px] text-muted-foreground font-mono tabular-nums">♪ {item.audioDuration}</p>}
                      {!item.videoDuration && !item.audioDuration && <p className="text-[11px] text-muted-foreground">—</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {item.tags.slice(0, 2).map((tag) =>
                    <span key={`tag-${item.id}-${tag}`} className="text-[10px] font-500 px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground">
                          {tag}
                        </span>
                    )}
                      {item.tags.length > 2 &&
                    <span className="text-[10px] font-500 px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground">
                          +{item.tags.length - 2}
                        </span>
                    }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Toggle
                    checked={item.active}
                    onChange={() => handleToggleActive(item.id)} />
                  
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums">
                    {item.lastEdited}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                      onClick={() => handleEdit(item)}
                      title="Edit content"
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100">
                      
                        <Icon name="PencilIcon" size={14} variant="outline" />
                      </button>
                      <button
                      onClick={() => setDeleteConfirmId(item.id)}
                      title="Delete content — this cannot be undone"
                      className="p-1.5 rounded-md hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors duration-100">
                      
                        <Icon name="TrashIcon" size={14} variant="outline" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirm */}
      {deleteConfirmId &&
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-card rounded-xl shadow-modal p-6 w-full max-w-sm scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                <Icon name="ExclamationTriangleIcon" size={20} variant="outline" className="text-danger" />
              </div>
              <h3 className="text-[15px] font-600 text-foreground">Delete Content?</h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              This content will be removed from the app immediately. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
              onClick={() => setDeleteConfirmId(null)}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
              
                Cancel
              </button>
              <button
              onClick={() => handleDelete(deleteConfirmId)}
              className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 active:scale-95">
              
                Delete Content
              </button>
            </div>
          </div>
        </div>
      }

      {/* Slide-over form */}
      <SlideOver
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title={editingItem ? 'Edit Content' : `New ${activeTab === 'sessions' ? 'Session' : 'Resource'}`}
        subtitle={editingItem ? `Editing: ${editingItem.title}` : 'Fill in all required fields and paste media URLs.'}
        width="xl"
        footer={undefined}>
        
        <ContentForm
          item={editingItem}
          onSave={handleSave}
          onCancel={() => setSlideOverOpen(false)}
          nextSessionNumber={nextSessionNumber()}
          type={activeTab} />
        
      </SlideOver>
    </div>);

}