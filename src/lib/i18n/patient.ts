import { LANGUAGE_NAMES, type Language } from '@/lib/languages';

/**
 * Text of the patient AI chat in the app's eight languages. The app's native chat takes its
 * texts from here (happyhearts/tool/gen_ai_chat_strings.mjs); the dashboard's AI Chat preview
 * uses the English ones (sources, call buttons).
 * The AI notice itself lives in src/lib/agent-consent.ts; fixed safety replies in
 * src/lib/agent-fixed-replies.ts.
 *
 * Every non-English text is a machine translation, pending research-team review.
 * Shared by server and client, so no server-only imports here.
 */
export interface PatientText {
  // Opening the page
  openFromApp: string;
  signInAgain: string;
  // Conversation list
  newConversation: string;
  yourConversations: string;
  /** Label of the button that opens the conversation list. */
  history: string;
  backToChat: string;
  newChat: string;
  retry: string;
  noConversations: string;
  yesterday: string;
  deleteConversation: (title: string) => string;
  deleteTitle: string;
  deleteBody: (title: string) => string;
  cancel: string;
  delete: string;
  deleting: string;
  listError: string;
  openError: string;
  deleteError: string;
  // Chat
  emptyTitle: string;
  emptySubtitle: string;
  /** General pregnancy / postpartum questions; never personal symptoms. */
  suggestions: [string, string, string];
  placeholder: string;
  send: string;
  stop: string;
  thinking: string;
  /** While the assistant searches (the search itself is not shown to patients). */
  lookingUp: string;
  /** Searches are done, the answer has not started yet. */
  writingAnswer: string;
  /** Added under the status line after 8 s without text. */
  waitHint: string;
  chatError: string;
  // Sources under an answer
  sources: (n: number) => string;
  openSourceError: string;
  // Emergency replies (911 / 988)
  call: (number: string) => string;
  // Editing a message and its versions (‹ 2/3 ›)
  edit: string;
  copy: string;
  editingMessage: string;
  previousVersion: string;
  nextVersion: string;
  versionFailed: string;
}

const en: PatientText = {
  openFromApp: 'Open the AI assistant from the HappyHearts app.',
  signInAgain: 'Please sign in to the HappyHearts app again.',
  newConversation: 'New conversation',
  yourConversations: 'Your conversations',
  history: 'History',
  backToChat: 'Back to chat',
  newChat: 'New',
  retry: 'Retry',
  noConversations: 'No conversations yet. Start one to ask the assistant a question.',
  yesterday: 'Yesterday',
  deleteConversation: (t) => `Delete ${t}`,
  deleteTitle: 'Delete this conversation?',
  deleteBody: (t) => `“${t}” will be removed from your list.`,
  cancel: 'Cancel',
  delete: 'Delete',
  deleting: 'Deleting…',
  listError: 'Could not load your conversations.',
  openError: 'Could not open this conversation.',
  deleteError: 'Could not delete the conversation.',
  emptyTitle: 'How can I help today?',
  emptySubtitle: 'Ask a general question about pregnancy or life after birth.',
  suggestions: [
    'What are the warning signs of preeclampsia?',
    'How much physical activity is recommended during pregnancy?',
    'How are the baby blues different from postpartum depression?',
  ],
  placeholder: 'Type a message',
  send: 'Send',
  stop: 'Stop',
  thinking: 'Thinking…',
  lookingUp: 'Searching trusted sources…',
  writingAnswer: 'Writing your answer…',
  waitHint: 'Checking sources can take up to 30 seconds.',
  chatError: 'Something went wrong. Please try again.',
  sources: (n) => (n === 1 ? '1 source' : `${n} sources`),
  openSourceError: 'Could not open this source. Please try again.',
  call: (n) => `Call ${n}`,
  edit: 'Edit',
  copy: 'Copy',
  editingMessage: 'Editing message',
  previousVersion: 'Previous version',
  nextVersion: 'Next version',
  versionFailed: 'Could not show that version.',
};

