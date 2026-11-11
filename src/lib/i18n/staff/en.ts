/**
 * English text of the staff dashboard, grouped by page.
 *
 * es.ts is typed as StaffText, so `tsc --noEmit` fails when a key is missing from it or it has
 * a key English does not. Not translated: content staff enter (lesson titles, scripts, survey
 * names), patient messages, AI answers, and the patient chat (/m/assistant, src/lib/i18n/patient*).
 */
export const en = {
  meta: {
    title: 'HappyHearts — Patient Engagement Dashboard',
    description:
      'Clinical staff dashboard for managing patient education content, surveys, help request alerts, and engagement analytics for the HappyHearts mobile app.',
  },

  /** Words used on many pages. */
  common: {
    save: 'Save',
    saving: 'Saving…',
    saveChanges: 'Save changes',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    deleting: 'Deleting…',
    edit: 'Edit',
    remove: 'Remove',
    add: 'Add',
    apply: 'Apply',
    retry: 'Retry',
    tryAgain: 'Try again',
    refresh: 'Refresh',
    search: 'Search',
    loading: 'Loading…',
    open: 'Open',
    yes: 'Yes',
    no: 'No',
    all: 'All',
    none: 'None',
    active: 'Active',
    inactive: 'Inactive',
    unknown: 'Unknown',
    someone: 'a team member',
    optional: 'optional',
    required: 'required',
    networkError: 'Network error. Check your connection and try again.',
    requestFailed: (status: number) => `Request failed (${status}).`,
    noStaffPermission: 'Your account does not have staff permission for this.',
    somethingWrong: 'Something went wrong. Please try again.',
  },

  /** The English / Español switch in the top bar. */
  language: {
    label: 'Dashboard language',
    note: 'Spanish text is a machine translation, pending research-team review.',
  },

  nav: {
    groups: {
      patientCare: 'PATIENT CARE',
      insights: 'INSIGHTS',
      aiAssistant: 'AI ASSISTANT',
      admin: 'ADMIN',
    },
    messages: 'Messages',
    content: 'Content',
    surveys: 'Surveys',
    alerts: 'Alerts',
    analytics: 'Analytics',
    aiNotice: 'AI Notice',
    aiChat: 'AI Chat',
    knowledgeBase: 'Knowledge Base',
    trustedWebsites: 'Trusted Websites',
    users: 'Users',
    settings: 'Settings',
    legalDocuments: 'Legal Documents',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
    collapse: 'Collapse',
    signOut: 'Sign Out',
  },

  topbar: {
    brand: 'HappyHearts Admin',
    openAlerts: (n: number) => `${n} open alert${n === 1 ? '' : 's'}`,
    noOpenAlerts: 'No open alerts',
    roleAdmin: 'Admin',
    roleStaff: 'Staff',
  },

  layout: {
    staffOnlyTitle: 'Staff access only',
    staffOnlyBody: (email: string) => `${email} is not an active staff account. Ask an admin to grant the staff role.`,
    signOut: 'Sign out',
  },

  /** Sign-in errors (AuthContext). */
  auth: {
    wrongPassword: 'Incorrect email or password.',
    patientAccount: 'This is a patient account. Only research staff can use the dashboard.',
    inactiveAccount: 'This staff account is not active. Ask an admin to enable it.',
    samePassword: 'Choose a password different from the temporary one.',
    passwordChangedNotSaved: 'Password changed, but the account could not be updated. Please refresh.',
  },

  login: {
    platform: 'Patient Engagement Platform',
    headline1: 'Supporting patients',
    headline2: 'between clinic visits.',
    intro:
      'Manage educational content, track patient engagement, respond to help requests, and monitor survey participation — all from one dashboard.',
    statPatients: 'Active Patients',
    statSessions: 'Content Sessions',
    statCompletion: 'Completion Rate',
    footer: '© 2026 HappyHearts · UCI Health Equity Nursing · Secure Staff Portal',
    title: 'Staff sign in',
    subtitle: 'Access the HappyHearts clinical dashboard',
    email: 'Email address',
    emailRequired: 'Email is required',
    emailInvalid: 'Enter a valid email address',
    password: 'Password',
    passwordRequired: 'Password is required',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    signingIn: 'Signing in…',
    submit: 'Sign In to Dashboard',
    signedIn: 'Signed in',
    unreachable: 'Could not reach the server. Check your connection and try again.',
    staffOnly: 'Staff-only access · Accounts are provisioned by an admin in Supabase',
  },

  /** Full-page step for an account with a temporary password. */
  changePassword: {
    title: 'Set a new password',
    body: (email: string) => `${email} is using a temporary password. Choose your own to continue.`,
    newPassword: 'New password',
    confirmPassword: 'Confirm password',
    mismatch: 'Passwords do not match',
    submit: 'Save password',
    updated: 'Password updated',
    failed: 'Could not update your password.',
    signOut: 'Sign out',
  },

  /** Password field and rules (Add user, Reset password, Set a new password). */
  password: {
    show: 'Show',
    hide: 'Hide',
    generate: 'Generate',
    generateHint: 'Generate a strong temporary password',
    strength: ['', 'Weak', 'Fair', 'Good', 'Strong'] as string[],
    tooShort: 'At least 8 characters.',
    tooLong: 'At most 72 characters.',
    needsMix: 'Needs an uppercase letter, a lowercase letter, and a number.',
  },

  notFound: {
    title: 'Page Not Found',
    body: 'The page you’re looking for doesn’t exist. Let’s get you back!',
    back: 'Go Back',
    home: 'Back to Home',
  },

  /** Shared dialogs and panels. */
  dialog: {
    closeModal: 'Close dialog',
  },

  /** "Discard changes?" prompt of a slide-over panel with unsaved changes. */
  discard: {
    title: 'Discard changes?',
    body: 'You have changes that are not saved. If you close this panel, they will be lost.',
    keep: 'Keep editing',
    discard: 'Discard changes',
    closePanel: 'Close panel',
  },

  /** Toast when a participant sends a new assistance request (any page). */
  alertToast: {
    title: 'New assistance request',
    view: 'View',
  },

  /** Rich-text editor toolbar (lesson scripts). */
  editor: {
    bold: 'Bold (⌘B)',
    italic: 'Italic (⌘I)',
    underline: 'Underline (⌘U)',
    strike: 'Strikethrough',
    textColor: 'Text color',
    colors: {
      default: 'Default',
      pink: 'Brand pink',
      red: 'Red',
      orange: 'Orange',
      green: 'Green',
      blue: 'Blue',
      purple: 'Purple',
      gray: 'Gray',
    },
    bulleted: 'Bulleted list',
    numbered: 'Numbered list',
    link: 'Link',
    undo: 'Undo (⌘Z)',
    redo: 'Redo (⇧⌘Z)',
    linkInvalid: 'Links must start with https://, http://, mailto: or tel:',
    apply: 'Apply',
    remove: 'Remove',
    cancel: 'Cancel',
  },
};

export type StaffText = typeof en;
