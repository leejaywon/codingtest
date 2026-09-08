import { useEffect, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

function ToolIcon({ children }: { children: ReactNode }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export default function ConceptEditor({ body, editable, disabled = false, onCancel, onSave, onChange }: {
  body: JSONContent;
  editable: boolean;
  disabled?: boolean;
  onCancel?: () => void;
  onSave?: (body: JSONContent) => void;
  onChange?: (body: JSONContent) => void;
}) {
  const [view, setView] = useState<'visual' | 'html'>('visual');
  const [html, setHtml] = useState('');
  const [htmlError, setHtmlError] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [3, 4, 5] }, link: false, underline: false }), TableKit],
    content: body, editable,
    editorProps: { attributes: { class: 'concept-rich-text', 'aria-label': editable ? '개념 필기 편집기' : '개념 필기', ...(editable ? { role: 'textbox', 'aria-multiline': 'true' } : {}) } },
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
  }, [editable]);
  useEffect(() => { editor?.setEditable(editable && !disabled); }, [editor, editable, disabled]);
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({
    bold: e?.isActive('bold'), heading: e?.isActive('heading'), list: e?.isActive('bulletList'), ordered: e?.isActive('orderedList'), inlineCode: e?.isActive('code'), code: e?.isActive('codeBlock'), table: e?.isActive('table'),
  }) });
  if (!editor) return null;

  function applyHtml(value: string) {
    try {
      editor.commands.setContent(value, {
        emitUpdate: false,
        errorOnInvalidContent: true,
        parseOptions: { preserveWhitespace: 'full' },
      });
      const next = editor.getJSON();
      onChange?.(next);
      setHtmlError(false);
      return next;
    } catch {
      setHtmlError(true);
      return null;
    }
  }

  function showHtml() {
    setHtml(editor.getHTML());
    setHtmlError(false);
    setView('html');
  }

  function showVisual() {
    if (applyHtml(html)) setView('visual');
  }

  function save() {
    const next = view === 'html' ? applyHtml(html) : editor.getJSON();
    if (next) onSave?.(next);
  }

  return <div className={editable ? 'concept-editor editing' : 'concept-editor'}>
    {editable && <div className="concept-toolbar" inert={disabled} role="toolbar" aria-label="필기 서식">
      <div className="concept-view-switch" role="group" aria-label="편집 보기">
        <button type="button" aria-pressed={view === 'visual'} onClick={showVisual}>비주얼</button>
        <button type="button" aria-pressed={view === 'html'} onClick={showHtml}>HTML</button>
      </div>
      {view === 'visual' && <>
        <span className="concept-toolbar-divider" aria-hidden="true" />
        <button type="button" title="소제목" aria-pressed={state?.heading} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>소제목</button>
        <button type="button" className="concept-tool-icon" title="굵게" aria-label="굵게" aria-pressed={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" className="concept-tool-icon" title="글머리 기호 목록" aria-label="글머리 기호 목록" aria-pressed={state?.list} onClick={() => editor.chain().focus().toggleBulletList().run()}><ToolIcon><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="3" cy="6" r="1" /><circle cx="3" cy="12" r="1" /><circle cx="3" cy="18" r="1" /></ToolIcon></button>
        <button type="button" className="concept-tool-icon" title="번호 목록" aria-label="번호 목록" aria-pressed={state?.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ToolIcon><path d="M10 6h11M10 12h11M10 18h11M3 3h1v6M2 9h4M2 15c0-3 4-3 4 0 0 1-4 3-4 5h4" /></ToolIcon></button>
        <button type="button" className="concept-tool-icon" title="인라인 코드 (⌘/Ctrl + E)" aria-label="인라인 코드" aria-pressed={state?.inlineCode} disabled={state?.code} onClick={() => editor.chain().focus().toggleCode().run()}><ToolIcon><path d="m8 7-5 5 5 5m8-10 5 5-5 5" /></ToolIcon></button>
        <button type="button" className="concept-tool-icon" title="코드 블록" aria-label="코드 블록" aria-pressed={state?.code} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><ToolIcon><path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16" /></ToolIcon></button>
        <button type="button" className="concept-tool-icon" title="표 추가" aria-label="표 추가" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><ToolIcon><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 9v12M15 9v12" /></ToolIcon></button>
        {state?.table && <>
          <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>행 +</button>
          <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>행 −</button>
          <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>열 +</button>
          <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>열 −</button>
          <button type="button" onClick={() => editor.chain().focus().deleteTable().run()}>표 삭제</button>
        </>}
        <button type="button" className="concept-tool-icon" title="실행 취소" aria-label="실행 취소" onClick={() => editor.chain().focus().undo().run()}><ToolIcon><path d="m8 4-5 5 5 5M3 9h11a7 7 0 0 1 0 14" /></ToolIcon></button>
        <button type="button" className="concept-tool-icon" title="다시 실행" aria-label="다시 실행" onClick={() => editor.chain().focus().redo().run()}><ToolIcon><path d="m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14" /></ToolIcon></button>
      </>}
      <div className="concept-toolbar-actions">
        <button type="button" disabled={disabled} onClick={onCancel}>Cancel</button>
        <button type="button" className="concept-save" disabled={disabled || htmlError} onClick={save}>{disabled ? 'Saving…' : 'Save'}</button>
      </div>
    </div>}
    {view === 'html' && editable
      ? <textarea className="concept-html-source" aria-label="본문 HTML 코드" value={html} spellCheck={false} onChange={event => { const value = event.target.value; setHtml(value); applyHtml(value); }} />
      : <EditorContent editor={editor} />}
  </div>;
}