// Machine translation, pending research-team review.
const es: PatientText = {
  openFromApp: 'Abra el asistente de IA desde la aplicación HappyHearts.',
  signInAgain: 'Vuelva a iniciar sesión en la aplicación HappyHearts.',
  newConversation: 'Nueva conversación',
  yourConversations: 'Sus conversaciones',
  history: 'Historial',
  backToChat: 'Volver al chat',
  newChat: 'Nueva',
  retry: 'Reintentar',
  noConversations: 'Todavía no hay conversaciones. Empiece una para hacerle una pregunta al asistente.',
  yesterday: 'Ayer',
  deleteConversation: (t) => `Eliminar ${t}`,
  deleteTitle: '¿Eliminar esta conversación?',
  deleteBody: (t) => `“${t}” se quitará de su lista.`,
  cancel: 'Cancelar',
  delete: 'Eliminar',
  deleting: 'Eliminando…',
  listError: 'No se pudieron cargar sus conversaciones.',
  openError: 'No se pudo abrir esta conversación.',
  deleteError: 'No se pudo eliminar la conversación.',
  emptyTitle: '¿En qué le puedo ayudar hoy?',
  emptySubtitle: 'Haga una pregunta general sobre el embarazo o la vida después del parto.',
  suggestions: [
    '¿Cuáles son las señales de advertencia de la preeclampsia?',
    '¿Cuánta actividad física se recomienda durante el embarazo?',
    '¿En qué se diferencia la tristeza posparto de la depresión posparto?',
  ],
  placeholder: 'Escriba un mensaje',
  send: 'Enviar',
  stop: 'Detener',
  thinking: 'Pensando…',
  lookingUp: 'Buscando en fuentes confiables…',
  writingAnswer: 'Escribiendo su respuesta…',
  waitHint: 'Revisar las fuentes puede tardar hasta 30 segundos.',
  chatError: 'Algo salió mal. Inténtelo de nuevo.',
  sources: (n) => (n === 1 ? '1 fuente' : `${n} fuentes`),
  openSourceError: 'No se pudo abrir esta fuente. Inténtelo de nuevo.',
  call: (n) => `Llamar al ${n}`,
  edit: 'Editar',
  copy: 'Copiar',
  editingMessage: 'Editando el mensaje',
  previousVersion: 'Versión anterior',
  nextVersion: 'Versión siguiente',
  versionFailed: 'No se pudo mostrar esa versión.',
};

const vi: PatientText = {
  openFromApp: 'Hãy mở trợ lý AI từ ứng dụng HappyHearts.',
  signInAgain: 'Vui lòng đăng nhập lại vào ứng dụng HappyHearts.',
  newConversation: 'Cuộc trò chuyện mới',
  yourConversations: 'Các cuộc trò chuyện của bạn',
  history: 'Lịch sử',
  backToChat: 'Quay lại trò chuyện',
  newChat: 'Mới',
  retry: 'Thử lại',
  noConversations: 'Chưa có cuộc trò chuyện nào. Hãy bắt đầu một cuộc trò chuyện để hỏi trợ lý.',
  yesterday: 'Hôm qua',
  deleteConversation: (t) => `Xóa ${t}`,
  deleteTitle: 'Xóa cuộc trò chuyện này?',
  deleteBody: (t) => `“${t}” sẽ bị xóa khỏi danh sách của bạn.`,
  cancel: 'Hủy',
  delete: 'Xóa',
  deleting: 'Đang xóa…',
  listError: 'Không thể tải các cuộc trò chuyện của bạn.',
  openError: 'Không thể mở cuộc trò chuyện này.',
  deleteError: 'Không thể xóa cuộc trò chuyện.',
  emptyTitle: 'Hôm nay tôi có thể giúp gì cho bạn?',
  emptySubtitle: 'Hãy hỏi một câu hỏi chung về thai kỳ hoặc cuộc sống sau khi sinh.',
  suggestions: [
    'Các dấu hiệu cảnh báo của tiền sản giật là gì?',
    'Nên vận động thể chất bao nhiêu khi mang thai?',
    'Buồn bã sau sinh (baby blues) khác với trầm cảm sau sinh như thế nào?',
  ],
  placeholder: 'Nhập tin nhắn',
  send: 'Gửi',
  stop: 'Dừng',
  thinking: 'Đang suy nghĩ…',
  lookingUp: 'Đang tìm trong các nguồn đáng tin cậy…',
  writingAnswer: 'Đang viết câu trả lời…',
  waitHint: 'Việc kiểm tra nguồn có thể mất tới 30 giây.',
  chatError: 'Đã xảy ra lỗi. Vui lòng thử lại.',
  sources: (n) => `${n} nguồn`,
  openSourceError: 'Không thể mở nguồn này. Vui lòng thử lại.',
  call: (n) => `Gọi ${n}`,
  edit: 'Sửa',
  copy: 'Sao chép',
  editingMessage: 'Đang sửa tin nhắn',
  previousVersion: 'Phiên bản trước',
  nextVersion: 'Phiên bản sau',
  versionFailed: 'Không thể hiển thị phiên bản đó.',
};

