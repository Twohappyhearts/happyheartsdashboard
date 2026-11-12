import 'server-only';
import { requireStaffCaller } from '@/lib/server/staff-auth';

export const STAFF_ONLY = 'Only active Careteam or Admin accounts can manage community resources.';

export const requireResourceStaff = () => requireStaffCaller(STAFF_ONLY);
