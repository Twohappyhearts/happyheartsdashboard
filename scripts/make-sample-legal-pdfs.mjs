#!/usr/bin/env node
/**
 * Writes the built-in SAMPLE legal documents the dashboard serves until an admin uploads
 * the real ones (Legal Documents page):
 *   public/legal/sample-terms.pdf    (/legal/terms falls back to it)
 *   public/legal/sample-privacy.pdf  (/legal/privacy falls back to it)
 *
 *   node scripts/make-sample-legal-pdfs.mjs
 *
 * The text is placeholder wording by the student development team. Every page carries the
 * banner "SAMPLE – not reviewed by the research team or UCI" and a SAMPLE watermark, so the
 * files cannot be mistaken for the study's real terms. No dependencies: the PDF is written
 * by hand with the standard Helvetica fonts, and the output is the same on every run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'legal');

const BANNER = 'SAMPLE – not reviewed by the research team or UCI';
const NOTE =
  'This is a placeholder written by the student development team so the app has something to link to. ' +
  'It has not been reviewed by the research team, UCI, or a lawyer. It is not a legal agreement and does not ' +
  'describe the final terms. The research team will replace it with the real document.';

// ---- Documents ---------------------------------------------------------------------------------

const TERMS = {
  file: 'sample-terms.pdf',
  title: 'Happy Hearts App – Terms of Use',
  blocks: [
    ['h', '1. What the app is for'],
    [
      'p',
      'The Happy Hearts app is part of a research study on heart health for women who are pregnant or have recently ' +
        'given birth. It offers short lessons, surveys, a way to message the study team, and an AI assistant that ' +
        'answers general questions.',
    ],
    ['h', '2. Not medical advice'],
    [
      'p',
      'The lessons and the AI assistant give general health information only. They do not diagnose or treat any ' +
        'condition and do not replace care from your doctor, nurse, or midwife. Ask your own health care provider ' +
        'about your health, your medicines, and your pregnancy.',
    ],
    ['h', '3. In an emergency, call 911'],
    [
      'p',
      'Do not use the app for emergencies. Messages to the study team and questions to the AI assistant are not ' +
        'watched around the clock.',
    ],
    ['li', 'If you think you or your baby may be in danger, call 911 or go to the nearest emergency room.'],
    ['li', 'If you are thinking about hurting yourself, call or text 988 (Suicide & Crisis Lifeline).'],
    ['h', '4. The AI assistant'],
    [
      'p',
      'Answers are written by a computer program that uses a reviewed knowledge base and a list of trusted health ' +
        'websites. Answers can be wrong, incomplete, or out of date. Check anything important with your care team. ' +
        'Do not type your full name, address, or other details that identify you.',
    ],
    ['h', '5. Your information'],
    [
      'p',
      'How the app collects and uses information is described in the Privacy Policy (in the app: Profile, then ' +
        'Privacy Policy). [Placeholder: the research team will confirm the final wording.]',
    ],
    ['h', '6. Taking part'],
    [
      'p',
      'Using the app is part of the study you agreed to join. You can stop using it at any time. The consent form ' +
        'for the study explains your rights as a participant.',
    ],
    ['h', '7. Changes to these terms'],
    [
      'p',
      'When a new version of these terms is posted, the app asks you to read and accept it again before you use ' +
        'the AI assistant.',
    ],
    ['h', '8. Contact'],
    ['p', 'Questions about these terms: [contact details to be added by the research team].'],
  ],
};

const PRIVACY = {
  file: 'sample-privacy.pdf',
  title: 'Happy Hearts App – Privacy Policy',
  blocks: [
    ['h', '1. Who runs the app'],
    [
      'p',
      'The app is run by the team of the Happy Hearts research study. [Name and contact details of the responsible ' +
        'team to be added by the research team.]',
    ],
    ['h', '2. What the app collects'],
    ['li', 'The username and display name the study team set up for you.'],
    ['li', 'Which lessons you open and finish, and which surveys you complete.'],
    ['li', 'Messages you send to the study team, and requests for help.'],
    ['li', 'Questions you ask the AI assistant, and its answers.'],
    ['li', 'The app language you choose.'],
    ['h', '3. Surveys'],
    [
      'p',
      'Survey answers are entered in REDCap, the study’s survey system, and handled under the study’s own ' +
        'procedures. The app only shows the survey page.',
    ],
    ['h', '4. How the information is used'],
    [
      'p',
      'To run the study, to answer your messages and requests for help, and to improve the lessons and the app. ' +
        '[The final list is to be confirmed by the research team.]',
    ],
    ['h', '5. The AI assistant'],
    [
      'p',
      'Your questions are sent to an AI service that writes the answers. Please do not include your name, address, ' +
        'or other details that identify you. [The service provider and how long it keeps data are to be confirmed.]',
    ],
    ['h', '6. Who can see your information'],
    [
      'p',
      'The study team, and the companies that host the app and its data, only as needed to run them. ' +
        '[To be confirmed by the research team.]',
    ],
    ['h', '7. How long it is kept'],
    ['p', '[To be decided by the research team.]'],
    ['h', '8. Your choices'],
    ['p', 'You can stop using the app at any time. To ask about your information, contact the study team.'],
    ['h', '9. Contact'],
    ['p', '[Contact details to be added by the research team.]'],
  ],
};

// ---- Fonts (standard 14, WinAnsiEncoding) -----------------------------------------------------

// Advance widths (1/1000 em) for character codes 32–126, from the Adobe AFM files.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
  556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
  556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
  500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722,
  611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556,
  611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778,
  556, 556, 500, 389, 280, 389, 584,
];
// Characters outside ASCII that the text uses: WinAnsi code and width (regular, bold).
const EXTRA = {
  '–': [0x96, 556, 556],
  '—': [0x97, 1000, 1000],
  '’': [0x92, 222, 278],
  '‘': [0x91, 222, 278],
  '“': [0x93, 333, 500],
  '”': [0x94, 333, 500],
  '•': [0x95, 350, 350],
  '·': [0xb7, 278, 278],
};

const FONTS = {
  regular: { res: 'F1', base: 'Helvetica', widths: HELVETICA, bold: false },
  bold: { res: 'F2', base: 'Helvetica-Bold', widths: HELVETICA_BOLD, bold: true },
  italic: { res: 'F3', base: 'Helvetica-Oblique', widths: HELVETICA, bold: false },
};

function charWidth(ch, font) {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return font.widths[code - 32];
  const extra = EXTRA[ch];
  if (!extra) throw new Error(`Character not supported in the sample PDFs: ${JSON.stringify(ch)}`);
  return font.bold ? extra[2] : extra[1];
}

const textWidth = (text, font, size) => ([...text].reduce((w, ch) => w + charWidth(ch, font), 0) * size) / 1000;

/** A PDF string literal in WinAnsi, with non-ASCII bytes as octal escapes. */
function pdfString(text) {
  let out = '(';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (code >= 32 && code <= 126) out += ch;
    else if (EXTRA[ch]) out += `\\${EXTRA[ch][0].toString(8)}`;
    else throw new Error(`Character not supported in the sample PDFs: ${JSON.stringify(ch)}`);
  }
  return `${out})`;
}

