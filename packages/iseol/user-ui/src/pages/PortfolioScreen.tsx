import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AppShell } from '../components/Navigation';
import { Icon } from '../components/Icon';
import { actorLabel } from '../domain/provenance';
import { formatWorldDate, formatWorldDateTime } from '../domain/worldState';
import { useUser } from '../store/useUser';
import {
  createPortfolioEntry,
  exportPortfolio,
  getGrowth,
  getPortfolio,
  listActivityEvents,
  updatePortfolioEntry,
  type PortfolioEntry,
  type PortfolioEvidence,
  type GrowthSnapshot,
  type PortfolioSnapshot,
  type UserActivityEvent,
  UserApiError,
} from '../api/userApi';
import { userFacingError } from '../errorMessage';

function message(error: unknown): string {
  return userFacingError(error, '포트폴리오를 불러오지 못했습니다.');
}

function activityEventLabel(eventType: string): string {
  if (eventType === 'learning.coding.attempt.submitted') return '코딩 연습 답안 제출';
  return eventType;
}

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: filename.endsWith('.json') ? 'application/json' : 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function evidenceLink(item: PortfolioEvidence): { to: string; label: string } | null {
  if (item.sourceType === 'project-evidence' && item.projectId) return { to: `/projects/${encodeURIComponent(item.projectId)}`, label: '원 프로젝트 보기' };
  if (item.sourceType === 'activity') return { to: `/activity?event=${encodeURIComponent(item.sourceId)}`, label: '활동 원장 보기' };
  if (item.sourceType === 'learning-report') return { to: '/learning', label: '학습 보고서 보기' };
  return null;
}

function EvidenceSourceLink({ item }: { item?: PortfolioEvidence }) {
  if (!item) return null;
  const link = evidenceLink(item);
  return link ? <Link to={link.to} className="mt-2 inline-block text-xs font-bold text-blue-600 no-underline">{link.label} →</Link> : null;
}

