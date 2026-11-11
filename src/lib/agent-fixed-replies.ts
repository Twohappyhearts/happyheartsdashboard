import { isLanguage, LANGUAGES, matchLanguage, type Language } from './languages';

/**
 * Fixed replies of the Happy Hearts assistant, quoted word for word in the
 * system prompt and shown by the app when the model offers a care-team message
 * without writing any text first. Change them only together with the test set.
 * Shared by server (prompt) and client (chat UI), so no server-only imports here.
 *
 * The assistant answers in the language the user writes in (Bo, 2026-11-11). The fixed replies
 * exist in the app's eight languages. Every translation (Spanish included) is the team's
 * translation: machine translation, pending research-team review. Any other language gets the
 * English fixed reply plus one sentence in the user's language (see prompt.ts).
 *
 * Phone numbers stay in ASCII digits in every language, so the app can turn them into tel: links.
 */

/** Languages with translated fixed replies (same list as the app). */
export const AGENT_LANGUAGES = LANGUAGES;
export type AgentLanguage = Language;

export const isAgentLanguage = isLanguage;

/**
 * The research team's disclaimer (Laura Narvaez, 2026-10-21), shown word for word in the
 * AI notice and under the chat box of the dashboard's staff preview.
 */
export const AI_DISCLAIMER =
  'Notice: AI-generated responses may occasionally be inaccurate or out of scope. Verify details and consult your healthcare provider. See Terms of Use.';

/** The words of AI_DISCLAIMER that link to the Terms of Use. */
export const AI_DISCLAIMER_LINK_TEXT = 'Terms of Use';

/** Public page that redirects to the current Terms of Use PDF. */
export const TERMS_URL = '/legal/terms';

/** AI_DISCLAIMER split around its link: [before, link text, after]. */
export function splitDisclaimer(text = AI_DISCLAIMER, link = AI_DISCLAIMER_LINK_TEXT): [string, string, string] {
  const at = text.lastIndexOf(link);
  return at < 0 ? [text, '', ''] : [text.slice(0, at), link, text.slice(at + link.length)];
}

/** Why the assistant is offering a care-team message; picks the fixed reply. */
export const CARETEAM_SITUATIONS = ['personal', 'urgent', 'crisis', 'crisis_other'] as const;
export type CareteamSituation = (typeof CARETEAM_SITUATIONS)[number];

/** Situations where the reply tells the user to call 911 / 988 (rule 1). */
export const EMERGENCY_SITUATIONS: ReadonlySet<CareteamSituation> = new Set(['urgent', 'crisis', 'crisis_other']);
export const isEmergencySituation = (v: unknown): v is CareteamSituation =>
  typeof v === 'string' && EMERGENCY_SITUATIONS.has(v as CareteamSituation);

export const FIXED_REPLIES: Record<CareteamSituation, string> = {
  // Rule 2: personal or clinical question.
  personal: 'Please contact your healthcare provider.',
  // Rule 1b: symptoms that may need emergency care (worded so it fits the user or someone else).
  urgent: 'These symptoms can be serious. Call 911 now or go to the nearest emergency room. Then let the healthcare provider know.',
  // Rule 1a: thoughts of harming oneself or others.
  crisis:
    "I'm sorry you are going through this. You don't have to face it alone. If you might act on these thoughts or you are in danger, call 911 now. You can call or text 988 any time to talk with someone. You can also call the National Maternal Mental Health Hotline at 1-833-852-6262.",
  // Rule 1a, reported by someone else (partner, friend).
  crisis_other:
    'This may be an emergency. If she might act on these thoughts or is in danger, call 911 now. You can call or text 988 any time for help and advice. You can also call the National Maternal Mental Health Hotline at 1-833-852-6262.',
};

/**
 * The same replies in Spanish. 988 answers in Spanish when the caller presses 2 or texts AYUDA
 * (988lifeline.org); the maternal mental health hotline has Spanish-speaking counselors (HRSA).
 * Machine translation, pending research-team review.
 */
export const FIXED_REPLIES_ES: Record<CareteamSituation, string> = {
  personal: 'Por favor, comuníquese con su proveedor de atención médica.',
  urgent:
    'Estos síntomas pueden ser graves. Llame al 911 ahora o vaya a la sala de emergencias más cercana. Después, avísele al proveedor de atención médica.',
  crisis:
    'Siento mucho que esté pasando por esto. No tiene que enfrentarlo sin ayuda. Si siente que podría actuar según estos pensamientos o está en peligro, llame al 911 ahora. Puede llamar o enviar un mensaje de texto al 988 en cualquier momento para hablar con alguien: al llamar, oprima 2 para español; por texto, escriba AYUDA. También puede llamar a la Línea Nacional de Salud Mental Materna al 1-833-852-6262, que atiende en español.',
  crisis_other:
    'Esto puede ser una emergencia. Si ella podría actuar según estos pensamientos o está en peligro, llame al 911 ahora. Puede llamar o enviar un mensaje de texto al 988 en cualquier momento para pedir ayuda y consejo: al llamar, oprima 2 para español; por texto, escriba AYUDA. También puede llamar a la Línea Nacional de Salud Mental Materna al 1-833-852-6262, que atiende en español.',
};

