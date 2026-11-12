import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_DISCLAIMER, splitDisclaimer } from './agent-fixed-replies';
import type { Language } from './languages';

/**
 * The notice a patient accepts before using the AI assistant
 * (public.agent_consents; recorded by POST /api/agent/consent).
 *
 * Raise AI_NOTICE_VERSION when the wording changes in a way patients must accept again:
 * everyone who accepted an older version is asked once more. Uploading a new Terms of Use
 * (public.legal_documents) asks everyone again as well (agent_consents.terms_version).
 * Shared by server and client, so no server-only imports here.
 *
 * Version 2 (2026-11-11): Laura's disclaimer with a Terms of Use link, and a checkbox
 * before "Continue".
 */
export const AI_NOTICE_VERSION = 2;

export interface NoticeText {
  title: string;
  /** The research team's disclaimer split around its Terms of Use link: [before, link text, after]. */
  disclaimer: [string, string, string];
  /** Under a translated disclaimer: the English wording is the official one. Empty in English. */
  officialNote: string;
  points: string[];
  /** The checkbox. */
  agree: string;
  /** The button, enabled once the checkbox is ticked. */
  continue: string;
  /** Label of the language picker. */
  language: string;
  saveError: string;
}

/**
 * The disclaimer is Laura Narvaez's text (2026-10-21), word for word in English (AI_DISCLAIMER).
 * The three points are the development team's wording. Every non-English text is a machine
 * translation, pending research-team review; the dialog says the English disclaimer is the
 * official one.
 */
