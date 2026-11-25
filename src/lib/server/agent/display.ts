import 'server-only';
import type { AgentCaller } from './auth';
import type { PathMessage } from './store';

/** Messages of a branch for display. Patients get no reasoning parts (shown only in the staff preview). */
export function displayMessages(caller: Pick<AgentCaller, 'role'>, rows: PathMessage[]) {
  const patient = caller.role === 'patient';
  return rows.map((r) => ({
    ...r.message,
    ...(patient ? { parts: r.message.parts.filter((p) => p.type !== 'reasoning') } : {}),
    seq: r.seq,
    status: r.status,
    createdAt: r.createdAt,
    parentId: r.parentId,
    // Versions of this message (itself included), oldest first: "‹ 2/3 ›" when more than one.
    siblingIds: r.siblingIds,
  }));
}
