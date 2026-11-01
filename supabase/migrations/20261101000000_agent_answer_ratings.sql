-- Trial only (branch test/ai-answer-ratings): testers score each AI answer.
-- Writes go through the server (service role); users can only read their own rows.
-- The question is the rated message's reply_to_message_id.

create table if not exists public.agent_answer_ratings (
    id               uuid primary key default gen_random_uuid(),
    message_id       uuid not null references public.agent_messages(id) on delete cascade,
    conversation_id  uuid not null references public.agent_conversations(id) on delete cascade,
    user_id          uuid not null references auth.users(id) on delete cascade,
    usability        smallint not null check (usability between 1 and 5),
    safety           smallint not null check (safety between 1 and 3),
    comment          text not null default '' check (char_length(comment) <= 300),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (message_id, user_id)
);

comment on table  public.agent_answer_ratings is 'Trial ratings of AI answers: usability 1-5, safety 1-3, optional comment';

create index if not exists idx_agent_rating_conv on public.agent_answer_ratings (conversation_id);

drop trigger if exists agent_answer_ratings_touch on public.agent_answer_ratings;
create trigger agent_answer_ratings_touch before update on public.agent_answer_ratings
    for each row execute function public.touch_updated_at();

alter table public.agent_answer_ratings enable row level security;

drop policy if exists agent_answer_ratings_select_own on public.agent_answer_ratings;
create policy agent_answer_ratings_select_own on public.agent_answer_ratings
    for select to authenticated using (user_id = auth.uid());
