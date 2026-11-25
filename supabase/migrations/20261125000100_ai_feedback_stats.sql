-- AI Feedback statistics (dashboard: Analytics › AI Feedback, and its list of rated answers).
--
--   agent_messages.used_knowledge_base / used_web_search   how an answer was made, kept by the
--                                                          database from its parts (generated)
--   ai_feedback_answers(...)        patients' AI answers with their rating (internal)
--   ai_feedback_rated(...)          rated answers with question and answer text (internal)
--   staff_ai_feedback_stats(...)    every number of the AI Feedback tab, as one jsonb
--   staff_ai_rated_answers(...)     the list of rated answers (keyset pages, newest first)
--   staff_ai_rated_answer_facets(...) counts for the list's filters
--
-- Same scope as the AI Conversations page: patients only (no staff/admin test chats), no
-- conversation the patient deleted, no deleted message. Answers on older branches count: the
-- patient saw them. Service role only; the dashboard server checks the caller first.
--
-- "Per patient" (p_per_patient): every patient weighs the same, whatever the number of their
-- ratings: averages and shares are computed per patient first, then averaged over patients.

alter table public.agent_messages
    add column if not exists used_knowledge_base boolean
        generated always as (jsonb_path_exists(coalesce(parts, '[]'::jsonb), '$[*] ? (@.type == "tool-searchKnowledge")')) stored,
    add column if not exists used_web_search boolean
        generated always as (jsonb_path_exists(coalesce(parts, '[]'::jsonb), '$[*] ? (@.type == "tool-webSearch")')) stored;

create index if not exists idx_agent_msg_assistant_created
    on public.agent_messages (created_at desc)
    where role = 'assistant' and not deleted;

-- ---------------------------------------------------------------- internal

create or replace function public.ai_feedback_answers(p_from timestamptz, p_language text, p_model text)
returns table (
    message_id      uuid,
    conversation_id uuid,
    user_id         uuid,
    answered_at     timestamptz,
    model           text,
    language        text,
    source          text,
    rated           boolean,
    usability       smallint,
    safety          smallint,
    comment         text
)
language sql
stable
security invoker
set search_path = public
as $$
    select m.id,
           m.conversation_id,
           m.user_id,
           m.created_at,
           coalesce(nullif(m.model, ''), 'unknown'),
           coalesce(nullif(p.preferred_language, ''), 'unknown'),
           case
               when m.used_knowledge_base and m.used_web_search then 'kb_web'
               when m.used_knowledge_base then 'kb'
               when m.used_web_search then 'web'
               else 'none'
           end,
           r.message_id is not null,
           r.usability,
           r.safety,
           nullif(btrim(r.comment), '')
    from public.agent_messages m
    join public.account_roles a on a.user_id = m.user_id and a.role = 'patient'
    join public.agent_conversations c on c.id = m.conversation_id and not c.deleted
    left join public.profiles p on p.id = m.user_id
    left join public.agent_answer_ratings r on r.message_id = m.id and r.user_id = m.user_id
    where m.role = 'assistant'
      and not m.deleted
      and (p_from is null or m.created_at >= p_from)
      and (p_language is null or coalesce(nullif(p.preferred_language, ''), 'unknown') = p_language)
      and (p_model is null or coalesce(nullif(m.model, ''), 'unknown') = p_model);
$$;

create or replace function public.ai_feedback_rated(p_from timestamptz, p_language text, p_model text)
returns table (
    message_id      uuid,
    conversation_id uuid,
    user_id         uuid,
    answered_at     timestamptz,
    model           text,
    language        text,
    usability       smallint,
    safety          smallint,
    comment         text,
    question        text,
    answer          text,
    display_id      text,
    username        text
)
language sql
stable
security invoker
set search_path = public
as $$
    select a.message_id,
           a.conversation_id,
           a.user_id,
           a.answered_at,
           a.model,
           a.language,
           a.usability,
           a.safety,
           a.comment,
           (select string_agg(e ->> 'text', E'\n\n' order by o)
              from jsonb_array_elements(coalesce(q.parts, '[]'::jsonb)) with ordinality as x(e, o)
             where e ->> 'type' = 'text'),
           (select string_agg(e ->> 'text', E'\n\n' order by o)
              from jsonb_array_elements(coalesce(m.parts, '[]'::jsonb)) with ordinality as x(e, o)
             where e ->> 'type' = 'text'),
           nullif(btrim(p.display_id), ''),
           p.username
    from public.ai_feedback_answers(p_from, p_language, p_model) a
    join public.agent_messages m on m.id = a.message_id
    left join public.agent_messages q on q.id = coalesce(m.parent_id, m.reply_to_message_id)
    left join public.profiles p on p.id = a.user_id
    where a.rated;
$$;

-- ---------------------------------------------------------------- statistics