export const AI_NOTICE: Record<Language, NoticeText> = {
  en: {
    title: 'Before you use the AI assistant',
    disclaimer: splitDisclaimer(AI_DISCLAIMER),
    officialNote: '',
    points: [
      'Answers are written by AI. They are general health education for reference only, and can sometimes be wrong or incomplete.',
      'The assistant is not a doctor or nurse. It cannot diagnose you and does not replace advice from your healthcare provider.',
      'If you feel unwell or are worried about your health, contact your healthcare provider or care team. In an emergency, call 911.',
    ],
    agree: 'I understand and agree',
    continue: 'Continue',
    language: 'Language',
    saveError: 'Could not save your answer. Check your connection and try again.',
  },
  es: {
    title: 'Antes de usar el asistente de IA',
    disclaimer: [
      'Aviso: Las respuestas generadas por IA a veces pueden ser inexactas o estar fuera del tema. Verifique los detalles y consulte a su proveedor de atención médica. Consulte los ',
      'Términos de uso',
      '.',
    ],
    officialNote: 'Esta es una traducción. La versión en inglés es la oficial.',
    points: [
      'Las respuestas las escribe una IA. Son educación general sobre salud, solo como referencia, y a veces pueden ser incorrectas o incompletas.',
      'El asistente no es médico ni enfermera. No puede darle un diagnóstico y no reemplaza el consejo de su proveedor de atención médica.',
      'Si se siente mal o le preocupa su salud, comuníquese con su proveedor de atención médica o su equipo de atención. En una emergencia, llame al 911.',
    ],
    agree: 'Entiendo y acepto',
    continue: 'Continuar',
    language: 'Idioma',
    saveError: 'No se pudo guardar su respuesta. Revise su conexión e inténtelo de nuevo.',
  },
  vi: {
    title: 'Trước khi bạn dùng trợ lý AI',
    disclaimer: [
      'Lưu ý: Các câu trả lời do AI tạo ra đôi khi có thể không chính xác hoặc nằm ngoài phạm vi. Hãy kiểm tra lại thông tin và hỏi ý kiến nhà cung cấp dịch vụ chăm sóc sức khỏe của bạn. Xem ',
      'Điều khoản sử dụng',
      '.',
    ],
    officialNote: 'Đây là bản dịch. Bản tiếng Anh là bản chính thức.',
    points: [
      'Các câu trả lời do AI viết. Đây là thông tin giáo dục sức khỏe chung, chỉ để tham khảo, và đôi khi có thể sai hoặc chưa đầy đủ.',
      'Trợ lý này không phải là bác sĩ hay y tá. Trợ lý không thể chẩn đoán cho bạn và không thay thế lời khuyên của nhà cung cấp dịch vụ chăm sóc sức khỏe của bạn.',
      'Nếu bạn thấy không khỏe hoặc lo lắng về sức khỏe, hãy liên hệ với nhà cung cấp dịch vụ chăm sóc sức khỏe hoặc nhóm chăm sóc của bạn. Trong trường hợp khẩn cấp, hãy gọi 911.',
    ],
    agree: 'Tôi hiểu và đồng ý',
    continue: 'Tiếp tục',
    language: 'Ngôn ngữ',
    saveError: 'Không thể lưu câu trả lời của bạn. Hãy kiểm tra kết nối và thử lại.',
  },
  ko: {
    title: 'AI 도우미를 사용하기 전에',
    disclaimer: [
      '안내: AI가 생성한 답변은 가끔 부정확하거나 범위를 벗어날 수 있습니다. 세부 내용을 확인하고 담당 의료진과 상담하세요. ',
      '이용 약관',
      '을 참조하세요.',
    ],
    officialNote: '이 글은 번역본입니다. 영어 원문이 공식 버전입니다.',
    points: [
      '답변은 AI가 작성합니다. 참고용 일반 건강 교육 정보이며, 가끔 틀리거나 불완전할 수 있습니다.',
      '도우미는 의사나 간호사가 아닙니다. 진단을 내릴 수 없으며 담당 의료진의 조언을 대신하지 않습니다.',
      '몸이 좋지 않거나 건강이 걱정되면 담당 의료진이나 케어팀에 연락하세요. 응급 상황에서는 911에 전화하세요.',
    ],
    agree: '이해했으며 동의합니다',
    continue: '계속',
    language: '언어',
    saveError: '답변을 저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
  },
  'zh-Hans': {
    title: '使用 AI 助手之前',
    disclaimer: ['注意：AI 生成的回答有时可能不准确或超出范围。请核实细节，并咨询您的医疗服务提供者。请参阅', '使用条款', '。'],
    officialNote: '此为翻译版本，以英文版为准。',
    points: [
      '回答由 AI 撰写，属于一般健康教育信息，仅供参考，有时可能有错误或不完整。',
      '助手不是医生或护士，无法为您诊断，也不能取代您的医疗服务提供者的建议。',
      '如果您感到不适或担心自己的健康，请联系您的医疗服务提供者或护理团队。紧急情况请拨打 911。',
    ],
    agree: '我了解并同意',
    continue: '继续',
    language: '语言',
    saveError: '无法保存您的回答。请检查网络连接后重试。',
  },
  'zh-Hant': {
    title: '使用 AI 助理之前',
    disclaimer: ['注意：AI 生成的回答有時可能不準確或超出範圍。請核實細節，並諮詢您的醫療服務提供者。請參閱', '使用條款', '。'],
    officialNote: '此為翻譯版本，以英文版為準。',
    points: [
      '回答由 AI 撰寫，屬於一般健康教育資訊，僅供參考，有時可能有錯誤或不完整。',
      '助理不是醫生或護理師，無法為您診斷，也不能取代您的醫療服務提供者的建議。',
      '如果您感到不適或擔心自己的健康，請聯絡您的醫療服務提供者或照護團隊。緊急情況請撥打 911。',
    ],
    agree: '我了解並同意',
    continue: '繼續',
    language: '語言',
    saveError: '無法儲存您的回答。請檢查網路連線後再試一次。',
  },
  fa: {
    title: 'پیش از استفاده از دستیار هوش مصنوعی',
    disclaimer: [
      'توجه: پاسخ‌هایی که هوش مصنوعی تولید می‌کند ممکن است گاهی نادرست یا خارج از موضوع باشند. جزئیات را بررسی کنید و با ارائه‌دهنده خدمات درمانی خود مشورت کنید. ',
      'شرایط استفاده',
      ' را ببینید.',
    ],
    officialNote: 'این متن ترجمه شده است. نسخه انگلیسی، نسخه رسمی است.',
    points: [
      'پاسخ‌ها را هوش مصنوعی می‌نویسد. این پاسخ‌ها آموزش عمومی سلامت و فقط برای اطلاع هستند و گاهی ممکن است نادرست یا ناقص باشند.',
      'این دستیار پزشک یا پرستار نیست. نمی‌تواند بیماری شما را تشخیص دهد و جای توصیه ارائه‌دهنده خدمات درمانی شما را نمی‌گیرد.',
      'اگر حال‌تان خوب نیست یا نگران سلامت خود هستید، با ارائه‌دهنده خدمات درمانی یا تیم مراقبت خود تماس بگیرید. در شرایط اضطراری با 911 تماس بگیرید.',
    ],
    agree: 'متوجه شدم و موافقم',
    continue: 'ادامه',
    language: 'زبان',
    saveError: 'پاسخ شما ذخیره نشد. اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.',
  },
  ar: {
    title: 'قبل استخدام المساعد الذكي',
    disclaimer: [
      'تنبيه: قد تكون الإجابات التي يُنشئها الذكاء الاصطناعي غير دقيقة أحيانًا أو خارج نطاق الموضوع. يُرجى التحقق من التفاصيل واستشارة مقدّم الرعاية الصحية. يُرجى مراجعة ',
      'شروط الاستخدام',
      '.',
    ],
    officialNote: 'هذا النص مترجم. النسخة الإنجليزية هي النسخة الرسمية.',
    points: [
      'يكتب الذكاء الاصطناعي الإجابات. وهي معلومات عامة للتثقيف الصحي للاطلاع فقط، وقد تكون أحيانًا خاطئة أو غير كاملة.',
      'المساعد ليس طبيبًا ولا ممرضًا. لا يمكنه التشخيص، ولا يغني عن نصيحة مقدّم الرعاية الصحية.',
      'عند الشعور بتوعّك أو القلق بشأن الصحة، يُرجى التواصل مع مقدّم الرعاية الصحية أو فريق الرعاية. في حالات الطوارئ، يُرجى الاتصال بالرقم 911.',
    ],
    agree: 'أفهم وأوافق',
    continue: 'متابعة',
    language: 'اللغة',
    saveError: 'تعذّر حفظ إجابتك. يُرجى التحقق من الاتصال والمحاولة مرة أخرى.',
  },
};

