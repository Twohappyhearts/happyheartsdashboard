'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';
import Toggle from '@/components/ui/Toggle';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { createClient } from '@/lib/supabase/client';
import {
  MAX_ACTIVE_WEB_DOMAINS,
  WebDomainError,
  cleanDomain,
  createWebDomain,
  deleteWebDomain,
  listWebDomains,
  updateWebDomain,
  type WebDomain,
} from '@/lib/web-domains';

const inputClass =
  'w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const message = (e: unknown, fallback: string) => (e instanceof WebDomainError ? e.message : fallback);

/** The form of the Add / Edit dialog; `id` null = a new website. */
interface Draft {
  id: string | null;
  domain: string;
  label: string;
}

export default function TrustedWebsites() {
  const supabase = useMemo(() => createClient(), []);
  const [sites, setSites] = useState<WebDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<WebDomain | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSites(await listWebDomains(supabase));
      setLoadError(null);
    } catch (e) {
      setLoadError(message(e, 'Could not load the websites.'));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = sites.filter((s) => s.active).length;
  const cleaned = draft ? cleanDomain(draft.domain) : null;

  const save = async () => {
    if (!draft) return;
    if (!cleaned) {
      setFormError('Enter a website address like acog.org.');
      return;
    }
    if (sites.some((s) => s.domain === cleaned && s.id !== draft.id)) {
      setFormError('This website is already on the list.');
      return;
    }
    if (!draft.id && activeCount >= MAX_ACTIVE_WEB_DOMAINS) {
      setFormError(`At most ${MAX_ACTIVE_WEB_DOMAINS} websites can be active. Turn one off or remove it first.`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (draft.id) {
        await updateWebDomain(supabase, draft.id, { domain: cleaned, label: draft.label });
        toast.success(`${cleaned} saved`);
      } else {
        await createWebDomain(supabase, { domain: cleaned, label: draft.label });
        toast.success(`${cleaned} added — the assistant can search it now`);
      }
      setDraft(null);
      await load();
    } catch (e) {
      setFormError(message(e, 'Could not save the website.'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (site: WebDomain) => {
    const next = !site.active;
    if (next && activeCount >= MAX_ACTIVE_WEB_DOMAINS) {
      toast.error(`At most ${MAX_ACTIVE_WEB_DOMAINS} websites can be active.`);
      return;
    }
    setSites((list) => list.map((s) => (s.id === site.id ? { ...s, active: next } : s)));
    try {
      await updateWebDomain(supabase, site.id, { active: next });
      toast.success(next ? `The assistant can search ${site.domain} again` : `The assistant no longer searches ${site.domain}`);
    } catch (e) {
      setSites((list) => list.map((s) => (s.id === site.id ? { ...s, active: site.active } : s)));
      toast.error(message(e, 'Could not change the website.'));
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await deleteWebDomain(supabase, removeTarget.id);
      toast.success(`${removeTarget.domain} removed`);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      toast.error(message(e, 'Could not remove the website.'));
    } finally {
      setRemoving(false);
    }
  };

  const openNew = () => {
    setFormError(null);
    setDraft({ id: null, domain: '', label: '' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] text-secondary-foreground max-w-2xl">
          When the assistant answers a general health question, it searches the Knowledge Base and these websites, and nothing
          else on the web. A website also covers its subdomains.
        </p>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap"
        >
          <Icon name="PlusIcon" size={16} variant="outline" />
          Add Website
        </button>
      </div>

      {!loading && !loadError && sites.length > 0 && activeCount === 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-warning/30 bg-warning/10 text-[13px] text-foreground">
          <Icon name="ExclamationTriangleIcon" size={16} variant="outline" className="text-warning shrink-0 mt-0.5" />
          No website is active, so web search is off. The assistant answers from the Knowledge Base only.
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <EmptyState
            icon="ExclamationTriangleIcon"
            title="Could not load the websites"
            description={loadError}
            action={{
              label: 'Retry',
              onClick: () => {
                setLoading(true);
                void load();
              },
            }}
          />
        ) : sites.length === 0 ? (
          <EmptyState
            icon="GlobeAltIcon"
            title="No websites yet"
            description="Web search is off until you add a website. The assistant answers from the Knowledge Base only."
            action={{ label: 'Add Website', onClick: openNew }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3">Website</th>
                  <th className="px-5 py-3">Name shown on sources</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 w-[150px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <a
                        href={`https://${site.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-mono text-[12.5px] text-foreground hover:text-primary hover:underline"
                      >
                        <Icon name="GlobeAltIcon" size={14} variant="outline" className="text-muted-foreground" />
                        {site.domain}
                      </a>
                    </td>
                    <td className="px-5 py-3 text-secondary-foreground">
                      {site.label || <span className="text-muted-foreground">— (the address is shown)</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={site.active ? 'active' : 'inactive'} label={site.active ? 'Active' : 'Off'} size="sm" />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Toggle checked={site.active} onChange={() => void toggle(site)} label="" />
                        <button
                          onClick={() => {
                            setFormError(null);
                            setDraft({ id: site.id, domain: site.domain, label: site.label });
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit"
                          aria-label={`Edit ${site.domain}`}
                        >
                          <Icon name="PencilSquareIcon" size={16} variant="outline" />
                        </button>
                        <button
                          onClick={() => setRemoveTarget(site)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-danger"
                          title="Remove"
                          aria-label={`Remove ${site.domain}`}
                        >
                          <Icon name="TrashIcon" size={16} variant="outline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={draft !== null}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? 'Edit Website' : 'Add Website'}
        size="md"
        footer={
          <>
            <button
              onClick={() => setDraft(null)}
              disabled={saving}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : draft?.id ? 'Save Changes' : 'Add Website'}
            </button>
          </>
        }
      >
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div>
              <label htmlFor="web-domain" className="block text-[13px] font-500 text-foreground mb-1">
                Website address <span className="text-danger">*</span>
              </label>
              <input
                id="web-domain"
                autoFocus
                value={draft.domain}
                onChange={(e) => {
                  setFormError(null);
                  setDraft({ ...draft, domain: e.target.value });
                }}
                placeholder="acog.org"
                className={`${inputClass} font-mono`}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {draft.domain.trim() && cleaned && cleaned !== draft.domain.trim()
                  ? `Will be saved as ${cleaned} (the whole site, subdomains included).`
                  : 'The site’s address without https:// or a page path. You can paste a full link.'}
              </p>
            </div>
            <div>
              <label htmlFor="web-label" className="block text-[13px] font-500 text-foreground mb-1">
                Name shown on sources
              </label>
              <input
                id="web-label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                maxLength={120}
                placeholder="American College of Obstetricians and Gynecologists"
                className={inputClass}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Patients see this name next to an answer that used the site. Leave empty to show the address.
              </p>
            </div>
            {formError && <p className="text-[12px] text-danger">{formError}</p>}
          </form>
        )}
      </Modal>

      <Modal
        open={removeTarget !== null}
        onClose={() => !removing && setRemoveTarget(null)}
        title="Remove this website?"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setRemoveTarget(null)}
              disabled={removing}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => void remove()}
              disabled={removing}
              className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 disabled:opacity-60"
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-secondary-foreground">
          The assistant will stop searching <span className="font-mono text-foreground">{removeTarget?.domain}</span>. Answers
          already given keep their sources. To pause a site without removing it, turn it off instead.
        </p>
      </Modal>
    </div>
  );
}
