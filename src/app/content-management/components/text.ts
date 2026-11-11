/**
 * Staff-facing text added to the Content page in Nov 2026 (uploads, Materials, confirmations),
 * kept in one place for the English / Spanish dashboard translation (WS-D).
 */
export const CONTENT_TEXT = {
  // Thumbnail / infographic
  thumbnailLabel: 'Thumbnail',
  thumbnailNote: 'card image in app',
  infographicLabel: 'Infographic',
  infographicNote: 'optional',
  imageHint: 'Upload a JPG, PNG or WebP image (50 MB at most), or paste a link to a public image (e.g. Cloudinary).',
  uploadImage: 'Upload image',
  uploadingImage: 'Uploading…',
  notKnownHost: 'Not an uploaded image or a Cloudinary link — it will still work if the image is public.',
  uploadedOk: 'Image uploaded',

  // Materials
  materialsTitle: 'Materials',
  materialsHint:
    'Images (JPG, PNG, WebP) or PDF documents patients can open from the lesson in the app. Up to 20 files, 50 MB each. For videos, use a YouTube link in Video URL.',
  materialsEmpty: 'No materials yet.',
  uploadFiles: 'Upload files',
  uploading: 'Uploading…',
  materialName: (i: number) => `Material ${i + 1} name`,
  materialNamePlaceholder: 'Name patients see',
  open: 'Open',
  remove: 'Remove',
  kindLabel: { image: 'Image', pdf: 'PDF' },
  limitReached: 'You can add at most 20 materials.',
  roomLeft: (n: number) => `Only ${n} more file${n === 1 ? '' : 's'} fit (20 at most); the rest were skipped.`,
  waitForUploads: 'Wait until the uploads finish.',

  // Discard / hide confirmations
  hideTitle: 'Hide from patients?',
  hideBody: (title: string) => `Patients will stop seeing “${title}” in the app right away. You can turn it back on at any time.`,
  hideConfirm: 'Hide from app',
  cancel: 'Cancel',
};
