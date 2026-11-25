import 'server-only';
import { isToolUIPart, type UIMessage } from 'ai';
import { ApiError } from '@/lib/server/staff-auth';
import { hasPendingApproval, type StoredMessage } from './store';

export interface ApprovalAnswer {
  approvalId: string;
  approved: boolean;
  reason?: string;
}

/**
 * Write the user's answers into the waiting tool parts
 * (approval-requested → approval-responded). The message and approval ids
 * come from the database, never trusted from the client: an id that is not
 * pending on the conversation's last message is rejected.
 */
export function applyApprovals(
  recent: StoredMessage[],
  answers: ApprovalAnswer[],
): { target: StoredMessage; message: UIMessage; stillPending: boolean } {
  const target = recent[recent.length - 1];
  if (!target || target.message.role !== 'assistant' || target.status !== 'AWAITING_APPROVAL') {
    throw new ApiError(409, 'Nothing is waiting for approval in this conversation.');
  }

  const byId = new Map(answers.map((a) => [a.approvalId, a]));
  const used = new Set<string>();
  const parts = target.message.parts.map((p) => {
    if (!isToolUIPart(p) || p.state !== 'approval-requested') return p;
    const answer = byId.get(p.approval.id);
    if (!answer) return p;
    used.add(answer.approvalId);
    return {
      ...p,
      state: 'approval-responded' as const,
      approval: {
        ...p.approval,
        approved: answer.approved,
        ...(answer.reason ? { reason: answer.reason } : {}),
      },
    };
  }) as UIMessage['parts'];

  const unknown = answers.filter((a) => !used.has(a.approvalId));
  if (unknown.length) throw new ApiError(409, 'This request was already answered or has expired.');

  const message = { ...target.message, parts };
  return { target, message, stillPending: hasPendingApproval(message) };
}
