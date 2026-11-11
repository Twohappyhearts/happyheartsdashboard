import { LANGUAGE_NAMES, type Language } from '@/lib/languages';

/**
 * Text of the patient AI chat (/m/assistant) in the app's eight languages.
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
  chatError: string;
  // Sources under an answer
  sources: (n: number) => string;
  openSourceError: string;
  // Emergency replies (911 / 988)
  call: (number: string) => string;
  alsoNotify: string;
  emergencyBanner: string;
  // Care-team confirmation sheet
  sheetTitle: string;
  sheetSubtitle: string;
  sheetLabel: string;
  sheetEmergencyLine: string;
  /** `language` is already in the patient's language, e.g. "inglés". */
  sentInLanguage: (language: string) => string;
  // Care-team card in the chat
  careteamMessage: string;
  careteamWaiting: string;
  careteamSending: string;
  careteamSent: string;
  careteamNotSent: string;
  careteamFailed: string;
  careteamLapsed: string;
  editedBeforeSending: string;
}

const en: PatientText = {
  openFromApp: 'Open the AI assistant from the HappyHearts app.',
  signInAgain: 'Please sign in to the HappyHearts app again.',
  newConversation: 'New conversation',
  yourConversations: 'Your conversations',
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
  lookingUp: 'Looking this up…',
  chatError: 'Something went wrong. Please try again.',
  sources: (n) => (n === 1 ? '1 source' : `${n} sources`),
  openSourceError: 'Could not open this source. Please try again.',
  call: (n) => `Call ${n}`,
  alsoNotify: 'Also notify my care team',
  emergencyBanner: 'If this is an emergency, call 911 now. A message to your care team does not replace 911.',
  sheetTitle: 'Send this to your care team?',
  sheetSubtitle: 'A team member will see it and follow up with you.',
  sheetLabel: 'Your message (you can edit it)',
  sheetEmergencyLine: 'If this is an emergency, call 911 now.',
  sentInLanguage: (l) => `It will be sent in ${l} so the care team can read it.`,
  careteamMessage: 'Message to the care team',
  careteamWaiting: 'Waiting for your answer…',
  careteamSending: 'Sending…',
  careteamSent: 'Sent to the care team',
  careteamNotSent: 'Not sent.',
  careteamFailed: 'The message could not be sent. Please try again later.',
  careteamLapsed: 'Care-team message not sent — the conversation moved on.',
  editedBeforeSending: 'edited before sending',
};

// Machine translation, pending research-team review.
const es: PatientText = {
  openFromApp: 'Abra el asistente de IA desde la aplicación HappyHearts.',
  signInAgain: 'Vuelva a iniciar sesión en la aplicación HappyHearts.',
  newConversation: 'Nueva conversación',
  yourConversations: 'Sus conversaciones',
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
  lookingUp: 'Buscando información…',
  chatError: 'Algo salió mal. Inténtelo de nuevo.',
  sources: (n) => (n === 1 ? '1 fuente' : `${n} fuentes`),
  openSourceError: 'No se pudo abrir esta fuente. Inténtelo de nuevo.',
  call: (n) => `Llamar al ${n}`,
  alsoNotify: 'Avisar también a mi equipo de atención',
  emergencyBanner: 'Si es una emergencia, llame al 911 ahora. Un mensaje a su equipo de atención no reemplaza al 911.',
  sheetTitle: '¿Enviar esto a su equipo de atención?',
  sheetSubtitle: 'Un miembro del equipo lo verá y se comunicará con usted.',
  sheetLabel: 'Su mensaje (puede editarlo)',
  sheetEmergencyLine: 'Si es una emergencia, llame al 911 ahora.',
  sentInLanguage: (l) => `Se enviará en ${l} para que el equipo de atención pueda leerlo.`,
  careteamMessage: 'Mensaje al equipo de atención',
  careteamWaiting: 'Esperando su respuesta…',
  careteamSending: 'Enviando…',
  careteamSent: 'Enviado al equipo de atención',
  careteamNotSent: 'No se envió.',
  careteamFailed: 'No se pudo enviar el mensaje. Inténtelo más tarde.',
  careteamLapsed: 'El mensaje al equipo de atención no se envió: la conversación siguió.',
  editedBeforeSending: 'editado antes de enviar',
};

