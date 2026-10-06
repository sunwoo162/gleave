import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AppShell } from '../components/Navigation';
import { Icon } from '../components/Icon';
import { formatWorldDateTime } from '../domain/worldState';
import { appendMemory, deleteMemory, listMemories, listSharedMemories, listTeams, updateMemory, updateMemorySharing, type MemoryRecord, type TeamRecord, UserApiError } from '../api/userApi';
import { userFacingError } from '../errorMessage';
import { useUser } from '../store/useUser';

type Draft = { kind: string; content: string; source: string };
const emptyDraft: Draft = { kind: '', content: '', source: '' };

function errorMessage(error: unknown): string { return userFacingError(error, '개인 기억을 처리하지 못했습니다.'); }
export default function MemoryVault() {
  const profile = useUser();
  const timezone = profile.status === 'ready' ? profile.timezone : undefined;
  const timeLabel = (value: string): string => formatWorldDateTime(timezone, value);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [sharedMemories, setSharedMemories] = useState<Array<{ memory: MemoryRecord; teamName: string }>>([]);
  const [shareDrafts, setShareDrafts] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async (term: string) => {
    setLoading(true); setError('');
    try {
      const result = await listMemories(term.trim());
      setMemories(result.memories);
      try {
        const activeTeams = (await listTeams()).teams.filter((team) => Boolean(team.viewerRole));
        setTeams(activeTeams);
        const shared = (await Promise.all(activeTeams.map(async (team) => {
          try { return (await listSharedMemories(team.id)).memories.map((memory) => ({ memory, teamName: team.name })); } catch { return []; }
        }))).flat().filter(({ memory }, index, all) => memory.userId !== '' && all.findIndex((item) => item.memory.id === memory.id) === index);
        setSharedMemories(shared.filter(({ memory }) => !result.memories.some((owned) => owned.id === memory.id)));
      } catch { setTeams([]); setSharedMemories([]); }
    }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(search); }, [load, search]);

  function beginEdit(memory: MemoryRecord): void {
    setEditingId(memory.id);
    setDraft({ kind: memory.kind, content: memory.content, source: memory.source ?? '' });
    setStatus(''); setError('');
  }

  function resetDraft(): void { setEditingId(null); setDraft(emptyDraft); }

  async function save(): Promise<void> {
    if (!draft.kind.trim() || !draft.content.trim() || busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      if (editingId) {
        await updateMemory(editingId, { kind: draft.kind.trim(), content: draft.content.trim(), source: draft.source.trim() || null });
        setStatus('개인 기억을 수정했습니다.');
      } else {
        await appendMemory({ kind: draft.kind.trim(), content: draft.content.trim(), ...(draft.source.trim() ? { source: draft.source.trim() } : {}) });
        setStatus('개인 기억을 저장했습니다.');
      }
      resetDraft();
      await load(search);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }

  async function remove(memory: MemoryRecord): Promise<void> {
    if (busy || !window.confirm('이 개인 기억을 삭제할까요?')) return;
    setBusy(true); setError(''); setStatus('');
    try { await deleteMemory(memory.id); if (editingId === memory.id) resetDraft(); setStatus('개인 기억을 삭제했습니다.'); await load(search); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }

  function selectedTeams(memory: MemoryRecord): string[] { return shareDrafts[memory.id] ?? memory.sharedTeamIds ?? []; }

  function toggleTeamSharing(memoryId: string, teamId: string, checked: boolean): void {
    setShareDrafts((current) => {
      const selected = new Set(current[memoryId] ?? memories.find((memory) => memory.id === memoryId)?.sharedTeamIds ?? []);
      if (checked) selected.add(teamId); else selected.delete(teamId);
      return { ...current, [memoryId]: [...selected] };
    });
  }

  async function saveSharing(memory: MemoryRecord): Promise<void> {
    if (busy || shareBusyId) return;
    setShareBusyId(memory.id); setError(''); setStatus('');
    try {
      const result = await updateMemorySharing(memory.id, selectedTeams(memory));
      setMemories((current) => current.map((item) => item.id === memory.id ? result.memory : item));
      setShareDrafts((current) => ({ ...current, [memory.id]: result.memory.sharedTeamIds ?? [] }));
      setStatus('기억 공유 범위를 저장했습니다.');
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setShareBusyId(null); }
  }

  return <AppShell><div className="min-h-screen p-6 md:p-8" style={{ fontFamily: 'var(--font-body)' }}>
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-wider text-violet-500">PRIVATE MEMORY</p><h1 className="mt-1 text-3xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>개인 기억 보관함</h1><p className="mt-2 text-sm text-slate-600">AI 이설이 참고할 수 있는 기억을 직접 열람·수정·삭제합니다.</p></div>
      <Link to="/ai-chat" className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white no-underline">AI 이설 대화로 이동</Link>
    </header>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {status && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{status}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <section className="card-game h-fit p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">{editingId ? '기억 수정' : '새 기억 저장'}</h2>{editingId && <button type="button" onClick={resetDraft} className="text-xs font-bold text-slate-500">취소</button>}</div>
        <div className="space-y-4">
          <label className="block text-sm font-bold text-slate-700">종류<input aria-label="기억 종류" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })} placeholder="예: 학습 선호, 설계 결정" className="mt-1.5 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" /></label>
          <label className="block text-sm font-bold text-slate-700">내용<textarea aria-label="기억 내용" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="AI 이설이 기억할 내용을 적어주세요." rows={6} className="mt-1.5 w-full resize-y rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" /></label>
          <label className="block text-sm font-bold text-slate-700">출처 <span className="font-normal text-slate-400">(선택)</span><input aria-label="기억 출처" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} placeholder="예: learning-session-1" className="mt-1.5 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" /></label>
          <button type="button" onClick={() => void save()} disabled={busy || !draft.kind.trim() || !draft.content.trim()} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? '저장 중…' : editingId ? '수정 저장' : '개인 기억 저장'}</button>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-violet-50 p-3 text-xs leading-relaxed text-violet-800"><Icon name="lock" size={15} className="mt-0.5 shrink-0" /> 모든 기억은 기본적으로 개인 전용입니다. 아래 저장된 기억에서 참여 중인 특정 팀을 선택한 경우에만 그 팀의 활성 멤버와 공유됩니다.</p>
      </section>
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black text-slate-900">저장된 기억 <span className="text-sm font-normal text-slate-500">({memories.length})</span></h2><label className="sr-only" htmlFor="memory-search">기억 검색</label><input id="memory-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="종류·내용·출처 검색" className="w-full max-w-xs rounded-xl border-2 border-blue-100 bg-white px-3 py-2 text-sm" /></div>
        {loading && <div className="card-game p-8 text-center text-sm text-slate-500">개인 기억을 불러오는 중…</div>}
        {!loading && memories.length === 0 && <div className="card-game p-8 text-center"><p className="font-bold text-slate-700">{search.trim() ? '검색 결과가 없습니다.' : '저장된 개인 기억이 없습니다.'}</p><p className="mt-2 text-sm text-slate-500">학습·프로젝트에서 중요한 맥락을 직접 저장해 보세요.</p></div>}
        {!loading && memories.length > 0 && <div className="space-y-3">{memories.map((memory) => <article key={memory.id} className="card-game p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">{memory.kind}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">{selectedTeams(memory).length > 0 ? `${selectedTeams(memory).length}개 팀에 공유` : '개인 전용'}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{memory.content}</p><p className="mt-3 text-xs text-slate-400">저장 {timeLabel(memory.createdAt)} · 수정 {timeLabel(memory.updatedAt)}{memory.source ? ` · 출처 ${memory.source}` : ''}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => beginEdit(memory)} disabled={busy || Boolean(shareBusyId)} className="rounded-lg border-2 border-blue-100 px-3 py-1.5 text-xs font-bold text-blue-600 disabled:opacity-40">수정</button><button type="button" onClick={() => void remove(memory)} disabled={busy || Boolean(shareBusyId)} className="rounded-lg border-2 border-rose-100 px-3 py-1.5 text-xs font-bold text-rose-600 disabled:opacity-40">삭제</button></div></div>{teams.length > 0 && <fieldset className="mt-4 rounded-xl border-2 border-violet-100 bg-violet-50 p-3"><legend className="px-1 text-xs font-black text-violet-800">공유 범위</legend><p className="mb-2 text-xs text-violet-700">선택한 팀의 활성 멤버만 이 기억을 볼 수 있습니다. 팀 탈퇴 시 접근이 끊깁니다.</p><div className="flex flex-wrap gap-2">{teams.map((team) => <label key={team.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700"><input type="checkbox" aria-label={`팀 공유 ${team.name}`} checked={selectedTeams(memory).includes(team.id)} onChange={(event) => toggleTeamSharing(memory.id, team.id, event.target.checked)} disabled={Boolean(shareBusyId) || busy} />{team.name}</label>)}</div><button type="button" onClick={() => void saveSharing(memory)} disabled={busy || shareBusyId === memory.id} className="mt-3 rounded-lg border-2 border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 disabled:opacity-40">{shareBusyId === memory.id ? '저장 중…' : '공유 범위 저장'}</button></fieldset>}</article>)}</div>}
        {!loading && sharedMemories.length > 0 && <section className="mt-6"><h2 className="mb-3 text-lg font-black text-slate-900">팀에서 공유받은 기억 <span className="text-sm font-normal text-slate-500">({sharedMemories.length})</span></h2><div className="space-y-3">{sharedMemories.map(({ memory, teamName }) => <article key={`${teamName}:${memory.id}`} className="card-game border-2 border-cyan-100 p-5"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-bold text-cyan-700">{teamName}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">읽기 전용 공유</span></div><p className="mt-3 text-sm font-bold text-slate-800">{memory.kind}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{memory.content}</p><p className="mt-3 text-xs text-slate-400">공유 기억 · {timeLabel(memory.updatedAt)}</p></article>)}</div></section>}
      </section>
    </div>
  </div></AppShell>;
}
