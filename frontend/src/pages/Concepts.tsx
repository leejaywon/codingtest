import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { JSONContent } from '@tiptap/react';
import type { AuthUser } from '../api';
import Select from '../components/Select';
const ConceptEditor = lazy(() => import('../components/ConceptEditor'));
import { CONCEPT_GROUPS, CONCEPTS, RANK_META, type Concept } from '../data/concepts';
import { conceptDocument, loadConceptNotes, saveConceptNote, type ConceptNote } from '../lib/conceptNotes';

type Draft = { body: JSONContent; previous: string | null };
function Avatar({ nickname, picture }: { nickname: string; picture: string }) {
  const [failed, setFailed] = useState(false);
  return picture && !failed ? <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span>{Array.from(nickname)[0]?.toUpperCase()}</span>;
}
function Pencil() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15zM4 15l4 4" /></svg>;
}
export default function Concepts({ user }: { user: AuthUser; onLogout: () => void }) {
  const loc = useLocation();
  const selected = useMemo(() => {
    let id = loc.hash.slice(1);
    try { id = decodeURIComponent(id); } catch { /* Fall back to first concept. */ }
    return CONCEPTS.find(c => c.id === id) || CONCEPTS[0];
  }, [loc.hash]);
  return <ConceptWorkspace key={`${user.id}:${selected.id}`} selected={selected} user={user} />;
}
function ConceptWorkspace({ selected, user }: { selected: Concept; user: AuthUser }) {
  const navigate = useNavigate();
  const articleRef = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const [notes, setNotes] = useState<ConceptNote[]>([]);
  const [author, setAuthor] = useState('default');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const draftKey = `concept-draft:${user.id}:${selected.id}`;
  const original = useMemo(() => conceptDocument(selected), [selected]);
  const mine = notes.find(n => n.user_id === user.id);
  const displayed = notes.find(n => n.user_id === author);
  const canEdit = author === 'default' || author === user.id;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError('');
    loadConceptNotes(selected.id).then(rows => {
      if (cancelled) return;
      setNotes(rows); setAuthor(rows.some(n => n.user_id === user.id) ? user.id : 'default');
    }).catch(e => { if (!cancelled) setLoadError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    document.querySelector('.concepts-toc a.on')?.scrollIntoView({ block: 'nearest' });
    return () => { cancelled = true; };
  }, [selected.id, user.id, revision]);
  function persist(next: Draft) {
    setDraft(next);
    try { sessionStorage.setItem(draftKey, JSON.stringify(next)); }
    catch { setError('이 브라우저에서 초안을 보관할 수 없습니다. 이동하기 전에 Save를 눌러 주세요.'); }
  }
  function edit() {
    setError('');
    let next: Draft = { body: mine?.body || original, previous: mine?.updated_at || null };
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) {
        const restored = JSON.parse(saved);
        if (restored.body?.type === 'doc' && (restored.previous === null || typeof restored.previous === 'string')) {
          next = restored;
        }
      }
    } catch { /* Start from the saved document if browser storage is unavailable. */ }
    persist(next);
  }
  function cancel() {
    try { sessionStorage.removeItem(draftKey); } catch { /* Optional browser storage. */ }
    setDraft(null); setError('');
  }
  async function save(bodyOverride?: JSONContent) {
    if (!draft || saving) return;
    const body = bodyOverride || draft.body;
    setSaving(true); setError('');
    try {
      const updated_at = await saveConceptNote(user.id, selected.id, body, draft.previous);
      try { sessionStorage.removeItem(draftKey); } catch { /* Saved remotely. */ }
      if (!mounted.current) return;
      const note: ConceptNote = { user_id: user.id, concept_id: selected.id, body, updated_at, nickname: user.nickname, picture: user.picture };
      setNotes(rows => [note, ...rows.filter(n => n.user_id !== user.id)]);
      setAuthor(user.id); setDraft(null);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { if (mounted.current) setSaving(false); }
  }
  return <div className="page concepts-page">
    <header className="page-head concepts-head">
      <h2>Concepts</h2>
      <div className="concept-authors" role="group" aria-label="필기 작성자 선택">
        <button type="button" className="concept-original" disabled={!!draft} aria-pressed={author === 'default'} onClick={() => setAuthor('default')}>기본</button>
        {notes.map(note => <button type="button" key={note.user_id} className="concept-avatar" disabled={!!draft}
          aria-pressed={author === note.user_id} aria-label={`${note.nickname}${note.user_id === user.id ? ' (나)' : ''}의 필기 보기`}
          title={`${note.nickname}${note.user_id === user.id ? ' (나)' : ''}`} onClick={() => { setAuthor(note.user_id); articleRef.current?.scrollTo(0, 0); }}>
          <Avatar nickname={note.nickname} picture={note.picture} />
        </button>)}
      </div>
    </header>
    <div className="mobile-concept-picker"><span>개념 목차</span><Select ariaLabel="개념 목차" value={selected.id}
      onChange={id => navigate(`/concepts#${id}`, { replace: true })}
      options={CONCEPT_GROUPS.flatMap(group => group.items.map(c => ({ value: c.id, label: c.title })))} /></div>
    <div className="concepts-split">
      <nav className="concepts-toc" aria-label="개념 목차">{CONCEPT_GROUPS.map(g => <div key={g.rank} className="toc-group">
        <div className="toc-group-label">{RANK_META[g.rank].label}<span>{RANK_META[g.rank].hint}</span></div>
        {g.items.map((c, i) => <Link key={c.id} to={{ pathname: '/concepts', hash: `#${c.id}` }} replace preventScrollReset className={c.id === selected.id ? 'on' : undefined} aria-current={c.id === selected.id ? 'location' : undefined}><em>{String(i + 1).padStart(2, '0')}</em>{c.title}</Link>)}
      </div>)}</nav>
      <article className={`concepts-article${draft ? ' is-editing' : ''}`} ref={articleRef}>
        {!draft && <div className="concept-title-row"><h3>{selected.title}</h3>
          <div className="concept-actions">
            <span className="concept-note-meta">{displayed ? `${displayed.nickname}${author === user.id ? ' (나)' : ''}의 필기${canEdit ? '' : ' · 읽기 전용'}` : '기본 설명'}</span>
            {canEdit && <button type="button" className="concept-pencil" aria-label={`${selected.title} 내 필기 편집`} title="내 필기 편집" disabled={loading || !!loadError} onClick={edit}><Pencil /></button>}
          </div>
        </div>}
        {loading && <p role="status" className="concept-message">필기를 불러오는 중…</p>}
        {loadError && <div role="alert" className="concept-message error">{loadError} <button type="button" onClick={() => setRevision(r => r + 1)}>다시 시도</button></div>}
        {error && <p role="alert" className="concept-message error">{error}</p>}
        <Suspense fallback={<p role="status">필기 화면을 준비하는 중…</p>}><ConceptEditor key={draft ? 'edit' : `${author}:${displayed?.updated_at || 'original'}`} body={draft?.body || displayed?.body || original} editable={!!draft} disabled={saving}
          onCancel={draft ? cancel : undefined} onSave={draft ? save : undefined}
          onChange={body => { if (draft) persist({ ...draft, body }); }} /></Suspense>
        {!draft && selected.catalogName && <Link className="concept-cta" to={`/?type=${encodeURIComponent(selected.catalogName)}`}>이 유형 문제 보기</Link>}
      </article>
    </div>
  </div>;
}