const ko: PatientText = {
  openFromApp: 'HappyHearts 앱에서 AI 도우미를 열어 주세요.',
  signInAgain: 'HappyHearts 앱에 다시 로그인해 주세요.',
  newConversation: '새 대화',
  yourConversations: '내 대화',
  history: '기록',
  backToChat: '대화로 돌아가기',
  newChat: '새 대화',
  retry: '다시 시도',
  noConversations: '아직 대화가 없습니다. 새 대화를 시작해 도우미에게 질문해 보세요.',
  yesterday: '어제',
  deleteConversation: (t) => `${t} 삭제`,
  deleteTitle: '이 대화를 삭제할까요?',
  deleteBody: (t) => `“${t}” 대화가 목록에서 삭제됩니다.`,
  cancel: '취소',
  delete: '삭제',
  deleting: '삭제 중…',
  listError: '대화 목록을 불러오지 못했습니다.',
  openError: '이 대화를 열지 못했습니다.',
  deleteError: '대화를 삭제하지 못했습니다.',
  emptyTitle: '오늘 무엇을 도와드릴까요?',
  emptySubtitle: '임신이나 출산 후 생활에 대해 일반적인 질문을 해 보세요.',
  suggestions: [
    '임신중독증(전자간증)의 경고 신호는 무엇인가요?',
    '임신 중에는 신체 활동을 얼마나 하는 것이 좋나요?',
    '산후 우울감(베이비 블루스)과 산후 우울증은 어떻게 다른가요?',
  ],
  placeholder: '메시지를 입력하세요',
  send: '보내기',
  stop: '중지',
  thinking: '생각하는 중…',
  lookingUp: '신뢰할 수 있는 자료를 찾는 중…',
  writingAnswer: '답변을 작성하는 중…',
  waitHint: '자료를 확인하는 데 최대 30초가 걸릴 수 있습니다.',
  chatError: '문제가 발생했습니다. 다시 시도해 주세요.',
  sources: (n) => `출처 ${n}개`,
  openSourceError: '이 출처를 열지 못했습니다. 다시 시도해 주세요.',
  call: (n) => `${n}에 전화하기`,
  edit: '수정',
  copy: '복사',
  editingMessage: '메시지 수정 중',
  previousVersion: '이전 버전',
  nextVersion: '다음 버전',
  versionFailed: '해당 버전을 표시할 수 없습니다.',
};

const zhHans: PatientText = {
  openFromApp: '请在 HappyHearts 应用中打开 AI 助手。',
  signInAgain: '请重新登录 HappyHearts 应用。',
  newConversation: '新对话',
  yourConversations: '我的对话',
  history: '历史记录',
  backToChat: '返回对话',
  newChat: '新对话',
  retry: '重试',
  noConversations: '还没有对话。开始一个对话，向助手提问吧。',
  yesterday: '昨天',
  deleteConversation: (t) => `删除“${t}”`,
  deleteTitle: '删除这个对话？',
  deleteBody: (t) => `“${t}”将从您的列表中删除。`,
  cancel: '取消',
  delete: '删除',
  deleting: '正在删除…',
  listError: '无法加载您的对话。',
  openError: '无法打开这个对话。',
  deleteError: '无法删除这个对话。',
  emptyTitle: '今天我能帮您什么？',
  emptySubtitle: '欢迎询问有关怀孕或产后生活的一般问题。',
  suggestions: ['子痫前期有哪些警示信号？', '怀孕期间建议做多少身体活动？', '产后情绪低落（baby blues）和产后抑郁症有什么不同？'],
  placeholder: '输入消息',
  send: '发送',
  stop: '停止',
  thinking: '正在思考…',
  lookingUp: '正在查找可信来源…',
  writingAnswer: '正在撰写回答…',
  waitHint: '查阅资料最多可能需要 30 秒。',
  chatError: '出了点问题，请重试。',
  sources: (n) => `${n} 个来源`,
  openSourceError: '无法打开这个来源，请重试。',
  call: (n) => `拨打 ${n}`,
  edit: '编辑',
  copy: '复制',
  editingMessage: '正在编辑消息',
  previousVersion: '上一个版本',
  nextVersion: '下一个版本',
  versionFailed: '无法显示该版本。',
};

