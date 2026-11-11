import type { StaffText } from './en';

/**
 * Spanish text of the staff dashboard (neutral Latin American Spanish, "usted").
 *
 * Machine translation, pending research-team review.
 *
 * Same keys as en.ts: typed as StaffText, so `tsc --noEmit` fails on a missing or extra key.
 * Terms used throughout: Knowledge Base = "Base de conocimientos", Trusted Websites = "Sitios web
 * confiables", AI assistant = "asistente de IA", research team = "equipo de investigación",
 * care team = "equipo de atención", lesson = "lección", chunk = "fragmento", alert = "alerta".
 */
export const es: StaffText = {
  meta: {
    title: 'HappyHearts — Panel de participación de pacientes',
    description:
      'Panel para el personal clínico: contenido educativo para pacientes, encuestas, alertas de solicitudes de ayuda y analítica de uso de la app móvil HappyHearts.',
  },

  common: {
    save: 'Guardar',
    saving: 'Guardando…',
    saveChanges: 'Guardar cambios',
    cancel: 'Cancelar',
    close: 'Cerrar',
    delete: 'Eliminar',
    deleting: 'Eliminando…',
    edit: 'Editar',
    remove: 'Quitar',
    add: 'Agregar',
    apply: 'Aplicar',
    retry: 'Reintentar',
    tryAgain: 'Intentar de nuevo',
    refresh: 'Actualizar',
    search: 'Buscar',
    loading: 'Cargando…',
    open: 'Abrir',
    yes: 'Sí',
    no: 'No',
    all: 'Todos',
    none: 'Ninguno',
    active: 'Activo',
    inactive: 'Inactivo',
    unknown: 'Desconocido',
    someone: 'un miembro del equipo',
    optional: 'opcional',
    required: 'obligatorio',
    networkError: 'Error de red. Revise su conexión e intente de nuevo.',
    requestFailed: (status) => `La solicitud falló (${status}).`,
    noStaffPermission: 'Su cuenta no tiene permiso de personal para hacer esto.',
    somethingWrong: 'Algo salió mal. Intente de nuevo.',
  },

  language: {
    label: 'Idioma del panel',
    note: 'El texto en español es una traducción automática, pendiente de revisión por el equipo de investigación.',
  },

  nav: {
    groups: {
      patientCare: 'ATENCIÓN AL PACIENTE',
      insights: 'INFORMACIÓN',
      aiAssistant: 'ASISTENTE DE IA',
      admin: 'ADMINISTRACIÓN',
    },
    messages: 'Mensajes',
    content: 'Contenido',
    surveys: 'Encuestas',
    alerts: 'Alertas',
    analytics: 'Analítica',
    aiNotice: 'Aviso de IA',
    aiChat: 'Chat de IA',
    knowledgeBase: 'Base de conocimientos',
    trustedWebsites: 'Sitios web confiables',
    users: 'Usuarios',
    settings: 'Configuración',
    legalDocuments: 'Documentos legales',
    expandSidebar: 'Expandir barra lateral',
    collapseSidebar: 'Contraer barra lateral',
    collapse: 'Contraer',
    signOut: 'Cerrar sesión',
  },

  topbar: {
    brand: 'HappyHearts · Administración',
    openAlerts: (n) => `${n} alerta${n === 1 ? '' : 's'} abierta${n === 1 ? '' : 's'}`,
    noOpenAlerts: 'No hay alertas abiertas',
    roleAdmin: 'Administrador',
    roleStaff: 'Personal',
  },

  layout: {
    staffOnlyTitle: 'Acceso solo para el personal',
    staffOnlyBody: (email) =>
      `${email} no es una cuenta de personal activa. Pida a un administrador que le asigne el rol de personal.`,
    signOut: 'Cerrar sesión',
  },

  auth: {
    wrongPassword: 'Correo electrónico o contraseña incorrectos.',
    patientAccount: 'Esta es una cuenta de paciente. Solo el personal de investigación puede usar el panel.',
    inactiveAccount: 'Esta cuenta de personal no está activa. Pida a un administrador que la active.',
    samePassword: 'Elija una contraseña distinta de la temporal.',
    passwordChangedNotSaved: 'Se cambió la contraseña, pero no se pudo actualizar la cuenta. Actualice la página.',
  },

  login: {
    platform: 'Plataforma de participación de pacientes',
    headline1: 'Apoyo a pacientes',
    headline2: 'entre consultas.',
    intro:
      'Administre el contenido educativo, siga la participación de pacientes, responda a solicitudes de ayuda y supervise la participación en encuestas, todo desde un mismo panel.',
    statPatients: 'Pacientes activos',
    statSessions: 'Sesiones de contenido',
    statCompletion: 'Tasa de finalización',
    footer: '© 2026 HappyHearts · UCI Health Equity Nursing · Portal seguro para el personal',
    title: 'Inicio de sesión del personal',
    subtitle: 'Acceda al panel clínico de HappyHearts',
    email: 'Correo electrónico',
    emailRequired: 'El correo electrónico es obligatorio',
    emailInvalid: 'Escriba un correo electrónico válido',
    password: 'Contraseña',
    passwordRequired: 'La contraseña es obligatoria',
    showPassword: 'Mostrar contraseña',
    hidePassword: 'Ocultar contraseña',
    signingIn: 'Iniciando sesión…',
    submit: 'Entrar al panel',
    signedIn: 'Sesión iniciada',
    unreachable: 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.',
    staffOnly: 'Acceso solo para el personal · Un administrador crea las cuentas en Supabase',
  },

  changePassword: {
    title: 'Establezca una contraseña nueva',
    body: (email) => `${email} está usando una contraseña temporal. Elija la suya para continuar.`,
    newPassword: 'Contraseña nueva',
    confirmPassword: 'Confirme la contraseña',
    mismatch: 'Las contraseñas no coinciden',
    submit: 'Guardar contraseña',
    updated: 'Contraseña actualizada',
    failed: 'No se pudo actualizar su contraseña.',
    signOut: 'Cerrar sesión',
  },

  password: {
    show: 'Mostrar',
    hide: 'Ocultar',
    generate: 'Generar',
    generateHint: 'Generar una contraseña temporal segura',
    strength: ['', 'Débil', 'Aceptable', 'Buena', 'Fuerte'],
    tooShort: 'Al menos 8 caracteres.',
    tooLong: 'Como máximo 72 caracteres.',
    needsMix: 'Debe tener una letra mayúscula, una minúscula y un número.',
  },

  notFound: {
    title: 'Página no encontrada',
    body: 'La página que busca no existe. ¡Le ayudamos a volver!',
    back: 'Volver',
    home: 'Ir al inicio',
  },

  dialog: {
    closeModal: 'Cerrar ventana',
  },

  discard: {
    title: '¿Descartar los cambios?',
    body: 'Tiene cambios sin guardar. Si cierra este panel, se perderán.',
    keep: 'Seguir editando',
    discard: 'Descartar cambios',
    closePanel: 'Cerrar panel',
  },

  alertToast: {
    title: 'Nueva solicitud de ayuda',
    view: 'Ver',
  },

  editor: {
    bold: 'Negrita (⌘B)',
    italic: 'Cursiva (⌘I)',
    underline: 'Subrayado (⌘U)',
    strike: 'Tachado',
    textColor: 'Color del texto',
    colors: {
      default: 'Predeterminado',
      pink: 'Rosa de la marca',
      red: 'Rojo',
      orange: 'Naranja',
      green: 'Verde',
      blue: 'Azul',
      purple: 'Morado',
      gray: 'Gris',
    },
    bulleted: 'Lista con viñetas',
    numbered: 'Lista numerada',
    link: 'Enlace',
    undo: 'Deshacer (⌘Z)',
    redo: 'Rehacer (⇧⌘Z)',
    linkInvalid: 'Los enlaces deben empezar con https://, http://, mailto: o tel:',
    apply: 'Aplicar',
    remove: 'Quitar',
    cancel: 'Cancelar',
  },
};