const vi: PatientText = {
  openFromApp: 'Hãy mở trợ lý AI từ ứng dụng HappyHearts.',
  signInAgain: 'Vui lòng đăng nhập lại vào ứng dụng HappyHearts.',
  newConversation: 'Cuộc trò chuyện mới',
  yourConversations: 'Các cuộc trò chuyện của bạn',
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
  lookingUp: 'Đang tìm thông tin…',
  chatError: 'Đã xảy ra lỗi. Vui lòng thử lại.',
  sources: (n) => `${n} nguồn`,
  openSourceError: 'Không thể mở nguồn này. Vui lòng thử lại.',
  call: (n) => `Gọi ${n}`,
  alsoNotify: 'Báo thêm cho nhóm chăm sóc của tôi',
  emergencyBanner: 'Nếu đây là trường hợp khẩn cấp, hãy gọi 911 ngay. Tin nhắn gửi nhóm chăm sóc không thay thế cho việc gọi 911.',
  sheetTitle: 'Gửi tin nhắn này cho nhóm chăm sóc của bạn?',
  sheetSubtitle: 'Một thành viên trong nhóm sẽ xem và liên hệ lại với bạn.',
  sheetLabel: 'Tin nhắn của bạn (bạn có thể sửa)',
  sheetEmergencyLine: 'Nếu đây là trường hợp khẩn cấp, hãy gọi 911 ngay.',
  sentInLanguage: (l) => `Tin nhắn sẽ được gửi bằng ${l} để nhóm chăm sóc có thể đọc.`,
  careteamMessage: 'Tin nhắn gửi nhóm chăm sóc',
  careteamWaiting: 'Đang chờ bạn trả lời…',
  careteamSending: 'Đang gửi…',
  careteamSent: 'Đã gửi cho nhóm chăm sóc',
  careteamNotSent: 'Chưa gửi.',
  careteamFailed: 'Không thể gửi tin nhắn. Vui lòng thử lại sau.',
  careteamLapsed: 'Tin nhắn cho nhóm chăm sóc chưa được gửi vì cuộc trò chuyện đã tiếp tục.',
  editedBeforeSending: 'đã sửa trước khi gửi',
};

const ko: PatientText = {
  openFromApp: 'HappyHearts 앱에서 AI 도우미를 열어 주세요.',
  signInAgain: 'HappyHearts 앱에 다시 로그인해 주세요.',
  newConversation: '새 대화',
  yourConversations: '내 대화',
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
  lookingUp: '정보를 찾는 중…',
  chatError: '문제가 발생했습니다. 다시 시도해 주세요.',
  sources: (n) => `출처 ${n}개`,
  openSourceError: '이 출처를 열지 못했습니다. 다시 시도해 주세요.',
  call: (n) => `${n}에 전화하기`,
  alsoNotify: '케어팀에도 알리기',
  emergencyBanner: '응급 상황이라면 지금 바로 911에 전화하세요. 케어팀에 보내는 메시지는 911을 대신하지 않습니다.',
  sheetTitle: '이 메시지를 케어팀에 보낼까요?',
  sheetSubtitle: '팀원이 확인한 후 연락드립니다.',
  sheetLabel: '내 메시지 (수정할 수 있습니다)',
  sheetEmergencyLine: '응급 상황이라면 지금 바로 911에 전화하세요.',
  sentInLanguage: (l) => `케어팀이 읽을 수 있도록 ${l}로 보내집니다.`,
  careteamMessage: '케어팀에 보내는 메시지',
  careteamWaiting: '답변을 기다리는 중…',
  careteamSending: '보내는 중…',
  careteamSent: '케어팀에 보냈습니다',
  careteamNotSent: '보내지 않았습니다.',
  careteamFailed: '메시지를 보내지 못했습니다. 나중에 다시 시도해 주세요.',
  careteamLapsed: '대화가 이어져서 케어팀 메시지를 보내지 않았습니다.',
  editedBeforeSending: '보내기 전에 수정함',
};