function wrap(text, font, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, font, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---- Layout ------------------------------------------------------------------------------------

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 72;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const TOP = PAGE_H - 108; // below the banner
const BOTTOM = 90; // above the footer

const RED = '0.75 0.11 0.15';
const GRAY = '0.38 0.38 0.40';
const INK = '0.10 0.10 0.12';

function text(font, size, color, x, y, s) {
  return `BT /${font.res} ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(s)} Tj ET`;
}

/** The parts every page has: watermark, banner at the top, footer. */
function pageFrame(pageNo, pageCount) {
  const ops = [];
  // Diagonal watermark behind the text.
  ops.push(
    `q 0.97 0.85 0.86 rg BT /F2 120 Tf 0.7071 0.7071 -0.7071 0.7071 150 215 Tm ${pdfString('SAMPLE')} Tj ET Q`
  );
  // Red banner.
  ops.push(`q ${RED} rg ${MARGIN - 12} ${PAGE_H - 78} ${CONTENT_W + 24} 34 re f Q`);
  const bannerSize = 13;
  const bw = textWidth(BANNER, FONTS.bold, bannerSize);
  ops.push(text(FONTS.bold, bannerSize, '1 1 1', (PAGE_W - bw) / 2, PAGE_H - 66, BANNER));
  // Footer.
  ops.push(`q ${RED} RG 0.8 w ${MARGIN} 62 m ${PAGE_W - MARGIN} 62 l S Q`);
  ops.push(text(FONTS.bold, 8.5, RED, MARGIN, 48, BANNER));
  const pageLabel = `Placeholder text, not a legal agreement · Page ${pageNo} of ${pageCount}`;
  ops.push(text(FONTS.regular, 8.5, GRAY, PAGE_W - MARGIN - textWidth(pageLabel, FONTS.regular, 8.5), 48, pageLabel));
  return ops;
}

/** Lays out the document into pages of content operators (frames are added afterwards). */
function layout(doc) {
  const pages = [[]];
  let y = TOP;
  const page = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push([]);
    y = TOP;
  };
  const ensure = (h) => {
    if (y - h < BOTTOM) newPage();
  };

  // Title and the note under it.
  for (const line of wrap(doc.title, FONTS.bold, 20, CONTENT_W)) {
    page().push(text(FONTS.bold, 20, INK, MARGIN, y, line));
    y -= 26;
  }
  page().push(text(FONTS.regular, 10, GRAY, MARGIN, y, 'Sample document · placeholder wording · November 2026'));
  y -= 26;

  const noteLines = wrap(NOTE, FONTS.italic, 10, CONTENT_W - 24);
  const noteH = noteLines.length * 14 + 16;
  page().push(`q 1 0.95 0.95 rg ${RED} RG 1 w ${MARGIN} ${y - noteH + 12} ${CONTENT_W} ${noteH} re B Q`);
  let ny = y;
  for (const line of noteLines) {
    page().push(text(FONTS.italic, 10, RED, MARGIN + 12, ny - 6, line));
    ny -= 14;
  }
  y -= noteH + 14;

  for (const [kind, body] of doc.blocks) {
    if (kind === 'h') {
      ensure(18 + 3 * 15); // keep a heading with the start of its section
      y -= 6;
      page().push(text(FONTS.bold, 12.5, INK, MARGIN, y, body));
      y -= 19;
    } else if (kind === 'p') {
      for (const line of wrap(body, FONTS.regular, 10.5, CONTENT_W)) {
        ensure(15);
        page().push(text(FONTS.regular, 10.5, INK, MARGIN, y, line));
        y -= 15;
      }
      y -= 6;
    } else if (kind === 'li') {
      const lines = wrap(body, FONTS.regular, 10.5, CONTENT_W - 16);
      lines.forEach((line, i) => {
        ensure(15);
        if (i === 0) page().push(text(FONTS.regular, 10.5, INK, MARGIN + 2, y, '•'));
        page().push(text(FONTS.regular, 10.5, INK, MARGIN + 16, y, line));
        y -= 15;
      });
      y -= 3;
    } else {
      throw new Error(`Unknown block ${kind}`);
    }
  }
  return pages;
}