const zhHant: PatientText = {
  openFromApp: '請在 HappyHearts 應用程式中開啟 AI 助理。',
  signInAgain: '請重新登入 HappyHearts 應用程式。',
  newConversation: '新對話',
  yourConversations: '我的對話',
  history: '歷史記錄',
  backToChat: '返回對話',
  newChat: '新對話',
  retry: '重試',
  noConversations: '還沒有對話。開始一個對話，向助理提問吧。',
  yesterday: '昨天',
  deleteConversation: (t) => `刪除「${t}」`,
  deleteTitle: '刪除這個對話？',
  deleteBody: (t) => `「${t}」將從您的清單中移除。`,
  cancel: '取消',
  delete: '刪除',
  deleting: '正在刪除…',
  listError: '無法載入您的對話。',
  openError: '無法開啟這個對話。',
  deleteError: '無法刪除這個對話。',
  emptyTitle: '今天我能幫您什麼？',
  emptySubtitle: '歡迎詢問有關懷孕或產後生活的一般問題。',
  suggestions: ['子癇前症有哪些警訊？', '懷孕期間建議做多少身體活動？', '產後情緒低落（baby blues）和產後憂鬱症有什麼不同？'],
  placeholder: '輸入訊息',
  send: '傳送',
  stop: '停止',
  thinking: '正在思考…',
  lookingUp: '正在查找可信來源…',
  writingAnswer: '正在撰寫回答…',
  waitHint: '查閱資料最多可能需要 30 秒。',
  chatError: '發生問題，請再試一次。',
  sources: (n) => `${n} 個來源`,
  openSourceError: '無法開啟這個來源，請再試一次。',
  call: (n) => `撥打 ${n}`,
  edit: '編輯',
  copy: '複製',
  editingMessage: '正在編輯訊息',
  previousVersion: '上一個版本',
  nextVersion: '下一個版本',
  versionFailed: '無法顯示該版本。',
};

const fa: PatientText = {
  openFromApp: 'دستیار هوش مصنوعی را از برنامه HappyHearts باز کنید.',
  signInAgain: 'لطفاً دوباره وارد برنامه HappyHearts شوید.',
  newConversation: 'گفتگوی جدید',
  yourConversations: 'گفتگوهای شما',
  history: 'تاریخچه',
  backToChat: 'بازگشت به گفتگو',
  newChat: 'جدید',
  retry: 'تلاش دوباره',
  noConversations: 'هنوز گفتگویی ندارید. یک گفتگو شروع کنید تا از دستیار سؤال بپرسید.',
  yesterday: 'دیروز',
  deleteConversation: (t) => `حذف ${t}`,
  deleteTitle: 'این گفتگو حذف شود؟',
  deleteBody: (t) => `«${t}» از فهرست شما حذف می‌شود.`,
  cancel: 'لغو',
  delete: 'حذف',
  deleting: 'در حال حذف…',
  listError: 'گفتگوهای شما بارگیری نشد.',
  openError: 'این گفتگو باز نشد.',
  deleteError: 'گفتگو حذف نشد.',
  emptyTitle: 'امروز چطور می‌توانم کمک کنم؟',
  emptySubtitle: 'یک پرسش کلی درباره بارداری یا زندگی پس از زایمان بپرسید.',
  suggestions: [
    'علائم هشداردهنده پره‌اکلامپسی چیست؟',
    'در دوران بارداری چه مقدار فعالیت بدنی توصیه می‌شود؟',
    'غم پس از زایمان (baby blues) با افسردگی پس از زایمان چه فرقی دارد؟',
  ],
  placeholder: 'پیامی بنویسید',
  send: 'ارسال',
  stop: 'توقف',
  thinking: 'در حال فکر کردن…',
  lookingUp: 'در حال جستجو در منابع معتبر…',
  writingAnswer: 'در حال نوشتن پاسخ…',
  waitHint: 'بررسی منابع ممکن است تا 30 ثانیه طول بکشد.',
  chatError: 'مشکلی پیش آمد. لطفاً دوباره امتحان کنید.',
  sources: (n) => `${n} منبع`,
  openSourceError: 'این منبع باز نشد. لطفاً دوباره امتحان کنید.',
  call: (n) => `تماس با ${n}`,
  edit: 'ویرایش',
  copy: 'کپی',
  editingMessage: 'در حال ویرایش پیام',
  previousVersion: 'نسخهٔ قبلی',
  nextVersion: 'نسخهٔ بعدی',
  versionFailed: 'نمایش آن نسخه ممکن نشد.',
};