const zhHans: PatientText = {
  openFromApp: '请在 HappyHearts 应用中打开 AI 助手。',
  signInAgain: '请重新登录 HappyHearts 应用。',
  newConversation: '新对话',
  yourConversations: '我的对话',
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
  lookingUp: '正在查找资料…',
  chatError: '出了点问题，请重试。',
  sources: (n) => `${n} 个来源`,
  openSourceError: '无法打开这个来源，请重试。',
  call: (n) => `拨打 ${n}`,
  alsoNotify: '同时通知我的护理团队',
  emergencyBanner: '如果是紧急情况，请立即拨打 911。发消息给护理团队不能代替拨打 911。',
  sheetTitle: '把这条消息发送给您的护理团队？',
  sheetSubtitle: '团队成员会看到并与您联系。',
  sheetLabel: '您的消息（可以修改）',
  sheetEmergencyLine: '如果是紧急情况，请立即拨打 911。',
  sentInLanguage: (l) => `这条消息将用${l}发送，方便护理团队阅读。`,
  careteamMessage: '发给护理团队的消息',
  careteamWaiting: '等待您的回答…',
  careteamSending: '正在发送…',
  careteamSent: '已发送给护理团队',
  careteamNotSent: '未发送。',
  careteamFailed: '消息无法发送，请稍后再试。',
  careteamLapsed: '对话已继续，发给护理团队的消息未发送。',
  editedBeforeSending: '发送前已修改',
};

const zhHant: PatientText = {
  openFromApp: '請在 HappyHearts 應用程式中開啟 AI 助理。',
  signInAgain: '請重新登入 HappyHearts 應用程式。',
  newConversation: '新對話',
  yourConversations: '我的對話',
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
  lookingUp: '正在查找資料…',
  chatError: '發生問題，請再試一次。',
  sources: (n) => `${n} 個來源`,
  openSourceError: '無法開啟這個來源，請再試一次。',
  call: (n) => `撥打 ${n}`,
  alsoNotify: '同時通知我的照護團隊',
  emergencyBanner: '如果是緊急情況，請立即撥打 911。傳訊息給照護團隊不能取代撥打 911。',
  sheetTitle: '要把這則訊息傳送給您的照護團隊嗎？',
  sheetSubtitle: '團隊成員會看到並與您聯絡。',
  sheetLabel: '您的訊息（可以修改）',
  sheetEmergencyLine: '如果是緊急情況，請立即撥打 911。',
  sentInLanguage: (l) => `這則訊息將以${l}傳送，方便照護團隊閱讀。`,
  careteamMessage: '給照護團隊的訊息',
  careteamWaiting: '等待您的回答…',
  careteamSending: '正在傳送…',
  careteamSent: '已傳送給照護團隊',
  careteamNotSent: '未傳送。',
  careteamFailed: '訊息無法傳送，請稍後再試。',
  careteamLapsed: '對話已繼續，給照護團隊的訊息未傳送。',
  editedBeforeSending: '傳送前已修改',
};