/*
 * Vietnamese, Korean, Chinese (Simplified and Traditional), Farsi and Arabic.
 * Machine translation, pending research-team review. Faithful to the English: no claims about
 * language services were added. Hotline names keep the English name in brackets so the user
 * can recognize it when calling.
 */
const FIXED_REPLIES_VI: Record<CareteamSituation, string> = {
  personal: 'Vui lòng liên hệ với nhà cung cấp dịch vụ chăm sóc sức khỏe của bạn.',
  urgent:
    'Những triệu chứng này có thể nghiêm trọng. Hãy gọi 911 ngay hoặc đến phòng cấp cứu gần nhất. Sau đó, hãy báo cho nhà cung cấp dịch vụ chăm sóc sức khỏe.',
  crisis:
    'Tôi rất tiếc vì bạn đang phải trải qua điều này. Bạn không phải đối mặt với nó một mình. Nếu bạn có thể làm theo những suy nghĩ này hoặc bạn đang gặp nguy hiểm, hãy gọi 911 ngay. Bạn có thể gọi hoặc nhắn tin đến 988 bất cứ lúc nào để nói chuyện với ai đó. Bạn cũng có thể gọi Đường dây nóng Quốc gia về Sức khỏe Tâm thần Bà mẹ (National Maternal Mental Health Hotline) theo số 1-833-852-6262.',
  crisis_other:
    'Đây có thể là trường hợp khẩn cấp. Nếu cô ấy có thể làm theo những suy nghĩ này hoặc đang gặp nguy hiểm, hãy gọi 911 ngay. Bạn có thể gọi hoặc nhắn tin đến 988 bất cứ lúc nào để được giúp đỡ và tư vấn. Bạn cũng có thể gọi Đường dây nóng Quốc gia về Sức khỏe Tâm thần Bà mẹ (National Maternal Mental Health Hotline) theo số 1-833-852-6262.',
};

const FIXED_REPLIES_KO: Record<CareteamSituation, string> = {
  personal: '담당 의료진에게 연락해 주세요.',
  urgent: '이 증상은 심각할 수 있습니다. 지금 바로 911에 전화하거나 가장 가까운 응급실로 가세요. 그런 다음 담당 의료진에게 알려 주세요.',
  crisis:
    '이런 일을 겪고 계셔서 마음이 아픕니다. 혼자 감당하지 않으셔도 됩니다. 이런 생각대로 행동할 수도 있을 것 같거나 위험한 상황이라면 지금 바로 911에 전화하세요. 언제든지 988에 전화하거나 문자를 보내 누군가와 이야기할 수 있습니다. 전국 산모 정신 건강 핫라인(National Maternal Mental Health Hotline) 1-833-852-6262에도 전화할 수 있습니다.',
  crisis_other:
    '응급 상황일 수 있습니다. 그분이 이런 생각대로 행동할 수도 있거나 위험한 상황이라면 지금 바로 911에 전화하세요. 언제든지 988에 전화하거나 문자를 보내 도움과 조언을 받을 수 있습니다. 전국 산모 정신 건강 핫라인(National Maternal Mental Health Hotline) 1-833-852-6262에도 전화할 수 있습니다.',
};

const FIXED_REPLIES_ZH_HANS: Record<CareteamSituation, string> = {
  personal: '请联系您的医疗服务提供者。',
  urgent: '这些症状可能很严重。请立即拨打 911 或前往最近的急诊室。之后再告知医疗服务提供者。',
  crisis:
    '很抱歉您正在经历这些。您不必独自面对。如果您可能会按这些想法去做，或您正处于危险中，请立即拨打 911。您可以随时拨打或发短信到 988，找人聊一聊。您也可以拨打全国孕产妇心理健康热线（National Maternal Mental Health Hotline）1-833-852-6262。',
  crisis_other:
    '这可能是紧急情况。如果她可能会按这些想法去做，或正处于危险中，请立即拨打 911。您可以随时拨打或发短信到 988，寻求帮助和建议。您也可以拨打全国孕产妇心理健康热线（National Maternal Mental Health Hotline）1-833-852-6262。',
};