export interface AgentConsent {
  userId: string;
  version: number;
  /** The Terms of Use version current when they accepted (0 = none uploaded yet). */
  termsVersion: number;
  agreedAt: string;
}

/** Everyone who accepted the notice (staff only, by RLS). */
export async function listConsents(supabase: SupabaseClient): Promise<AgentConsent[]> {
  const { data, error } = await supabase.from('agent_consents').select('user_id, version, terms_version, agreed_at').limit(10000);
  if (error) {
    if (error.code === '42501') throw new Error('Your account does not have staff permission.');
    if (error.code === 'PGRST205' || error.code === '42P01') throw new Error('Run the agent_consents migration first.');
    if (error.code === '42703' || error.code === 'PGRST204') throw new Error('Run the 20261111000100 migration first (agent_consents.terms_version).');
    throw new Error(error.message || 'Could not load the AI notice records.');
  }
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    userId: String(r.user_id),
    version: Number(r.version ?? 0),
    termsVersion: Number(r.terms_version ?? 0),
    agreedAt: String(r.agreed_at ?? ''),
  }));
}

/** Version of the current Terms of Use (public.legal_documents); 0 when none was uploaded or the table is missing. */
export async function getCurrentTermsVersion(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('version')
    .eq('kind', 'terms')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') return 0;
    throw new Error(error.message || 'Could not read the Terms of Use version.');
  }
  return data ? Number(data.version) || 0 : 0;
}

/** Does this acceptance still count? Same rule as the server (src/lib/server/agent/consent.ts). */
export const consentIsCurrent = (c: Pick<AgentConsent, 'version' | 'termsVersion'>, currentTermsVersion: number) =>
  c.version >= AI_NOTICE_VERSION && c.termsVersion >= currentTermsVersion;
