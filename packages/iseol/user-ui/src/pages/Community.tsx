import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AppShell } from '../components/Navigation';
import { Icon } from '../components/Icon';
import { formatWorldDateTime } from '../domain/worldState';
import { createCommunityComment, createCommunityPost, listCommunityPosts, reportCommunityContent, toggleCommunityLike, type CommunityPost, UserApiError } from '../api/userApi';
import { userFacingError } from '../errorMessage';
import { useUser } from '../store/useUser';

const categories: Array<'전체' | CommunityPost['category']> = ['전체', '개발 이야기', '학습 이야기', '프로젝트 공유', '질문 · 답변', '팀 모집'];
const colors: Record<CommunityPost['category'], string> = { '개발 이야기': '#3b82f6', '학습 이야기': '#10b981', '프로젝트 공유': '#8b5cf6', '질문 · 답변': '#f59e0b', '팀 모집': '#f43f5e' };
function message(error: unknown): string { return userFacingError(error, '커뮤니티를 불러오지 못했습니다.'); }
function reportDraftKey(targetType: 'post' | 'comment', targetId: string): string { return `${targetType}:${targetId}`; }

export default function Community() {
  const profile = useUser();
  const timezone = profile.status === 'ready' ? profile.timezone : undefined;
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [category, setCategory] = useState<typeof categories[number]>('전체');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CommunityPost['category']>('개발 이야기');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentBusy, setCommentBusy] = useState<string | null>(null);
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => { try { setError(''); setPosts((await listCommunityPosts(category === '전체' ? undefined : category)).posts); } catch (caught) { setError(message(caught)); } };
  useEffect(() => { void refresh(); }, [category]);

  const create = async () => {
    try { setBusy(true); setError(''); const result = await createCommunityPost({ category: selectedCategory, title, content, tags: [] }); setPosts((current) => [result.post, ...current]); setTitle(''); setContent(''); setShowForm(false); setStatus('게시글을 저장했습니다.'); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  };

  const like = async (post: CommunityPost) => {
    try { const result = await toggleCommunityLike(post.id); setPosts((current) => current.map((item) => item.id === post.id ? { ...item, viewerLiked: result.liked, likeCount: result.likeCount } : item)); }
    catch (caught) { setError(message(caught)); }
  };

  const addComment = async (post: CommunityPost) => {
    const draft = commentDrafts[post.id] ?? '';
    if (!draft.trim()) return;
    try {
      setCommentBusy(post.id); setError('');
      const result = await createCommunityComment(post.id, draft);
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comments: [...(item.comments ?? []), result.comment] } : item));
      setCommentDrafts((current) => ({ ...current, [post.id]: '' })); setStatus('댓글을 저장했습니다.');
    } catch (caught) { setError(message(caught)); }
    finally { setCommentBusy(null); }
  };

  const report = async (post: CommunityPost, targetType: 'post' | 'comment', targetId: string, targetKey: string) => {
    const draft = reportDrafts[targetKey] ?? '';
    if (!draft.trim()) { setError('신고 사유를 입력해 주세요.'); return; }
    try {
      setReportBusy(targetKey); setError('');
      await reportCommunityContent(post.id, { targetType, targetId, reason: draft });
      setReportDrafts((current) => ({ ...current, [targetKey]: '' })); setStatus('신고가 저장되었습니다.');
    } catch (caught) { setError(message(caught)); }
    finally { setReportBusy(null); }
  };

  return <AppShell><div className="p-6 md:p-8" style={{ fontFamily: 'var(--font-body)' }}>
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8"><div><div className="flex items-center gap-3 mb-2"><Icon name="globe" size={24} /><h1 className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>커뮤니티 광장</h1></div><p className="text-sm" style={{ color: '#64748b' }}>실제로 저장된 게시글과 사용자 반응을 확인합니다.</p></div><button onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white" style={{ background: '#3b82f6' }}><Icon name="edit" size={16} /> 글 쓰기</button></div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}{status && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{status}</p>}
    {showForm && <section className="card-game p-5 mb-6"><h2 className="font-black mb-4" style={{ color: '#0f1b35' }}>새 게시글</h2><label className="block text-sm font-semibold mb-3">분류<select aria-label="게시글 분류" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value as CommunityPost['category'])} className="mt-1 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5"><option>개발 이야기</option><option>학습 이야기</option><option>프로젝트 공유</option><option>질문 · 답변</option><option>팀 모집</option></select></label><input aria-label="게시글 제목" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="제목" className="w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 mb-3" /><textarea aria-label="게시글 내용" value={content} onChange={(event) => setContent(event.target.value)} placeholder="내용" rows={4} className="w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 mb-3" /><button onClick={() => void create()} disabled={busy} className="rounded-xl px-4 py-2 font-bold text-white disabled:opacity-40" style={{ background: '#10b981' }}>{busy ? '저장 중…' : '게시글 저장'}</button></section>}
    <div className="flex gap-2 mb-6 overflow-x-auto pb-1">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: category === item ? (item === '전체' ? '#0f1b35' : colors[item]) : '#f0f9ff', color: category === item ? 'white' : '#475569' }}>{item}</button>)}</div>
    {posts.length === 0 ? <div className="card-game p-10 text-center"><p className="font-bold" style={{ color: '#0f1b35' }}>아직 공개된 게시글이 없습니다.</p><p className="text-sm mt-2" style={{ color: '#94a3b8' }}>첫 게시글을 작성하면 다른 사용자와 실제 기록을 공유할 수 있습니다.</p></div> : <div className="space-y-4 max-w-4xl">{posts.map((post) => <article key={post.id} className="card-game p-5"><div className="flex items-start justify-between gap-3 mb-3"><div><Link to={`/profile?userId=${encodeURIComponent(post.author.userId)}`} aria-label={`${post.author.displayName} 프로필 보기`} className="font-bold text-sm text-slate-900 no-underline hover:underline">{post.author.displayName}</Link><p className="text-xs" style={{ color: '#94a3b8' }}>{formatWorldDateTime(timezone, post.createdAt)}</p></div><span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: `${colors[post.category]}18`, color: colors[post.category] }}>{post.category}</span></div><h2 className="font-black mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{post.title}</h2><p className="text-sm leading-7" style={{ color: '#475569' }}>{post.content}</p>
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-slate-100"><button onClick={() => void like(post)} aria-label={post.viewerLiked ? `좋아요 취소 ${post.likeCount}` : `좋아요 ${post.likeCount}`} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: post.viewerLiked ? '#f43f5e' : '#94a3b8' }}><Icon name="heart" size={15} /> {post.likeCount}</button><span className="text-xs" style={{ color: '#94a3b8' }}>작성자 {post.author.handle}</span><button onClick={() => void report(post, 'post', post.id, reportDraftKey('post', post.id))} disabled={reportBusy === reportDraftKey('post', post.id) || !(reportDrafts[reportDraftKey('post', post.id)] ?? '').trim()} aria-label={`게시글 신고 ${post.title}`} className="text-xs font-bold text-amber-700 disabled:opacity-40">게시글 신고</button><label className="sr-only" htmlFor={`report-reason-post-${post.id}`}>신고 사유 ${post.title}</label><input id={`report-reason-post-${post.id}`} aria-label={`신고 사유 ${post.title}`} value={reportDrafts[reportDraftKey('post', post.id)] ?? ''} onChange={(event) => setReportDrafts((current) => ({ ...current, [reportDraftKey('post', post.id)]: event.target.value }))} placeholder="신고 사유" maxLength={5000} className="min-w-40 flex-1 rounded-xl border-2 border-blue-100 px-3 py-2 text-xs" /></div>
          <section className="mt-4 pt-4 border-t border-slate-100" aria-label={`댓글 ${post.title}`}><h3 className="text-sm font-black mb-3" style={{ color: '#0f1b35' }}>댓글 {(post.comments ?? []).length}</h3>{(post.comments ?? []).length > 0 ? <ul className="space-y-2 mb-3">{post.comments.map((comment) => { const targetKey = reportDraftKey('comment', comment.id); return <li key={comment.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"><Link to={`/profile?userId=${encodeURIComponent(comment.author.userId)}`} className="font-bold text-slate-800 no-underline hover:underline">{comment.author.displayName}</Link><span className="text-slate-300">·</span><span className="flex-1" style={{ color: '#475569' }}>{comment.content}</span><button onClick={() => void report(post, 'comment', comment.id, targetKey)} disabled={reportBusy === targetKey || !(reportDrafts[targetKey] ?? '').trim()} aria-label={`댓글 신고 ${comment.id}`} className="text-xs font-bold text-amber-700 disabled:opacity-40">댓글 신고</button><label className="sr-only" htmlFor={`report-reason-comment-${comment.id}`}>댓글 신고 사유 {comment.id}</label><input id={`report-reason-comment-${comment.id}`} aria-label={`댓글 신고 사유 ${comment.id}`} value={reportDrafts[targetKey] ?? ''} onChange={(event) => setReportDrafts((current) => ({ ...current, [targetKey]: event.target.value }))} placeholder="댓글 신고 사유" maxLength={5000} className="min-w-32 flex-1 rounded-xl border-2 border-blue-100 px-3 py-2 text-xs" /></li>; })}</ul> : <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>아직 댓글이 없습니다.</p>}<div className="flex gap-2"><input aria-label={`댓글 입력 ${post.title}`} value={commentDrafts[post.id] ?? ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="댓글을 남겨 보세요" className="min-w-0 flex-1 rounded-xl border-2 border-blue-100 px-3 py-2 text-sm" /><button onClick={() => void addComment(post)} disabled={commentBusy === post.id || !(commentDrafts[post.id] ?? '').trim()} aria-label={`댓글 작성 ${post.title}`} className="rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-40" style={{ background: '#3b82f6' }}>{commentBusy === post.id ? '저장 중…' : '댓글 작성'}</button></div></section>
    </article>)}</div>}
  </div></AppShell>;
}