const FIXED_REPLIES_ZH_HANT: Record<CareteamSituation, string> = {
  personal: '請聯絡您的醫療服務提供者。',
  urgent: '這些症狀可能很嚴重。請立即撥打 911 或前往最近的急診室。之後再告知醫療服務提供者。',
  crisis:
    '很遺憾您正在經歷這些。您不必獨自面對。如果您可能會照著這些念頭去做，或您正處於危險中，請立即撥打 911。您可以隨時撥打或傳簡訊到 988，找人談一談。您也可以撥打全國孕產婦心理健康熱線（National Maternal Mental Health Hotline）1-833-852-6262。',
  crisis_other:
    '這可能是緊急情況。如果她可能會照著這些念頭去做，或正處於危險中，請立即撥打 911。您可以隨時撥打或傳簡訊到 988，尋求幫助和建議。您也可以撥打全國孕產婦心理健康熱線（National Maternal Mental Health Hotline）1-833-852-6262。',
};

const FIXED_REPLIES_FA: Record<CareteamSituation, string> = {
  personal: 'لطفاً با ارائه‌دهنده خدمات درمانی خود تماس بگیرید.',
  urgent:
    'این علائم ممکن است جدی باشند. همین حالا با 911 تماس بگیرید یا به نزدیک‌ترین اورژانس بروید. سپس به ارائه‌دهنده خدمات درمانی اطلاع دهید.',
  crisis:
    'متأسفم که این شرایط را تجربه می‌کنید. لازم نیست به‌تنهایی با آن روبه‌رو شوید. اگر ممکن است بر اساس این افکار کاری انجام دهید یا در خطر هستید، همین حالا با 911 تماس بگیرید. هر زمان می‌توانید با 988 تماس بگیرید یا به آن پیامک بزنید تا با کسی صحبت کنید. همچنین می‌توانید با خط تلفن ملی سلامت روان مادران (National Maternal Mental Health Hotline) به شماره 1-833-852-6262 تماس بگیرید.',
  crisis_other:
    'ممکن است این یک وضعیت اضطراری باشد. اگر ممکن است او بر اساس این افکار کاری انجام دهد یا در خطر است، همین حالا با 911 تماس بگیرید. هر زمان می‌توانید با 988 تماس بگیرید یا به آن پیامک بزنید تا کمک و راهنمایی بگیرید. همچنین می‌توانید با خط تلفن ملی سلامت روان مادران (National Maternal Mental Health Hotline) به شماره 1-833-852-6262 تماس بگیرید.',
};

/** Worded without grammatical gender where Arabic allows it (the user may be the patient or a family member). */
const FIXED_REPLIES_AR: Record<CareteamSituation, string> = {
  personal: 'يُرجى التواصل مع مقدّم الرعاية الصحية الخاص بك.',
  urgent: 'قد تكون هذه الأعراض خطيرة. يُرجى الاتصال بالرقم 911 الآن أو التوجّه إلى أقرب قسم للطوارئ. وبعد ذلك يُرجى إبلاغ مقدّم الرعاية الصحية.',
  crisis:
    'نأسف لما تمرّ به هذه الفترة. لا داعي لمواجهة ذلك وحدك. إذا كان هناك خطر التصرّف بناءً على هذه الأفكار أو كان هناك خطر عليك، فيُرجى الاتصال بالرقم 911 الآن. يمكنك الاتصال بالرقم 988 أو إرسال رسالة نصية إليه في أي وقت للتحدث مع شخص ما. يمكنك أيضًا الاتصال بالخط الساخن الوطني للصحة النفسية للأمهات (National Maternal Mental Health Hotline) على الرقم 1-833-852-6262.',
  crisis_other:
    'قد تكون هذه حالة طارئة. إذا كان من المحتمل أن تتصرّف هي بناءً على هذه الأفكار أو كانت في خطر، فيُرجى الاتصال بالرقم 911 الآن. يمكنك الاتصال بالرقم 988 أو إرسال رسالة نصية إليه في أي وقت لطلب المساعدة والنصيحة. يمكنك أيضًا الاتصال بالخط الساخن الوطني للصحة النفسية للأمهات (National Maternal Mental Health Hotline) على الرقم 1-833-852-6262.',
};

export const FIXED_REPLIES_BY_LANGUAGE: Record<Language, Record<CareteamSituation, string>> = {
  en: FIXED_REPLIES,
  es: FIXED_REPLIES_ES,
  vi: FIXED_REPLIES_VI,
  ko: FIXED_REPLIES_KO,
  'zh-Hans': FIXED_REPLIES_ZH_HANS,
  'zh-Hant': FIXED_REPLIES_ZH_HANT,
  fa: FIXED_REPLIES_FA,
  ar: FIXED_REPLIES_AR,
};

/** Rule 4: the search results do not answer a pregnancy or postpartum question. */
export const NO_INFORMATION_REPLY = "I don't have information on that. Please ask your healthcare provider.";
export const NO_INFORMATION_REPLY_ES = 'No tengo información sobre eso. Por favor, pregúntele a su proveedor de atención médica.';

