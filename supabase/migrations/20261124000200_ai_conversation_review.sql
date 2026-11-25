-- Research-team review of patients' AI assistant conversations (dashboard: AI Conversations).
--
--   audit_log                      append-only record of who opened which patient data, and when
--   staff_ai_conversations(...)    patients' conversations for the review list (keyset pages)
--
-- Both are used only by the dashboard server (service role) after it has checked that the caller
-- is an active Careteam or Admin account. Conversations a patient deleted are not listed, and
-- staff/admin test chats are left out.

-- ---------------------------------------------------------------- audit log

create table if not exists public.audit_log (
    id              bigint generated always as identity primary key,
    actor_id        uuid not null,
    actor_role      text not null,
    action          text not null,
    target_type     text not null,
    target_id       uuid,
    subject_user_id uuid,
    details         jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);
comment on table public.audit_log is
    'Append-only access log (who viewed or changed whose data). No foreign keys, so entries outlive the accounts they name. Written only by the server.';
comment on column public.audit_log.subject_user_id is 'Whose data was accessed (e.g. the patient).';

create index if not exists idx_audit_log_subject on public.audit_log (subject_user_id, created_at desc);
create index if not exists idx_audit_log_actor on public.audit_log (actor_id, created_at desc);
create index if not exists idx_audit_log_target on public.audit_log (target_type, target_id, created_at desc);

alter table public.audit_log enable row level security;
-- No policies: only the service role reads and writes it.
revoke all on table public.audit_log from anon, authenticated;

create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change
    before update or delete on public.audit_log
    for each row execute function public.audit_log_append_only();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
    before truncate on public.audit_log
    for each statement execute function public.audit_log_append_only();

-- ---------------------------------------------------------------- review list

-- Newest activity first; the list pages with (activity, id) < (before_at, before_id).
create index if not exists idx_agent_conv_activity
    on public.agent_conversations ((coalesce(last_message_at, created_at)) desc, id desc)
    where not deleted;

create or replace function public.staff_ai_conversations(
    p_search    text default null,
    p_before_at timestamptz default null,
    p_before_id uuid default null,
    p_limit     integer default 50
)
returns table (
    id          uuid,
    title       text,
    activity_at timestamptz,
    user_id     uuid,
    full_name   text,
    username    text,
    display_id  text
)
language sql
stable
security invoker
set search_path = public
as $$
    with q as (
        select case
            when nullif(btrim(p_search), '') is null then null
            else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        end as pattern
    )
    select c.id,
           c.title,
           coalesce(c.last_message_at, c.created_at) as activity_at,
           c.user_id,
           p.full_name,
           p.username,
           p.display_id
    from public.agent_conversations c
    join public.account_roles r on r.user_id = c.user_id and r.role = 'patient'
    left join public.profiles p on p.id = c.user_id
    cross join q
    where not c.deleted
      and exists (select 1 from public.agent_messages m where m.conversation_id = c.id and not m.deleted)
      and (
          q.pattern is null
          or c.title ilike q.pattern
          or p.full_name ilike q.pattern
          or p.username ilike q.pattern
          or p.display_id ilike q.pattern
      )
      and (
          p_before_at is null
          or (coalesce(c.last_message_at, c.created_at), c.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    order by coalesce(c.last_message_at, c.created_at) desc, c.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

comment on function public.staff_ai_conversations(text, timestamptz, uuid, integer) is
    'Patients'' AI conversations for the research-team review list, newest activity first. Service role only: the server checks the caller is Careteam/Admin.';

revoke all on function public.staff_ai_conversations(text, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.staff_ai_conversations(text, timestamptz, uuid, integer) to service_role;
