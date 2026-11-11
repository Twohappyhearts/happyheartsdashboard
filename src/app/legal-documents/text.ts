/**
 * Staff-facing text of the Legal Documents page, kept in one place for the
 * English / Spanish dashboard translation (WS-D).
 */
export const LEGAL_TEXT = {
  pageTitle: 'Legal Documents',
  pageSubtitle: 'The Terms of Use and Privacy Policy that patients open from the app and the AI notice.',
  intro:
    'Upload each new version as a PDF (10 MB or smaller). The newest version is the one patients see; older versions stay listed below.',
  adminOnlyTitle: 'Admins only',
  adminOnlyBody: 'Only an Admin account can upload the Terms of Use and the Privacy Policy.',

  kinds: {
    terms: {
      title: 'Terms of Use',
      description: 'Linked from the AI notice, the app’s Profile page and the sign-up page.',
    },
    privacy: {
      title: 'Privacy Policy',
      description: 'Linked from the app’s Profile page and the sign-up page.',
    },
  },

  currentVersion: (n: number) => `Version ${n}`,
  sampleBadge: 'Sample',
  noneUploaded: 'Nothing uploaded yet. Patients see the built-in sample, marked “SAMPLE – not reviewed” on every page.',
  openSample: 'Open the sample',
  openFile: 'Open PDF',
  uploadedOn: (when: string, who: string) => `Uploaded ${when} by ${who}`,
  someone: 'a team member',
  publicLink: 'Link used by the app',
  publicLinkHint: 'Always opens the current version. Works without signing in.',
  copy: 'Copy link',
  copied: 'Link copied',
  copyFailed: 'Could not copy. Select the link and copy it by hand.',
  upload: 'Upload new version',
  uploading: 'Uploading…',
  history: 'Version history',
  noHistory: 'No versions uploaded yet.',
  historyColumns: { version: 'Version', file: 'File', uploaded: 'Uploaded' },

  termsConfirmTitle: 'Upload a new Terms of Use?',
  termsConfirmBody:
    'Every patient will be asked to read and accept the AI notice again the next time they open the AI assistant.',
  termsConfirmFile: (name: string) => `File: ${name}`,
  termsConfirmButton: 'Upload and ask everyone again',
  cancel: 'Cancel',

  uploadedToast: (title: string, n: number) => `${title} version ${n} is now live`,
  uploadedTermsToast: 'Patients will be asked to accept the AI notice again.',

  errors: {
    load: 'Could not load the legal documents.',
    retry: 'Try again',
    notPdf: 'Choose a PDF file.',
    tooLarge: 'The PDF must be 10 MB or smaller.',
    empty: 'The file is empty.',
    upload: 'Could not upload the file. Check your connection and try again.',
  },
};