create or replace function public.staff_ai_feedback_stats(
    p_from        timestamptz default null,
    p_language    text default null,
    p_model       text default null,
    p_per_patient boolean default false,
    p_bucket      text default 'day',
    p_tz          text default 'UTC'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with b as (
        select a.*, date_trunc(p_bucket, a.answered_at at time zone p_tz)::date as bucket
        from public.ai_feedback_answers(p_from, p_language, p_model) a
    ),
    -- One row per (dimension, group, patient).
    pp as (
        select d.dim, d.key, b.user_id,
               count(*) as answers,
               count(*) filter (where b.rated) as rated,
               count(b.usability) as n_u,
               coalesce(sum(b.usability), 0) as sum_u,
               count(*) filter (where b.usability >= 4) as top2,
               count(*) filter (where b.usability = 1) as u1,
               count(*) filter (where b.usability = 2) as u2,
               count(*) filter (where b.usability = 3) as u3,
               count(*) filter (where b.usability = 4) as u4,
               count(*) filter (where b.usability = 5) as u5,
               count(b.safety) as n_s,
               coalesce(sum(b.safety), 0) as sum_s,
               count(*) filter (where b.safety = 1) as s1,
               count(*) filter (where b.safety = 2) as s2,
               count(*) filter (where b.safety = 3) as s3,
               count(b.comment) as comments
        from b
        cross join lateral (values
            ('all', 'all'),
            ('bucket', b.bucket::text),
            ('source', b.source),
            ('model', b.model),
            ('language', b.language)
        ) as d(dim, key)
        group by d.dim, d.key, b.user_id
    ),
    agg as (
        select dim, key,
               sum(answers)::int as answers,
               sum(rated)::int as rated,
               count(*)::int as patients,
               (count(*) filter (where rated > 0))::int as raters,
               max(rated)::int as top_rater,
               sum(n_u)::int as n_u,
               sum(n_s)::int as n_s,
               sum(comments)::int as comments,
               jsonb_build_array(sum(u1), sum(u2), sum(u3), sum(u4), sum(u5)) as u_count,
               jsonb_build_array(sum(s1), sum(s2), sum(s3)) as s_count,
               round(case when p_per_patient then avg(sum_u::numeric / n_u) filter (where n_u > 0)
                          else sum(sum_u)::numeric / nullif(sum(n_u), 0) end, 4) as avg_u,
               round(case when p_per_patient then avg(top2::numeric / n_u) filter (where n_u > 0)
                          else sum(top2)::numeric / nullif(sum(n_u), 0) end, 4) as top2_share,
               round(case when p_per_patient then avg(sum_s::numeric / n_s) filter (where n_s > 0)
                          else sum(sum_s)::numeric / nullif(sum(n_s), 0) end, 4) as avg_s,
               jsonb_build_array(
                   round(case when p_per_patient then avg(u1::numeric / n_u) filter (where n_u > 0) else sum(u1)::numeric / nullif(sum(n_u), 0) end, 4),
                   round(case when p_per_patient then avg(u2::numeric / n_u) filter (where n_u > 0) else sum(u2)::numeric / nullif(sum(n_u), 0) end, 4),
                   round(case when p_per_patient then avg(u3::numeric / n_u) filter (where n_u > 0) else sum(u3)::numeric / nullif(sum(n_u), 0) end, 4),
                   round(case when p_per_patient then avg(u4::numeric / n_u) filter (where n_u > 0) else sum(u4)::numeric / nullif(sum(n_u), 0) end, 4),
                   round(case when p_per_patient then avg(u5::numeric / n_u) filter (where n_u > 0) else sum(u5)::numeric / nullif(sum(n_u), 0) end, 4)
               ) as u_share,
               jsonb_build_array(
                   round(case when p_per_patient then avg(s1::numeric / n_s) filter (where n_s > 0) else sum(s1)::numeric / nullif(sum(n_s), 0) end, 4),
                   round(case when p_per_patient then avg(s2::numeric / n_s) filter (where n_s > 0) else sum(s2)::numeric / nullif(sum(n_s), 0) end, 4),
                   round(case when p_per_patient then avg(s3::numeric / n_s) filter (where n_s > 0) else sum(s3)::numeric / nullif(sum(n_s), 0) end, 4)
               ) as s_share
        from pp
        group by dim, key
    ),
    -- Every bucket from the start of the range (or the first answer) to now, empty ones too.
    span as (
        select gs::date as day
        from generate_series(
            date_trunc(p_bucket, coalesce(p_from, (select min(answered_at) from b)) at time zone p_tz),
            date_trunc(p_bucket, now() at time zone p_tz),
            ('1 ' || p_bucket)::interval
        ) as gs
    )
    select jsonb_build_object(
        'overall', (select to_jsonb(a) - 'dim' - 'key' from agg a where a.dim = 'all'),
        'buckets', coalesce((
            select jsonb_agg(jsonb_build_object('key', s.day::text)
                             || coalesce((select to_jsonb(a) - 'dim' - 'key' from agg a where a.dim = 'bucket' and a.key = s.day::text), '{}'::jsonb)
                             order by s.day)
            from span s
        ), '[]'::jsonb),
        'groups', jsonb_build_object(
            'source',   coalesce((select jsonb_agg(to_jsonb(a) - 'dim' order by a.answers desc, a.key) from agg a where a.dim = 'source'), '[]'::jsonb),
            'model',    coalesce((select jsonb_agg(to_jsonb(a) - 'dim' order by a.answers desc, a.key) from agg a where a.dim = 'model'), '[]'::jsonb),
            'language', coalesce((select jsonb_agg(to_jsonb(a) - 'dim' order by a.answers desc, a.key) from agg a where a.dim = 'language'), '[]'::jsonb)
        ),
        'options', (
            select jsonb_build_object(
                'languages', coalesce(jsonb_agg(distinct o.language order by o.language), '[]'::jsonb),
                'models', coalesce(jsonb_agg(distinct o.model order by o.model), '[]'::jsonb)
            )
            from public.ai_feedback_answers(p_from, null, null) o
        )
    );
$$;

-- ---------------------------------------------------------------- rated answers

create or replace function public.staff_ai_rated_answers(
    p_from         timestamptz default null,
    p_language     text default null,
    p_model        text default null,
    p_usability    integer default null,
    p_safety       integer default null,
    p_with_comment boolean default false,
    p_search       text default null,
    p_before_at    timestamptz default null,
    p_before_id    uuid default null,
    p_limit        integer default 20
)
returns table (
    message_id      uuid,
    conversation_id uuid,
    user_id         uuid,
    answered_at     timestamptz,
    model           text,
    language        text,
    usability       smallint,
    safety          smallint,
    comment         text,
    question        text,
    answer          text,
    display_id      text,
    username        text
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
    select r.*
    from public.ai_feedback_rated(p_from, p_language, p_model) r
    cross join q
    where (p_usability is null or r.usability = p_usability)
      and (p_safety is null or r.safety = p_safety)
      and (not coalesce(p_with_comment, false) or r.comment is not null)
      and (q.pattern is null or r.question ilike q.pattern or r.answer ilike q.pattern or r.comment ilike q.pattern)
      and (p_before_at is null
           or (r.answered_at, r.message_id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by r.answered_at desc, r.message_id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 500);
$$;

-- Counts for the list's filters: by usability score (with every other filter), and with a
-- comment (with every filter but "with comment").
create or replace function public.staff_ai_rated_answer_facets(
    p_from         timestamptz default null,
    p_language     text default null,
    p_model        text default null,
    p_usability    integer default null,
    p_safety       integer default null,
    p_with_comment boolean default false,
    p_search       text default null
)
returns jsonb
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
    ),
    x as (
        select r.usability,
               r.comment is not null as has_comment,
               (not coalesce(p_with_comment, false) or r.comment is not null) as comment_ok,
               (p_usability is null or r.usability = p_usability) as usability_ok
        from public.ai_feedback_rated(p_from, p_language, p_model) r
        cross join q
        where (p_safety is null or r.safety = p_safety)
          and (q.pattern is null or r.question ilike q.pattern or r.answer ilike q.pattern or r.comment ilike q.pattern)
    )
    select jsonb_build_object(
        'total', count(*) filter (where comment_ok),
        'usability', jsonb_build_array(
            count(*) filter (where comment_ok and usability = 1),
            count(*) filter (where comment_ok and usability = 2),
            count(*) filter (where comment_ok and usability = 3),
            count(*) filter (where comment_ok and usability = 4),
            count(*) filter (where comment_ok and usability = 5)
        ),
        'comments', count(*) filter (where usability_ok and has_comment)
    )
    from x;
$$;

-- ---------------------------------------------------------------- access

revoke all on function public.ai_feedback_answers(timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.ai_feedback_rated(timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.staff_ai_feedback_stats(timestamptz, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.staff_ai_rated_answers(timestamptz, text, text, integer, integer, boolean, text, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.staff_ai_rated_answer_facets(timestamptz, text, text, integer, integer, boolean, text) from public, anon, authenticated;

grant execute on function public.ai_feedback_answers(timestamptz, text, text) to service_role;
grant execute on function public.ai_feedback_rated(timestamptz, text, text) to service_role;
grant execute on function public.staff_ai_feedback_stats(timestamptz, text, text, boolean, text, text) to service_role;
grant execute on function public.staff_ai_rated_answers(timestamptz, text, text, integer, integer, boolean, text, timestamptz, uuid, integer) to service_role;
grant execute on function public.staff_ai_rated_answer_facets(timestamptz, text, text, integer, integer, boolean, text) to service_role;