export function ActivityTimeline() {
  const profile = useUser();
  const timezone = profile.status === 'ready' ? profile.timezone : undefined;
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [growth, setGrowth] = useState<GrowthSnapshot | null>(null);
  const [events, setEvents] = useState<UserActivityEvent[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([getPortfolio(), getGrowth(), listActivityEvents()])
      .then(([nextSnapshot, nextGrowth, nextEvents]) => { setSnapshot(nextSnapshot); setGrowth(nextGrowth); setEvents(nextEvents.events); })
      .catch((caught) => setError(message(caught)));
  }, []);
  const evidence = snapshot?.evidence ?? [];
  const verified = evidence.filter((item) => item.verificationStatus === 'verified');
  const activityEvents = events ?? [];
  const [searchParams] = useSearchParams();
  const focusedEventId = searchParams.get('event');
  useEffect(() => {
    if (!focusedEventId || activityEvents.length === 0) return;
    document.getElementById(`activity-${focusedEventId}`)?.scrollIntoView({ block: 'center' });
  }, [focusedEventId, activityEvents.length]);
  return <AppShell>
    <div className="p-6 md:p-8" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="mb-8"><div className="flex items-center gap-3 mb-2"><Icon name="chart" size={24} /><h1 className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>활동 기록 · 성장 타임라인</h1></div><p className="text-sm" style={{ color: '#64748b' }}>검증된 활동과 프로젝트 증거를 확인합니다.</p></div>
      {error && <p role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {growth && <section className="card-game mb-8 p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-orange-500">GROWTH STATUS</p><p className="mt-1 text-3xl font-black text-slate-900">Lv. {growth.level}</p><p className="mt-1 text-sm text-slate-500">{growth.xp} / {growth.xpMax} XP · 검증된 증거 {growth.evidenceEventIds.length}건</p></div><div className="text-right text-xs text-slate-500"><p>사용자 기여 {growth.actorBreakdown.user} XP</p><p>AI 기여 {growth.actorBreakdown.ai} XP · 시스템 {growth.actorBreakdown.system} XP</p></div></div><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{([['개발', growth.stats.development], ['학습', growth.stats.learning], ['협업', growth.stats.collaboration], ['꾸준함', growth.stats.consistency]] as const).map(([label, value]) => <div key={label} className="rounded-xl bg-orange-50 p-3"><p className="text-xs font-bold text-orange-700">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p></div>)}</div></section>}
      <section className="card-game mb-8 p-5" aria-label="전체 활동 원장"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-black" style={{ color: '#0f1b35' }}>전체 활동 원장</h2><p className="mt-1 text-sm text-slate-500">내 계정에 저장된 활동 이벤트와 검증 상태를 표시합니다.</p></div><span className="text-xs font-bold text-slate-400">{events === null ? '불러오는 중…' : `${activityEvents.length}건`}</span></div>{events === null ? <p className="mt-4 text-sm text-slate-500">활동 이벤트를 불러오는 중…</p> : activityEvents.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">아직 저장된 활동 이벤트가 없습니다.</p> : <div className="mt-4 space-y-2">{activityEvents.slice().reverse().map((event) => <article id={`activity-${event.id}`} key={event.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3 ${focusedEventId === event.id ? 'border-blue-300 bg-blue-50/40' : 'border-slate-100'}`}><div><p className="text-sm font-bold text-slate-800">{activityEventLabel(event.eventType)}</p><p className="mt-1 text-xs text-slate-400">{formatWorldDateTime(timezone, event.occurredAt)} · {event.sourceType}/{event.sourceId} · 행위자 {actorLabel(event.actorType)}</p></div><div className="flex items-center gap-2 text-xs font-bold"><span className={event.status === 'retracted' ? 'rounded-full bg-rose-50 px-2.5 py-1 text-rose-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-slate-600'}>{event.status === 'retracted' ? '철회됨' : '활성'}</span><span className={`rounded-full px-2.5 py-1 ${event.verificationStatus === 'verified' ? 'bg-emerald-50 text-emerald-700' : event.verificationStatus === 'unknown' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{event.verificationStatus === 'verified' ? '검증됨' : event.verificationStatus === 'unknown' ? '확인 불가' : '미검증'}</span></div></article>)}</div>}</section>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">{[
        ['전체 증거', evidence.length, '#6366f1'], ['검증됨', verified.length, '#10b981'], ['활동 기록', evidence.filter((item) => item.sourceType === 'activity').length, '#f43f5e'], ['프로젝트 증거', evidence.filter((item) => item.sourceType === 'project-evidence').length, '#f59e0b'], ['학습 보고서', evidence.filter((item) => item.sourceType === 'learning-report').length, '#0891b2'],
      ].map(([label, value, color]) => <div key={String(label)} className="card-game p-4 text-center"><p className="text-2xl font-black" style={{ color: String(color) }}>{String(value)}</p><p className="text-xs" style={{ color: '#94a3b8' }}>{String(label)}</p></div>)}</div>
      {!snapshot ? <p className="text-sm text-slate-500">활동을 불러오는 중…</p> : evidence.length === 0 ? <div className="card-game p-10 text-center"><p className="font-bold" style={{ color: '#0f1b35' }}>아직 검증된 활동 증거가 없습니다.</p><p className="text-sm mt-2" style={{ color: '#94a3b8' }}>학습 또는 검증된 프로젝트 활동이 쌓이면 여기에 표시됩니다.</p></div> : <div className="space-y-3">{evidence.map((item) => <div key={item.id} className="card-game p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: item.sourceType === 'activity' ? '#fce7f3' : item.sourceType === 'learning-report' ? '#cffafe' : '#e0e7ff', color: item.sourceType === 'activity' ? '#be185d' : item.sourceType === 'learning-report' ? '#0e7490' : '#4338ca' }}>{item.sourceType === 'activity' ? '활동' : item.sourceType === 'learning-report' ? '학습 보고서' : '프로젝트 증거'}</span><p className="font-bold mt-2" style={{ color: '#0f1b35' }}>{item.summary}</p><p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{formatWorldDateTime(timezone, item.occurredAt)} · 기여 주체 {actorLabel(item.actorType)}</p><EvidenceSourceLink item={item} /></div><span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg" style={{ background: item.verificationStatus === 'verified' ? '#d1fae5' : '#fef3c7', color: item.verificationStatus === 'verified' ? '#065f46' : '#92400e' }}>{item.verificationStatus === 'verified' ? <><Icon name="check" size={14} />검증됨</> : item.verificationStatus}</span></div></div>)}</div>}
    </div>
  </AppShell>;
}

