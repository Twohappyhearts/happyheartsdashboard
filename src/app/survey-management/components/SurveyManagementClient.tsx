'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';
import Toggle from '@/components/ui/Toggle';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import SurveyParticipantLinks from './SurveyParticipantLinks';

export interface Survey {
  id: string;
  title: string;
  redcapUrl: string;
  description: string;
  displayOrder: number;
  active: boolean;
  createdAt: string;
}

const mockSurveys: Survey[] = [
  {
    id: 'survey-001',
    title: 'Baseline Health Assessment',
    redcapUrl: 'https://ci-redcap.hs.uci.edu/surveys/?s=3JAA7JRPHFEC4WY3',
    description: 'Initial health and quality of life assessment for all enrolled patients. Completed at study enrollment.',
    displayOrder: 1,
    active: true,
    createdAt: '2026-08-01',
  },
  {
    id: 'survey-002',
    title: '30-Day Follow-Up Survey',
    redcapUrl: 'https://ci-redcap.hs.uci.edu/surveys/?s=RC4XD9NPP9J7XKFL',
    description: 'Follow-up quality of life and symptom burden survey administered 30 days after enrollment.',
    displayOrder: 2,
    active: true,
    createdAt: '2026-08-01',
  },
  {
    id: 'survey-003',
    title: 'App Usability Feedback',
    redcapUrl: 'https://ci-redcap.hs.uci.edu/surveys/?s=USABILITY2026XYZ',
    description: 'Patient satisfaction and usability feedback for the HappyHearts mobile application.',
    displayOrder: 3,
    active: false,
    createdAt: '2026-09-15',
  },
];

type Tab = 'links' | 'participants';