const fa: PatientText = {
  openFromApp: 'دستیار هوش مصنوعی را از برنامه HappyHearts باز کنید.',
  signInAgain: 'لطفاً دوباره وارد برنامه HappyHearts شوید.',
  newConversation: 'گفتگوی جدید',
  yourConversations: 'گفتگوهای شما',
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
  lookingUp: 'در حال جستجوی اطلاعات…',
  chatError: 'مشکلی پیش آمد. لطفاً دوباره امتحان کنید.',
  sources: (n) => `${n} منبع`,
  openSourceError: 'این منبع باز نشد. لطفاً دوباره امتحان کنید.',
  call: (n) => `تماس با ${n}`,
  alsoNotify: 'به تیم مراقبتم هم اطلاع بده',
  emergencyBanner: 'اگر وضعیت اضطراری است، همین حالا با 911 تماس بگیرید. پیام به تیم مراقبت جای تماس با 911 را نمی‌گیرد.',
  sheetTitle: 'این پیام برای تیم مراقبت شما ارسال شود؟',
  sheetSubtitle: 'یکی از اعضای تیم آن را می‌بیند و با شما تماس می‌گیرد.',
  sheetLabel: 'پیام شما (می‌توانید آن را ویرایش کنید)',
  sheetEmergencyLine: 'اگر وضعیت اضطراری است، همین حالا با 911 تماس بگیرید.',
  sentInLanguage: (l) => `این پیام به زبان ${l} ارسال می‌شود تا تیم مراقبت بتواند آن را بخواند.`,
  careteamMessage: 'پیام به تیم مراقبت',
  careteamWaiting: 'در انتظار پاسخ شما…',
  careteamSending: 'در حال ارسال…',
  careteamSent: 'برای تیم مراقبت ارسال شد',
  careteamNotSent: 'ارسال نشد.',
  careteamFailed: 'پیام ارسال نشد. لطفاً بعداً دوباره امتحان کنید.',
  careteamLapsed: 'پیام به تیم مراقبت ارسال نشد، چون گفتگو ادامه پیدا کرد.',
  editedBeforeSending: 'پیش از ارسال ویرایش شد',
};

/** Worded without grammatical gender where Arabic allows it. */
const ar: PatientText = {
  openFromApp: 'يُرجى فتح المساعد الذكي من تطبيق HappyHearts.',
  signInAgain: 'يُرجى تسجيل الدخول إلى تطبيق HappyHearts مرة أخرى.',
  newConversation: 'محادثة جديدة',
  yourConversations: 'محادثاتك',
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
  lookingUp: 'جارٍ البحث عن المعلومات…',
  chatError: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
  sources: (n) => (n === 1 ? 'مصدر واحد' : n === 2 ? 'مصدران' : n <= 10 ? `${n} مصادر` : `${n} مصدرًا`),
  openSourceError: 'تعذّر فتح هذا المصدر. يُرجى المحاولة مرة أخرى.',
  call: (n) => `الاتصال بالرقم ${n}`,
  alsoNotify: 'إبلاغ فريق الرعاية أيضًا',
  emergencyBanner: 'إذا كانت هذه حالة طارئة، فيُرجى الاتصال بالرقم 911 الآن. الرسالة إلى فريق الرعاية لا تغني عن الاتصال بالرقم 911.',
  sheetTitle: 'إرسال هذه الرسالة إلى فريق الرعاية؟',
  sheetSubtitle: 'سيطّلع عليها أحد أعضاء الفريق ويتواصل معك.',
  sheetLabel: 'رسالتك (يمكن تعديلها)',
  sheetEmergencyLine: 'إذا كانت هذه حالة طارئة، فيُرجى الاتصال بالرقم 911 الآن.',
  sentInLanguage: (l) => `ستُرسل الرسالة باللغة ${l} ليتمكّن فريق الرعاية من قراءتها.`,
  careteamMessage: 'رسالة إلى فريق الرعاية',
  careteamWaiting: 'في انتظار إجابتك…',
  careteamSending: 'جارٍ الإرسال…',
  careteamSent: 'أُرسلت إلى فريق الرعاية',
  careteamNotSent: 'لم تُرسل.',
  careteamFailed: 'تعذّر إرسال الرسالة. يُرجى المحاولة لاحقًا.',
  careteamLapsed: 'لم تُرسل الرسالة إلى فريق الرعاية لأن المحادثة استمرت.',
  editedBeforeSending: 'عُدّلت قبل الإرسال',
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
