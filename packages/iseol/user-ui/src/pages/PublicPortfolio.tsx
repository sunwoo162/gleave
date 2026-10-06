import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { actorLabel } from '../domain/provenance';
import { formatWorldDate } from '../domain/worldState';
import { getPublicPortfolioEntry, type PublicPortfolioView, UserApiError } from '../api/userApi';

export default function PublicPortfolio() {
  const { entryId = '' } = useParams();
  const [view, setView] = useState<PublicPortfolioView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void getPublicPortfolioEntry(entryId).then(setView).catch((caught) => setError(caught instanceof UserApiError ? caught.message : '공개 포트폴리오를 불러오지 못했습니다.')); }, [entryId]);
  if (error) return <main className="min-h-screen flex items-center justify-center p-6" style={{ background: '#e8f5ff', fontFamily: 'var(--font-body)' }}><div className="card-game max-w-xl p-8 text-center"><h1 className="text-xl font-black" style={{ color: '#0f1b35' }}>공개 포트폴리오를 찾을 수 없습니다.</h1><p className="mt-2 text-sm text-slate-500">비공개 항목이거나 링크가 만료되었을 수 있습니다.</p></div></main>;
  if (!view) return <main className="min-h-screen flex items-center justify-center p-6" style={{ background: '#e8f5ff', fontFamily: 'var(--font-body)' }}><p className="text-sm text-slate-500">공개 포트폴리오를 불러오는 중…</p></main>;
  return <main className="min-h-screen p-6 md:p-12" style={{ background: '#e8f5ff', fontFamily: 'var(--font-body)' }}><article className="max-w-3xl mx-auto bg-white rounded-3xl p-7 md:p-10 shadow-xl" style={{ border: '2px solid #e0f4ff' }}><p className="text-xs font-black tracking-widest" style={{ color: '#3b82f6' }}>NPC PORTFOLIO · VERIFIED RECORD</p><h1 className="text-3xl font-black mt-3" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{view.entry.title}</h1><p className="mt-4 text-base leading-8" style={{ color: '#475569' }}>{view.entry.summary}</p><div className="mt-8"><h2 className="font-black" style={{ color: '#0f1b35' }}>검증된 활동 근거 {view.evidence.length}개</h2>{view.evidence.length === 0 ? <p className="mt-3 text-sm text-slate-500">공개 가능한 검증 근거가 없습니다.</p> : <ul className="mt-3 space-y-2">{view.evidence.map((item, index) => <li key={`${item.summary}-${item.occurredAt}-${index}`} className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><div className="flex items-start gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0" /><span>{item.summary}</span></div><span className="block mt-1 text-xs text-emerald-700">기여 주체 {actorLabel(item.actorType)} · {formatWorldDate(undefined, item.occurredAt)}</span></li>)}</ul>}</div><p className="mt-8 text-xs text-slate-400">공개 범위: {view.entry.visibility} · 마지막 수정 {formatWorldDate(undefined, view.entry.updatedAt)}</p></article></main>;
}
