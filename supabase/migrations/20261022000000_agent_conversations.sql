-- AI agent: conversations (state) + messages (full history).
-- Writes go through the server (service role); patients can only read their own rows.

create table if not exists public.agent_conversations (
    id                    uuid primary key default gen_random_uuid(),
    user_id               uuid not null references auth.users(id) on delete cascade,
    title                 text,
    -- Compressed context: LLM summary of every message with seq <= summarized_until_seq.
    summary               text,
    summarized_until_seq  bigint not null default 0,
    summary_updated_at    timestamptz,
    -- Business state the agent carries between turns (e.g. a step-by-step flow).
    state                 jsonb not null default '{}'::jsonb,
    last_message_at       timestamptz,
    deleted               boolean not null default false,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

comment on table  public.agent_conversations is 'AI agent conversations; holds the compressed context (summary) and agent state';
comment on column public.agent_conversations.summary is 'LLM summary of messages with seq <= summarized_until_seq';
comment on column public.agent_conversations.summarized_until_seq is 'Last agent_messages.seq covered by summary (0 = nothing summarized)';
comment on column public.agent_conversations.state is 'Agent business state carried between turns';

create index if not exists idx_agent_conv_user
    on public.agent_conversations (user_id, last_message_at desc nulls last)
    where not deleted;

create table if not exists public.agent_messages (
    id                   uuid primary key default gen_random_uuid(),   -- = AI SDK UIMessage.id
    seq                  bigint generated always as identity unique,   -- strict ordering
    conversation_id      uuid not null references public.agent_conversations(id) on delete cascade,
    user_id              uuid not null references auth.users(id) on delete cascade,
    role                 text not null check (role in ('user', 'assistant')),
    content              text not null default '',                     -- plain text, for previews/search
    parts                jsonb not null default '[]'::jsonb,           -- AI SDK UIMessage.parts (reasoning / tool / text timeline)
    reply_to_message_id  uuid references public.agent_messages(id) on delete set null,
    message_status       text not null default 'NORMAL'
        check (message_status in ('NORMAL', 'INTERRUPTED', 'AWAITING_APPROVAL', 'ERROR')),
    model                text,
    usage                jsonb,
    duration_ms          bigint,
    deleted              boolean not null default false,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table  public.agent_messages is 'AI agent message history (append-only; assistant rows are updated when a tool approval continues them)';
comment on column public.agent_messages.parts is 'AI SDK UIMessage.parts: ordered reasoning / tool / text parts, incl. tool approval state';
comment on column public.agent_messages.message_status is 'NORMAL | INTERRUPTED | AWAITING_APPROVAL (a tool call waits for the user) | ERROR';

create index if not exists idx_agent_msg_conv on public.agent_messages (conversation_id, seq);
create index if not exists idx_agent_msg_awaiting on public.agent_messages (conversation_id)
    where message_status = 'AWAITING_APPROVAL';

drop trigger if exists agent_conversations_touch on public.agent_conversations;
create trigger agent_conversations_touch before update on public.agent_conversations
    for each row execute function public.touch_updated_at();
drop trigger if exists agent_messages_touch on public.agent_messages;
create trigger agent_messages_touch before update on public.agent_messages
    for each row execute function public.touch_updated_at();

alter table public.agent_conversations enable row level security;
alter table public.agent_messages      enable row level security;

-- Read-only for the owner. No insert/update/delete policies: only the server writes.
drop policy if exists agent_conversations_select_own on public.agent_conversations;
create policy agent_conversations_select_own on public.agent_conversations
    for select to authenticated using (user_id = auth.uid() and not deleted);

drop policy if exists agent_messages_select_own on public.agent_messages;
create policy agent_messages_select_own on public.agent_messages
    for select to authenticated using (user_id = auth.uid() and not deleted);

-- Optional (decide with the care team): let staff review patients' AI conversations.
-- create policy agent_conversations_select_staff on public.agent_conversations
--     for select to authenticated using (public.is_active_staff());
-- create policy agent_messages_select_staff on public.agent_messages
--     for select to authenticated using (public.is_active_staff());
