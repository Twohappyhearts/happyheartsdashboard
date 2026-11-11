'use client';

import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Icon from '@/components/ui/AppIcon';
import { useStaffT } from '@/lib/i18n/staff/context';
import type { StaffText } from '@/lib/i18n/staff';

/**
 * Rich text editor for session scripts (Prompt 3): bold, italic, underline,
 * strikethrough, text color, bulleted and numbered lists, and links.
 * Stores HTML. Only the formats above are kept — anything else pasted in
 * (headings, scripts, images, styles) is dropped by the editor schema.
 */

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  invalid?: boolean;
}

const COLORS: { label: keyof StaffText['editor']['colors']; value: string | null }[] = [
  { label: 'default', value: null },
  { label: 'pink', value: '#E05C6B' },
  { label: 'red', value: '#DC2626' },
  { label: 'orange', value: '#EA580C' },
  { label: 'green', value: '#16A34A' },
  { label: 'blue', value: '#2563EB' },
  { label: 'purple', value: '#7C3AED' },
  { label: 'gray', value: '#6B7280' },
];

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;

/** An empty editor serializes to <p></p>; store that as ''. */
function normalize(html: string) {
  return html.replace(/<p><\/p>/g, '').trim() === '' ? '' : html;
}

export default function RichTextEditor({ value, onChange, placeholder, invalid }: RichTextEditorProps) {
  const T = useStaffT().t.editor;
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false, // Next.js: render on the client only
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          protocols: ['http', 'https', 'mailto', 'tel'],
          isAllowedUri: (url) => SAFE_LINK.test(url),
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      TextStyle,
      Color,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[160px] px-3 py-2.5 text-[13px] text-foreground focus:outline-none ' +
          'prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-a:text-primary',
      },
    },
    onUpdate: ({ editor: e }) => onChange(normalize(e.getHTML())),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }: { editor: Editor | null }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      underline: e?.isActive('underline') ?? false,
      strike: e?.isActive('strike') ?? false,
      bullet: e?.isActive('bulletList') ?? false,
      ordered: e?.isActive('orderedList') ?? false,
      link: e?.isActive('link') ?? false,
      color: (e?.getAttributes('textStyle').color as string | undefined) ?? null,
      empty: e?.isEmpty ?? true,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  // Close the color menu when clicking elsewhere.
  useEffect(() => {
    if (!colorOpen) return;
    const onDown = (ev: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(ev.target as Node)) setColorOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [colorOpen]);

  if (!editor || !state) {
    return <div className="min-h-[204px] border border-border rounded-lg bg-background animate-pulse" />;
  }

  const openLink = () => {
    const current = (editor.getAttributes('link').href as string | undefined) ?? '';
    setLinkUrl(current);
    setLinkError(null);
    setLinkOpen(true);
    setColorOpen(false);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
    if (!SAFE_LINK.test(href)) {
      setLinkError(T.linkInvalid);
      return;
    }
    const chain = editor.chain().focus().extendMarkRange('link');
    if (editor.state.selection.empty && !state.link) {
      // No text selected: insert the URL itself as the link text.
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  const Btn = ({
    onClick,
    active,
    disabled,
    title,
    icon,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    icon: string;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the text selection
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`p-1.5 rounded-md transition-colors duration-100 disabled:opacity-30 ${
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon name={icon} size={16} variant="outline" />
    </button>
  );

  return (
    <div
      className={`border rounded-lg bg-background focus-within:ring-2 focus-within:ring-ring ${
        invalid ? 'border-danger' : 'border-border'
      }`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-border bg-muted/40 rounded-t-lg">
        <Btn title={T.bold} icon="BoldIcon" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Btn title={T.italic} icon="ItalicIcon" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Btn title={T.underline} icon="UnderlineIcon" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <Btn title={T.strike} icon="StrikethroughIcon" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />

        {/* Text color */}
        <div className="relative" ref={colorRef}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setColorOpen((o) => !o);
              setLinkOpen(false);
            }}
            title={T.textColor}
            aria-label={T.textColor}
            className="flex items-center gap-0.5 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span className="text-[13px] font-700 leading-none" style={{ color: state.color ?? undefined }}>
              A
            </span>
            <span className="block w-3.5 h-1 rounded-sm" style={{ background: state.color ?? 'currentColor' }} />
            <Icon name="ChevronDownIcon" size={10} variant="outline" />
          </button>
          {colorOpen && (
            <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-card border border-border rounded-lg shadow-card grid grid-cols-4 gap-1.5 w-[148px]">
              {COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={T.colors[c.label]}
                  aria-label={T.colors[c.label]}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (c.value) editor.chain().focus().setColor(c.value).run();
                    else editor.chain().focus().unsetColor().run();
                    setColorOpen(false);
                  }}
                  className={`w-7 h-7 rounded-md border flex items-center justify-center ${
                    (state.color ?? null) === c.value ? 'ring-2 ring-ring' : ''
                  } ${c.value ? 'border-transparent' : 'border-border bg-background'}`}
                  style={c.value ? { background: c.value } : undefined}
                >
                  {!c.value && <span className="text-[10px] text-muted-foreground">A</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="w-px h-5 bg-border mx-1" />
        <Btn title={T.bulleted} icon="ListBulletIcon" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <Btn title={T.numbered} icon="NumberedListIcon" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <span className="w-px h-5 bg-border mx-1" />
        <Btn title={T.link} icon="LinkIcon" active={state.link || linkOpen} onClick={openLink} />
        <span className="w-px h-5 bg-border mx-1" />
        <Btn title={T.undo} icon="ArrowUturnLeftIcon" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()} />
        <Btn title={T.redo} icon="ArrowUturnRightIcon" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()} />
      </div>

      {/* Link input */}
      {linkOpen && (
        <div className="px-2 py-2 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <Icon name="LinkIcon" size={14} variant="outline" className="text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === 'Escape') setLinkOpen(false);
              }}
              placeholder="https://example.org"
              className="flex-1 px-2 py-1 border border-border rounded-md text-[12.5px] bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={applyLink}
              className="px-2.5 py-1 bg-primary text-primary-foreground rounded-md text-[12px] font-600 hover:opacity-90"
            >
              {T.apply}
            </button>
            {state.link && (
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  setLinkOpen(false);
                }}
                className="px-2.5 py-1 border border-border rounded-md text-[12px] font-500 text-danger hover:bg-danger/5"
              >
                {T.remove}
              </button>
            )}
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="px-2.5 py-1 border border-border rounded-md text-[12px] font-500 hover:bg-muted"
            >
              {T.cancel}
            </button>
          </div>
          {linkError && <p className="text-[11px] text-danger mt-1 ml-6">{linkError}</p>}
        </div>
      )}

      {/* Content */}
      <div className="relative">
        {/* Read from the editor itself: the selector state can still say "empty" right after the content loads. */}
        {editor.isEmpty && placeholder && (
          <p className="absolute left-3 top-2.5 text-[13px] text-muted-foreground pointer-events-none">{placeholder}</p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
