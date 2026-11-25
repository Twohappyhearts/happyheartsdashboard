-- Editing a past message (like Claude / ChatGPT): a conversation becomes a tree of messages.
--
--   agent_messages.parent_id            the message before this one in its branch (null: first message)
--   agent_conversations.current_leaf_id the last message of the branch on screen
--
-- Editing message M adds a new user message with M's parent: a sibling of M, i.e. a new version
-- that starts a new branch. The branch on screen is the path root → current_leaf_id; the model
-- only ever sees that path. Switching versions moves current_leaf_id to the newest leaf under the
-- chosen sibling.
--
-- Summaries (compressed context) belong to a branch, not to the conversation: agent_summaries
-- anchors a summary at the last message it covers (through_message_id). A branch can use a
-- summary only if that message is on its path; a branch that left the path before it gets its own.
-- agent_conversations.summary / summarized_until_seq are no longer read (kept for older servers).

alter table public.agent_messages
    add column if not exists parent_id uuid references public.agent_messages (id) on delete set null;
create index if not exists idx_agent_msg_parent on public.agent_messages (conversation_id, parent_id);
comment on column public.agent_messages.parent_id is
    'Previous message in this message''s branch (null: first message). Siblings (same parent) are versions.';

alter table public.agent_conversations
    add column if not exists current_leaf_id uuid references public.agent_messages (id) on delete set null;
comment on column public.agent_conversations.current_leaf_id is
    'Last message of the branch on screen; the agent sees the path root → current_leaf_id.';

create table if not exists public.agent_summaries (
    conversation_id    uuid not null references public.agent_conversations (id) on delete cascade,
    through_message_id uuid not null references public.agent_messages (id) on delete cascade,
    summary            text not null,
    created_at         timestamptz not null default now(),
    primary key (conversation_id, through_message_id)
);
comment on table public.agent_summaries is
    'LLM summary of a branch from its first message through through_message_id. Written only by the server.';
alter table public.agent_summaries enable row level security;
-- No policies: only the server (service role) reads and writes summaries.

-- Backfill conversations the branch-aware server has not touched yet (current_leaf_id is null):
-- they are linear, so each message's parent is the one before it.
update public.agent_messages m
set parent_id = p.prev_id
from (
    select id, lag(id) over (partition by conversation_id order by seq) as prev_id
    from public.agent_messages
) p
where m.id = p.id
  and m.parent_id is null
  and p.prev_id is not null
  and m.conversation_id in (select id from public.agent_conversations where current_leaf_id is null);

insert into public.agent_summaries (conversation_id, through_message_id, summary, created_at)
select c.id, t.id, c.summary, coalesce(c.summary_updated_at, now())
from public.agent_conversations c
cross join lateral (
    select m.id from public.agent_messages m
    where m.conversation_id = c.id and m.seq <= c.summarized_until_seq
    order by m.seq desc limit 1
) t
where c.current_leaf_id is null and c.summary is not null and btrim(c.summary) <> ''
on conflict do nothing;

update public.agent_conversations c
set current_leaf_id = (
    select m.id from public.agent_messages m
    where m.conversation_id = c.id and not m.deleted
    order by m.seq desc limit 1
)
where c.current_leaf_id is null;