export function PortfolioPage() {
  const profile = useUser();
  const timezone = profile.status === 'ready' ? profile.timezone : undefined;
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [visibility, setVisibility] = useState<PortfolioEntry['visibility']>('private');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editVisibility, setEditVisibility] = useState<PortfolioEntry['visibility']>('private');
  const load = async () => { try { setError(''); setSnapshot(await getPortfolio()); } catch (caught) { setError(message(caught)); } };
  useEffect(() => { void load(); }, []);
  const verified = (snapshot?.evidence ?? []).filter((item) => item.verificationStatus === 'verified');
  const create = async () => { try { setBusy(true); setError(''); const result = await createPortfolioEntry({ title, summary, visibility, evidenceIds: selected }); setSnapshot((current) => current ? { ...current, entries: [result.entry, ...current.entries] } : current); setTitle(''); setSummary(''); setSelected([]); setStatus('포트폴리오를 저장했습니다.'); } catch (caught) { setError(message(caught)); } finally { setBusy(false); } };
  const beginEdit = (entry: PortfolioEntry) => { setEditingId(entry.id); setEditTitle(entry.title); setEditSummary(entry.summary); setEditVisibility(entry.visibility); setError(''); };
  const saveEdit = async (entry: PortfolioEntry) => { try { setBusy(true); setError(''); const result = await updatePortfolioEntry(entry.id, { title: editTitle, summary: editSummary, visibility: editVisibility }); setSnapshot((current) => current ? { ...current, entries: current.entries.map((item) => item.id === result.entry.id ? result.entry : item) } : current); setEditingId(null); setStatus('포트폴리오를 수정했습니다.'); } catch (caught) { setError(message(caught)); } finally { setBusy(false); } };
  const exportFile = async (format: 'json' | 'markdown') => { try { const result = await exportPortfolio(format); download(result.filename, result.content); setStatus(`${result.filename} 내보내기를 시작했습니다.`); } catch (caught) { setError(message(caught)); } };
  const publicUrl = (entry: PortfolioEntry): string => `${window.location.origin}/app/portfolio/public/${encodeURIComponent(entry.id)}`;
  const share = async (entry: PortfolioEntry) => { if (entry.visibility === 'private') return; const url = publicUrl(entry); try { if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable'); await navigator.clipboard.writeText(url); setStatus('공개 포트폴리오 링크를 복사했습니다.'); } catch { setStatus(`공개 포트폴리오 링크: ${url}`); } };
  return <AppShell><div className="p-6 md:p-8" style={{ fontFamily: 'var(--font-body)' }}>
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8"><div><div className="flex items-center gap-3 mb-2"><Icon name="palette" size={24} /><h1 className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>포트폴리오</h1></div><p className="text-sm" style={{ color: '#64748b' }}>검증된 활동 증거를 선택해 실제 기록 기반 포트폴리오를 만듭니다.</p></div><div className="flex gap-2"><button onClick={() => void exportFile('json')} className="px-3 py-2 rounded-xl text-sm font-bold" style={{ background: '#eef2ff', color: '#4338ca' }}>JSON 내보내기</button><button onClick={() => void exportFile('markdown')} className="px-3 py-2 rounded-xl text-sm font-bold" style={{ background: '#ecfdf5', color: '#047857' }}>Markdown 내보내기</button><button onClick={() => setPreview((value) => !value)} className="px-3 py-2 rounded-xl text-sm font-bold text-white" style={{ background: '#0f1b35' }}>{preview ? '편집' : '미리보기'}</button></div></div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}{status && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{status}</p>}
        {preview ? <PortfolioPreview entries={snapshot?.entries ?? []} evidence={snapshot?.evidence ?? []} /> : <div className="grid gap-6 lg:grid-cols-[1fr_1fr]"><section className="card-game p-5"><h2 className="font-black mb-4" style={{ color: '#0f1b35' }}>새 포트폴리오 생성</h2><input aria-label="포트폴리오 제목" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="프로젝트 제목" className="w-full px-3 py-2.5 rounded-xl border-2 border-blue-100 mb-3" /><textarea aria-label="포트폴리오 요약" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="무엇을 했고 무엇을 배웠는지 작성하세요." rows={4} className="w-full px-3 py-2.5 rounded-xl border-2 border-blue-100 mb-3" /><label className="block text-sm font-semibold mb-3" style={{ color: '#475569' }}>공개 범위<select value={visibility} onChange={(event) => setVisibility(event.target.value as PortfolioEntry['visibility'])} className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-blue-100"><option value="private">비공개</option><option value="unlisted">링크 공유</option><option value="public">전체 공개</option></select></label><p className="text-sm font-bold mb-2" style={{ color: '#0f1b35' }}>근거 선택 ({selected.length})</p><div className="max-h-72 overflow-auto space-y-2">{verified.length === 0 && <p className="text-sm text-slate-500">선택 가능한 검증 증거가 없습니다.</p>}{verified.map((item) => <label key={item.id} className="flex gap-2 rounded-lg bg-slate-50 p-3 text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>{item.summary}</span></label>)}</div><button onClick={() => void create()} disabled={busy || !title.trim() || !summary.trim() || selected.length === 0} className="mt-4 w-full py-3 rounded-xl font-bold text-white disabled:opacity-40" style={{ background: '#10b981' }}>{busy ? '저장 중…' : '포트폴리오 저장'}</button></section><section><h2 className="font-black mb-4" style={{ color: '#0f1b35' }}>저장된 항목 {snapshot?.entries.length ?? 0}개</h2>{(snapshot?.entries ?? []).length === 0 ? <div className="card-game p-8 text-center text-sm text-slate-500">아직 저장된 포트폴리오가 없습니다.</div> : <div className="space-y-3">{snapshot!.entries.map((entry) => editingId === entry.id ? <div key={entry.id} className="card-game p-4"><input aria-label="포트폴리오 항목 제목 수정" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 border-blue-100 mb-2" /><textarea aria-label="포트폴리오 항목 요약 수정" value={editSummary} onChange={(event) => setEditSummary(event.target.value)} rows={4} className="w-full px-3 py-2.5 rounded-xl border-2 border-blue-100 mb-2" /><select aria-label="포트폴리오 항목 공개 범위 수정" value={editVisibility} onChange={(event) => setEditVisibility(event.target.value as PortfolioEntry['visibility'])} className="w-full px-3 py-2.5 rounded-xl border-2 border-blue-100 mb-2"><option value="private">비공개</option><option value="unlisted">링크 공유</option><option value="public">전체 공개</option></select><div className="flex gap-2 mt-3"><button onClick={() => void saveEdit(entry)} disabled={busy || !editTitle.trim() || !editSummary.trim()} className="px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#10b981' }}>저장</button><button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-xl text-sm font-bold border-2 border-slate-200 text-slate-500">취소</button></div></div> : <div key={entry.id} className="card-game p-4"><div className="flex justify-between gap-3"><h3 className="font-bold" style={{ color: '#0f1b35' }}>{entry.title}</h3><div className="flex items-center gap-2"><span className="text-xs" style={{ color: '#64748b' }}>{entry.visibility}</span><button onClick={() => beginEdit(entry)} aria-label={`포트폴리오 ${entry.title} 편집`} className="text-xs px-2 py-1 rounded-lg border-2 border-blue-100 text-blue-600">편집</button>{entry.visibility !== 'private' && <><button onClick={() => void share(entry)} aria-label="공개 링크 복사" className="text-xs px-2 py-1 rounded-lg border-2 border-emerald-100 text-emerald-700">링크 복사</button><a href={publicUrl(entry)} aria-label="공개 포트폴리오 열기" className="text-xs px-2 py-1 rounded-lg border-2 border-blue-100 text-blue-700 no-underline">공개 보기</a></>}</div></div><p className="text-sm mt-2" style={{ color: '#475569' }}>{entry.summary}</p><p className="text-xs mt-3" style={{ color: '#94a3b8' }}>검증 근거 {entry.evidenceIds.length}개 · {formatWorldDate(timezone, entry.updatedAt)}</p></div>)}</div>}</section></div>}
  </div></AppShell>;
}

function PortfolioPreview({ entries, evidence }: { entries: PortfolioEntry[]; evidence: PortfolioEvidence[] }) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return <div className="max-w-3xl mx-auto bg-white rounded-3xl p-8 shadow-xl" style={{ border: '2px solid #e0f4ff' }}><p className="text-xs font-bold" style={{ color: '#3b82f6' }}>NPC PORTFOLIO</p><h2 className="text-3xl font-black mt-2" style={{ color: '#0f1b35' }}>검증 가능한 성장 기록</h2>{entries.length === 0 ? <p className="mt-8 text-sm text-slate-500">미리 볼 포트폴리오가 없습니다.</p> : <div className="mt-8 space-y-6">{entries.filter((entry) => entry.visibility !== 'private').map((entry) => <article key={entry.id}><h3 className="text-xl font-black" style={{ color: '#0f1b35' }}>{entry.title}</h3><p className="mt-2 text-sm leading-7" style={{ color: '#475569' }}>{entry.summary}</p><ul className="mt-3 space-y-1 text-xs" style={{ color: '#64748b' }}>{entry.evidenceIds.map((id) => <li key={id} className="flex items-start gap-1"><Icon name="check" size={14} className="mt-0.5 shrink-0" /><span>{byId.get(id)?.summary ?? '증거를 찾을 수 없음'}</span><EvidenceSourceLink item={byId.get(id)} /></li>)}</ul></article>)}</div>}</div>;
}
