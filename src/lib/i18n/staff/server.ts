import 'server-only';
import { cookies } from 'next/headers';
import { isStaffLang, STAFF_LANG_COOKIE, STAFF_TEXT, type StaffLang, type StaffText } from './index';

/** The staff dashboard language from the hh_staff_lang cookie; English when unset. */
export async function getStaffLang(): Promise<StaffLang> {
  const value = (await cookies()).get(STAFF_LANG_COOKIE)?.value;
  return isStaffLang(value) ? value : 'en';
}

export async function getStaffText(): Promise<StaffText> {
  return STAFF_TEXT[await getStaffLang()];
}