// ---- PDF writer ----------------------------------------------------------------------------------

function buildPdf(doc) {
  const contentPages = layout(doc);
  const n = contentPages.length;
  // Objects: 1 catalog, 2 pages, 3–5 fonts, 6 info, then (page, content) pairs.
  const objects = [];
  const firstPage = 7;
  const kids = contentPages.map((_, i) => `${firstPage + 2 * i} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS.regular.base} /Encoding /WinAnsiEncoding >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS.bold.base} /Encoding /WinAnsiEncoding >>`;
  objects[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS.italic.base} /Encoding /WinAnsiEncoding >>`;
  objects[6] =
    `<< /Title ${pdfString(`${doc.title} (SAMPLE, not reviewed)`)} /Subject ${pdfString(BANNER)} ` +
    `/Producer ${pdfString('happyheartsdash scripts/make-sample-legal-pdfs.mjs')} >>`;
  contentPages.forEach((ops, i) => {
    const stream = [...pageFrame(i + 1, n), ...ops].join('\n');
    const pageObj = firstPage + 2 * i;
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageObj + 1} 0 R >>`;
    objects[pageObj + 1] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });

  const chunks = ['%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'];
  let offset = Buffer.byteLength(chunks[0], 'latin1');
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    const body = `${id} 0 obj\n${objects[id]}\nendobj\n`;
    offsets[id] = offset;
    chunks.push(body);
    offset += Buffer.byteLength(body, 'latin1');
  }
  const xref = [`xref\n0 ${objects.length}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id < objects.length; id++) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  chunks.push(xref.join(''));
  chunks.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${offset}\n%%EOF\n`);
  return { bytes: Buffer.from(chunks.join(''), 'latin1'), pages: n };
}

mkdirSync(OUT_DIR, { recursive: true });
for (const doc of [TERMS, PRIVACY]) {
  const { bytes, pages } = buildPdf(doc);
  writeFileSync(join(OUT_DIR, doc.file), bytes);
  console.log(`public/legal/${doc.file}: ${pages} page${pages === 1 ? '' : 's'}, ${bytes.length} bytes`);
}