/** Worded without grammatical gender where Arabic allows it. */
const ar: PatientText = {
  openFromApp: 'يُرجى فتح المساعد الذكي من تطبيق HappyHearts.',
  signInAgain: 'يُرجى تسجيل الدخول إلى تطبيق HappyHearts مرة أخرى.',
  newConversation: 'محادثة جديدة',
  yourConversations: 'محادثاتك',
  history: 'السجل',
  backToChat: 'العودة إلى المحادثة',
  newChat: 'جديدة',
  retry: 'إعادة المحاولة',
  noConversations: 'لا توجد محادثات بعد. يمكنك بدء محادثة لطرح سؤال على المساعد.',
  yesterday: 'أمس',
  deleteConversation: (t) => `حذف ${t}`,
  deleteTitle: 'حذف هذه المحادثة؟',
  deleteBody: (t) => `ستُزال «${t}» من قائمتك.`,
  cancel: 'إلغاء',
  delete: 'حذف',
  deleting: 'جارٍ الحذف…',
  listError: 'تعذّر تحميل محادثاتك.',
  openError: 'تعذّر فتح هذه المحادثة.',
  deleteError: 'تعذّر حذف المحادثة.',
  emptyTitle: 'كيف يمكنني المساعدة اليوم؟',
  emptySubtitle: 'يمكنك طرح سؤال عام عن الحمل أو الحياة بعد الولادة.',
  suggestions: [
    'ما العلامات التحذيرية لتسمّم الحمل (مقدّمات الارتعاج)؟',
    'ما مقدار النشاط البدني الموصى به أثناء الحمل؟',
    'ما الفرق بين كآبة ما بعد الولادة (baby blues) واكتئاب ما بعد الولادة؟',
  ],
  placeholder: 'اكتب رسالة',
  send: 'إرسال',
  stop: 'إيقاف',
  thinking: 'جارٍ التفكير…',
  lookingUp: 'جارٍ البحث في مصادر موثوقة…',
  writingAnswer: 'جارٍ كتابة الإجابة…',
  waitHint: 'قد يستغرق التحقق من المصادر حتى 30 ثانية.',
  chatError: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
  sources: (n) => (n === 1 ? 'مصدر واحد' : n === 2 ? 'مصدران' : n <= 10 ? `${n} مصادر` : `${n} مصدرًا`),
  openSourceError: 'تعذّر فتح هذا المصدر. يُرجى المحاولة مرة أخرى.',
  call: (n) => `الاتصال بالرقم ${n}`,
  edit: 'تعديل',
  copy: 'نسخ',
  editingMessage: 'جارٍ تعديل الرسالة',
  previousVersion: 'الإصدار السابق',
  nextVersion: 'الإصدار التالي',
  versionFailed: 'تعذّر عرض هذا الإصدار.',
};

export const PATIENT_TEXT: Record<Language, PatientText> = { en, es, vi, ko, 'zh-Hans': zhHans, 'zh-Hant': zhHant, fa, ar };

/** Locale for dates and language names (Farsi with the Gregorian calendar, as used in the US). */
export const PATIENT_LOCALE: Record<Language, string> = {
  en: 'en-US',
  es: 'es-US',
  vi: 'vi-VN',
  ko: 'ko-KR',
  'zh-Hans': 'zh-Hans-CN',
  'zh-Hant': 'zh-Hant-TW',
  fa: 'fa-u-ca-gregory',
  ar: 'ar',
};

/** Name of `code` in the patient's language ("inglés" in Spanish); the English or native name if the phone cannot say. */
export function languageNameIn(ui: Language, code: Language): string {
  try {
    const name = new Intl.DisplayNames([PATIENT_LOCALE[ui]], { type: 'language' }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) return name;
  } catch {
    // Older WebViews without Intl.DisplayNames.
  }
  return ui === code ? LANGUAGE_NAMES[code].native : LANGUAGE_NAMES[code].english;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Time for the conversation list: the hour today, "Yesterday", the weekday this week, else the date. */
export function formatListTimeIn(lang: Language, iso: string | null): string {
  if (!iso) return '';
  const locale = PATIENT_LOCALE[lang];
  const d = new Date(iso);
  const now = new Date();
  try {
    if (sameDay(d, now)) return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, yesterday)) return PATIENT_TEXT[lang].yesterday;
    if ((now.getTime() - d.getTime()) / 86_400_000 < 7) return d.toLocaleDateString(locale, { weekday: 'short' });
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  } catch {
    return d.toLocaleDateString();
  }
}
