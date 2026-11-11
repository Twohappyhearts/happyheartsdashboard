/**
 * Staff-facing text of the Settings page, kept in one place for the
 * English / Spanish dashboard translation (WS-D).
 */
export const SETTINGS_TEXT = {
  pageTitle: 'Settings',
  pageSubtitle: 'Choices the research team makes for the whole study.',

  languages: {
    title: 'Languages the research team reads in patient messages',
    body:
      'When a patient writes to the research team (Research Team chat or Need Help) in a language that is not ' +
      'checked here, the app shows a notice that the team reads only these languages. The patient can still send ' +
      'the message or change it first.',
    aiBody:
      'Messages the AI assistant drafts for a patient to send to the care team are written in the language chosen ' +
      'below (the first language on this list).',
    note: 'This does not change the language the AI assistant answers in.',
    checkboxesLabel: 'Accepted languages',
    primaryLabel: 'AI-drafted messages are written in',
    atLeastOne: 'Choose at least one language.',
  },

  save: 'Save',
  saving: 'Saving…',
  reset: 'Undo changes',
  saved: 'Settings saved',
  lastChanged: (when: string, who: string) => `Last changed ${when} by ${who}`,
  notChangedYet: 'Not changed on the dashboard yet.',
  someone: 'a team member',
  loadError: 'Could not load the settings.',
  saveError: 'Could not save the settings. Check your connection and try again.',
  retry: 'Try again',
};