/** Rule 4 in every language. Machine translation, pending research-team review. */
export const NO_INFORMATION_REPLIES: Record<Language, string> = {
  en: NO_INFORMATION_REPLY,
  es: NO_INFORMATION_REPLY_ES,
  vi: 'Tôi không có thông tin về vấn đề đó. Vui lòng hỏi nhà cung cấp dịch vụ chăm sóc sức khỏe của bạn.',
  ko: '그에 대한 정보가 없습니다. 담당 의료진에게 문의해 주세요.',
  'zh-Hans': '我没有这方面的信息。请询问您的医疗服务提供者。',
  'zh-Hant': '我沒有這方面的資訊。請詢問您的醫療服務提供者。',
  fa: 'در این مورد اطلاعاتی ندارم. لطفاً از ارائه‌دهنده خدمات درمانی خود بپرسید.',
  ar: 'ليست لديّ معلومات عن ذلك. يُرجى سؤال مقدّم الرعاية الصحية الخاص بك.',
};

/**
 * Rule 1c (someone is hurting or threatening the user) outside English; the English rule gives
 * the wording itself (prompt.ts). The hotline has Spanish-speaking advocates.
 * Machine translation, pending research-team review.
 */
export const DOMESTIC_VIOLENCE_REPLIES: Record<Exclude<Language, 'en'>, string> = {
  es: 'Si está en peligro ahora mismo, llame al 911. Puede llamar a la Línea Nacional sobre la Violencia Doméstica al 1-800-799-7233 a cualquier hora; hay personas que hablan español.',
  vi: 'Nếu bạn đang gặp nguy hiểm ngay lúc này, hãy gọi 911. Bạn có thể gọi Đường dây nóng Quốc gia về Bạo lực Gia đình (National Domestic Violence Hotline) theo số 1-800-799-7233 bất cứ lúc nào.',
  ko: '지금 위험한 상황이라면 911에 전화하세요. 전국 가정폭력 핫라인(National Domestic Violence Hotline) 1-800-799-7233에 언제든지 전화할 수 있습니다.',
  'zh-Hans': '如果您现在有危险，请拨打 911。您可以随时拨打全国家庭暴力热线（National Domestic Violence Hotline）1-800-799-7233。',
  'zh-Hant': '如果您現在有危險，請撥打 911。您可以隨時撥打全國家庭暴力熱線（National Domestic Violence Hotline）1-800-799-7233。',
  fa: 'اگر همین حالا در خطر هستید، با 911 تماس بگیرید. هر زمان می‌توانید با خط تلفن ملی خشونت خانگی (National Domestic Violence Hotline) به شماره 1-800-799-7233 تماس بگیرید.',
  ar: 'إذا كان هناك خطر عليك الآن، فيُرجى الاتصال بالرقم 911. يمكنك الاتصال بالخط الساخن الوطني للعنف الأسري (National Domestic Violence Hotline) على الرقم 1-800-799-7233 في أي وقت.',
};

/** The fixed reply for a situation in the given language (a code such as "es" or "zh-Hant"; else English). */
export const fixedReply = (situation: CareteamSituation, language: string = 'en') =>
  FIXED_REPLIES_BY_LANGUAGE[matchLanguage(language) ?? 'en'][situation];

export const isCareteamSituation = (v: unknown): v is CareteamSituation =>
  typeof v === 'string' && (CARETEAM_SITUATIONS as readonly string[]).includes(v);

// ---------------------------------------------------------------- recognizing a fixed reply

/** Persian and Arabic-Indic digits → ASCII, so "۹۱۱" counts as 911. */
export const asciiDigits = (t: string) =>
  t.replace(/[۰-۹٠-٩]/g, (d) => String((d.charCodeAt(0) - (d >= '۰' ? 0x06f0 : 0x0660)) % 10));

/**
 * Text reduced to letters and digits for comparing: punctuation, spaces, zero-width joiners and
 * Arabic diacritics dropped; Arabic / Persian letter variants and digits unified; lower case.
 */
function comparable(text: string): string {
  return asciiDigits(text)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/[\s\p{P}\p{S}​-‏]/gu, '');
}

const ORDER: CareteamSituation[] = ['crisis_other', 'crisis', 'urgent', 'personal'];
let comparableReplies: Array<{ situation: CareteamSituation; text: string }> | null = null;

/** Which fixed reply (rule 1a / 1b / 2), in any of the app's languages, the text contains, if any. Longer replies first. */
export function fixedReplySituation(text: string): CareteamSituation | null {
  comparableReplies ??= ORDER.flatMap((situation) =>
    LANGUAGES.map((lang) => ({ situation, text: comparable(FIXED_REPLIES_BY_LANGUAGE[lang][situation]) })),
  );
  const t = comparable(text);
  return comparableReplies.find((r) => t.includes(r.text))?.situation ?? null;
}
