import type { JSONContent } from '@tiptap/react';
import type { Concept } from '../data/concepts';
import { requireSupabase } from './supabase';

export type ConceptNote = { user_id: string; concept_id: string; body: JSONContent; updated_at: string; nickname: string; picture: string };
export async function loadConceptNotes(conceptId: string): Promise<ConceptNote[]> {
  const { data, error } = await requireSupabase().from('concept_notes')
    .select('user_id, concept_id, body, updated_at, profiles(nickname, picture)')
    .eq('concept_id', conceptId).order('updated_at', { ascending: false });
  if (error) throw new Error('필기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return (data || []).map(row => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { ...row, nickname: profile?.nickname || '사용자', picture: profile?.picture || '' };
  });
}
export async function saveConceptNote(userId: string, conceptId: string, body: JSONContent, previous: string | null) {
  if (new TextEncoder().encode(JSON.stringify(body)).length > 180000) throw new Error('필기가 너무 깁니다. 내용을 조금 줄여 주세요.');
  const sb = requireSupabase();
  const values = { user_id: userId, concept_id: conceptId, body };
  const result = previous
    ? await sb.from('concept_notes').update({ body }).eq('user_id', userId).eq('concept_id', conceptId).eq('updated_at', previous).select('updated_at').maybeSingle()
    : await sb.from('concept_notes').insert(values).select('updated_at').single();
  if (result.error?.code === '23505' || (!result.error && !result.data)) throw new Error('다른 창에서 이 필기가 변경되었습니다. 작성 내용을 복사한 뒤 새로고침해 주세요.');
  if (result.error) throw new Error('저장하지 못했습니다. 작성 내용은 유지됩니다. 다시 시도해 주세요.');
  return result.data!.updated_at;
}
function inline(text: string): JSONContent[] {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map(part => part.startsWith('`') && part.endsWith('`')
    ? { type: 'text', text: part.slice(1, -1), marks: [{ type: 'code' }] } : { type: 'text', text: part });
}
export function conceptDocument(concept: Concept): JSONContent {
  const content: JSONContent[] = [];
  for (const section of concept.sections) {
    content.push({ type: 'heading', attrs: { level: 4 }, content: inline(section.heading) });
    for (const p of section.paragraphs || []) content.push({ type: 'paragraph', content: inline(p) });
    if (section.items?.length) content.push({ type: 'bulletList', content: section.items.map(item => ({ type: 'listItem', content: [{ type: 'paragraph', content: inline(item) }] })) });
    if (section.code) content.push({ type: 'codeBlock', content: [{ type: 'text', text: section.code }] });
  }
  if (concept.laterRows) {
    content.push({ type: 'heading', attrs: { level: 4 }, content: inline('목록') });
    content.push({ type: 'table', content: [
      { type: 'tableRow', content: ['유형', '언제', '메모'].map(text => ({ type: 'tableHeader', content: [{ type: 'paragraph', content: inline(text) }] })) },
      ...concept.laterRows.map(row => ({ type: 'tableRow', content: [row.name, row.when, row.advice].map(text => ({ type: 'tableCell', content: [{ type: 'paragraph', content: inline(text) }] })) }))
    ] });
  }
  return { type: 'doc', content };
}
