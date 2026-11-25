-- Each score is saved as soon as the tester picks it, so a rating may have only one of the two
-- scores for a while. A rating with neither score is deleted (the API never keeps one).
alter table public.agent_answer_ratings alter column usability drop not null;
alter table public.agent_answer_ratings alter column safety drop not null;

alter table public.agent_answer_ratings drop constraint if exists agent_answer_ratings_has_score;
alter table public.agent_answer_ratings add constraint agent_answer_ratings_has_score
    check (usability is not null or safety is not null);

comment on table public.agent_answer_ratings is
    'Trial ratings of AI answers: usability 1-5, safety 1-3 (either may be empty until picked), optional comment';
