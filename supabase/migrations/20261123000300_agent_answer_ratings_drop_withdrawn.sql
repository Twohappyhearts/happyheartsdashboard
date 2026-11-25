-- Taking back a rating now deletes the row (DELETE /api/agent/ratings/:messageId), so the
-- soft-delete column added earlier today is no longer used. No row had it set when it was dropped.
alter table public.agent_answer_ratings drop column if exists withdrawn_at;
