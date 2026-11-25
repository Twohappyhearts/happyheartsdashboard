-- AI Conversations (dashboard) shows everyone's AI assistant conversations, not only patients':
-- Careteam and Admin test chats too, with the owner's role, and an optional role filter.
-- Conversations their owner deleted are still left out. Service role only, as before.

drop function if exists public.staff_ai_conversations(text, timestamptz, uuid, integer);

create or replace function public.staff_ai_conversations(
    p_search    text default null,
    p_role      text default null,
    p_before_at timestamptz default null,
    p_before_id uuid default null,
    p_limit     integer default 50
)
returns table (
    id          uuid,
    title       text,
    activity_at timestamptz,
    user_id     uuid,
    role        text,
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
           r.role,
           p.full_name,
           p.username,
           p.display_id
    from public.agent_conversations c
    left join public.account_roles r on r.user_id = c.user_id
    left join public.profiles p on p.id = c.user_id
    cross join q
    where not c.deleted
      and exists (select 1 from public.agent_messages m where m.conversation_id = c.id and not m.deleted)
      and (p_role is null or r.role = p_role)
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

comment on function public.staff_ai_conversations(text, text, timestamptz, uuid, integer) is
    'Everyone''s AI conversations (optionally one role) for the AI Conversations page, newest activity first. Service role only: the server checks the caller is Careteam/Admin.';

revoke all on function public.staff_ai_conversations(text, text, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.staff_ai_conversations(text, text, timestamptz, uuid, integer) to service_role;