export default function SurveyManagementClient() {
  const [activeTab, setActiveTab] = useState<Tab>('links');
  const [surveys, setSurveys] = useState<Survey[]>(mockSurveys);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
  } = useForm<Omit<Survey, 'id' | 'createdAt'>>();

  const redcapUrlVal = watch('redcapUrl', '');
  const isValidRedcapUrl = redcapUrlVal.startsWith('https://ci-redcap.hs.uci.edu/surveys/?s=');

  const handleOpenNew = () => {
    setEditingSurvey(null);
    reset({ title: '', redcapUrl: '', description: '', displayOrder: surveys.length + 1, active: true });
    setModalOpen(true);
  };

  const handleOpenEdit = (survey: Survey) => {
    setEditingSurvey(survey);
    reset({
      title: survey.title,
      redcapUrl: survey.redcapUrl,
      description: survey.description,
      displayOrder: survey.displayOrder,
      active: survey.active,
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: Omit<Survey, 'id' | 'createdAt'>) => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    // TODO: POST/PUT to /api/surveys with data
    if (editingSurvey) {
      setSurveys(prev => prev.map(s => s.id === editingSurvey.id ? { ...s, ...data } : s));
      toast.success('Survey updated — app will use the new link immediately');
    } else {
      setSurveys(prev => [...prev, { ...data, id: `survey-${Date.now()}`, createdAt: new Date().toISOString().split('T')[0] }]);
      toast.success('Survey added — now visible to active patients');
    }
    setSaving(false);
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setSurveys(prev => prev.filter(s => s.id !== id));
    setDeleteConfirmId(null);
    toast.success('Survey removed');
  };

  const handleToggleActive = (id: string) => {
    setSurveys(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
    toast.success('Survey visibility updated');
  };

  const activeVal = watch('active');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">Survey Management</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage REDCap survey links and view per-participant personalized URLs.
          </p>
        </div>
        {activeTab === 'links' && (
          <button
            onClick={handleOpenNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm"
          >
            <Icon name="PlusIcon" size={16} variant="outline" />
            Add Survey
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {([
          { key: 'links', label: 'Survey Links' },
          { key: 'participants', label: 'Participant Links' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={`tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`
              px-4 py-1.5 rounded-md text-[13px] font-600 transition-all duration-150
              ${activeTab === tab.key ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'links' ? (
        <div className="space-y-3">
          {surveys.length === 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-card">
              <EmptyState
                icon="ClipboardDocumentListIcon"
                title="No surveys yet"
                description="Add REDCap survey links here. Each survey is shown to patients in the app, and their personalized link includes their username as the participant code."
                action={{ label: 'Add Survey', onClick: handleOpenNew }}
              />
            </div>
          ) : (
            surveys.sort((a, b) => a.displayOrder - b.displayOrder).map((survey) => (
              <div
                key={survey.id}
                className="bg-card rounded-xl border border-border shadow-card p-5 hover:shadow-card-hover transition-shadow duration-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Icon name="ClipboardDocumentListIcon" size={18} variant="outline" className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-[14px] font-600 text-foreground">{survey.title}</h3>
                        <Badge variant={survey.active ? 'active' : 'inactive'} label={survey.active ? 'Active' : 'Inactive'} size="sm" />
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                          Order {survey.displayOrder}
                        </span>
                      </div>
                      {survey.description && (
                        <p className="text-[12px] text-muted-foreground mb-2">{survey.description}</p>
                      )}
                      <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                        <Icon name="LinkIcon" size={12} variant="outline" className="text-muted-foreground shrink-0" />
                        <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">{survey.redcapUrl}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(survey.redcapUrl); toast.success('REDCap URL copied'); }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100 shrink-0"
                          title="Copy REDCap URL"
                        >
                          <Icon name="ClipboardDocumentIcon" size={12} variant="outline" />
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Added {survey.createdAt} · App appends <code className="bg-muted px-1 rounded text-[10px]">&participant_code=username</code> automatically
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle checked={survey.active} onChange={() => handleToggleActive(survey.id)} />
                    <button
                      onClick={() => handleOpenEdit(survey)}
                      title="Edit survey"
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                    >
                      <Icon name="PencilIcon" size={15} variant="outline" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(survey.id)}
                      title="Delete survey — this cannot be undone"
                      className="p-2 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors duration-100"
                    >
                      <Icon name="TrashIcon" size={15} variant="outline" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <SurveyParticipantLinks surveys={surveys.filter(s => s.active)} />
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSurvey ? 'Edit Survey' : 'Add Survey'}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit(onSubmit)}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60 min-w-[120px] justify-center"
            >
              {saving ? (
                <>
                  <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />
                  Saving...
                </>
              ) : editingSurvey ? 'Save Changes' : 'Add Survey'}
            </button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              Survey Title <span className="text-danger">*</span>
            </label>
            <input
              {...register('title', { required: 'Title is required' })}
              type="text"
              placeholder="e.g. Baseline Health Assessment"
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.title && <p className="text-[11px] text-danger mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">
              REDCap Public Link <span className="text-danger">*</span>
            </label>
            <p className="text-[11px] text-muted-foreground mb-1">
              Must start with <code className="bg-muted px-1 rounded text-[10px]">https://ci-redcap.hs.uci.edu/surveys/?s=</code>
            </p>
            <div className="relative">
              <input
                {...register('redcapUrl', {
                  required: 'REDCap URL is required',
                  validate: val => val.startsWith('https://ci-redcap.hs.uci.edu/surveys/?s=') || 'URL must be a valid REDCap survey link',
                })}
                type="url"
                placeholder="https://ci-redcap.hs.uci.edu/surveys/?s=..."
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] font-mono text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
              />
              {redcapUrlVal && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${isValidRedcapUrl ? 'text-success' : 'text-danger'}`}>
                  <Icon name={isValidRedcapUrl ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} variant="solid" />
                </span>
              )}
            </div>
            {errors.redcapUrl && <p className="text-[11px] text-danger mt-1">{errors.redcapUrl.message}</p>}
            {isValidRedcapUrl && (
              <div className="mt-2 p-2.5 bg-success/5 border border-success/20 rounded-lg">
                <p className="text-[11px] text-success font-500">Valid REDCap URL — app will append the participant code automatically</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{redcapUrlVal}&participant_code=<em>username</em></p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[13px] font-500 text-foreground mb-1">Description</label>
            <textarea
              {...register('description')}
              rows={2}
              placeholder="Brief description shown to patients before they start the survey..."
              className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Display Order</label>
              <input
                {...register('displayOrder', { valueAsNumber: true, min: { value: 1, message: 'Order must be at least 1' } })}
                type="number"
                min={1}
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">Visibility</label>
              <div className="flex items-center gap-2 mt-2">
                <Toggle
                  checked={activeVal ?? true}
                  onChange={(val) => { /* handled by react-hook-form register */ }}
                  label="Active in app"
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-card rounded-xl shadow-modal p-6 w-full max-w-sm scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                <Icon name="ExclamationTriangleIcon" size={20} variant="outline" className="text-danger" />
              </div>
              <h3 className="text-[15px] font-600 text-foreground">Delete Survey?</h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              This survey will be removed from the app immediately. Patients will no longer see it. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 active:scale-95">Delete Survey</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}