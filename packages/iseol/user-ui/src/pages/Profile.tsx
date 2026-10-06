import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AppShell } from '../components/Navigation';
import { UserCharacterAsset } from '../components/CharacterAssets';
import { Icon, type IconName } from '../components/Icon';
import { getProfile, updateProfile, type PublicProfile, UserApiError } from '../api/userApi';
import { useUser } from '../store/useUser';
import { userFacingError } from '../errorMessage';

function errorMessage(error: unknown): string {
  return userFacingError(error, '프로필을 불러오지 못했습니다.');
}

const growthStatItems: Array<{ key: keyof NonNullable<PublicProfile['publicGrowth']>['stats']; label: string; icon: IconName }> = [
  { key: 'development', label: '개발', icon: 'code' },
  { key: 'learning', label: '학습', icon: 'book' },
  { key: 'collaboration', label: '협업', icon: 'users' },
  { key: 'consistency', label: '꾸준함', icon: 'rotate' },
];

export default function Profile() {
  const user = useUser();
  const [searchParams] = useSearchParams();
  const targetUserId = searchParams.get('userId') ?? '';
  const isOwn = !targetUserId || targetUserId === user.id;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState('');
  const [visibility, setVisibility] = useState<PublicProfile['visibility']>('public');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setStatus('');
    void getProfile(targetUserId || undefined).then((result) => {
      if (!active) return;
      setProfile(result.profile);
      setHandle(result.profile?.handle ?? '');
      setBio(result.profile?.bio ?? '');
      setSkills(result.profile?.skills.join(', ') ?? '');
      setVisibility(result.profile?.visibility ?? 'public');
    }).catch((caught) => { if (active) setError(errorMessage(caught)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [targetUserId]);

  async function save(): Promise<void> {
    if (!isOwn || busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const result = await updateProfile({ handle: handle.trim(), bio: bio.trim(), skills: skills.split(',').map((item) => item.trim()).filter(Boolean), visibility });
      setProfile(result.profile); setStatus('프로필을 저장했습니다.');
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  return <AppShell><main className="mx-auto max-w-3xl p-6 md:p-8" style={{ fontFamily: 'var(--font-body)' }}>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black tracking-widest text-blue-500">NPC PROFILE</p><h1 className="mt-2 text-3xl font-black text-slate-900">{isOwn ? '내 프로필' : '사용자 프로필'}</h1><p className="mt-2 text-sm text-slate-500">실제 활동과 협업에 사용되는 공개 프로필을 관리합니다.</p></div>
      <Link to="/friends" className="rounded-xl border-2 border-blue-100 px-4 py-2 text-sm font-bold text-blue-600 no-underline">친구·메시지로</Link>
    </div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {status && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{status}</p>}
    {loading ? <div className="card-game p-6 text-sm text-slate-500">프로필을 불러오는 중…</div> : !profile ? <div className="card-game p-6 text-sm text-slate-500">공개되지 않았거나 존재하지 않는 프로필입니다.</div> : <div className="space-y-5">
      <section className="card-game p-6">
        <div className="mb-5 flex items-center gap-4"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-blue-50"><UserCharacterAsset size={76} alt={`${profile.displayName} 개인 캐릭터`} /></div><div><h2 className="text-xl font-black text-slate-900">{profile.displayName}</h2><p className="text-sm text-slate-500">@{profile.handle}</p><p className="mt-1 text-xs font-semibold text-blue-600">개인 캐릭터 프로필</p></div></div>
        <div className="grid gap-4">
          <label className="text-sm font-bold text-slate-700">핸들<input value={handle} onChange={(event) => setHandle(event.target.value)} readOnly={!isOwn} className="mt-1 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 font-normal outline-none" /></label>
          <label className="text-sm font-bold text-slate-700">소개<textarea value={bio} onChange={(event) => setBio(event.target.value)} readOnly={!isOwn} rows={4} className="mt-1 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 font-normal outline-none" /></label>
          <label className="text-sm font-bold text-slate-700">기술·관심사<span className="mt-1 block text-xs font-normal text-slate-400">쉼표로 구분해 입력하세요.</span><input value={skills} onChange={(event) => setSkills(event.target.value)} readOnly={!isOwn} className="mt-1 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 font-normal outline-none" /></label>
          <label className="text-sm font-bold text-slate-700">공개 범위<select value={visibility} onChange={(event) => setVisibility(event.target.value as PublicProfile['visibility'])} disabled={!isOwn} className="mt-1 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 font-normal outline-none"><option value="public">공개</option><option value="private">비공개</option></select></label>
        </div>
        {isOwn && <button onClick={() => void save()} disabled={busy} className="mt-5 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? '저장 중…' : '프로필 저장'}</button>}
      </section>
      <section className="card-game p-6"><h2 className="mb-3 text-lg font-black text-slate-900">기술·관심사</h2>{profile.skills.length === 0 ? <p className="text-sm text-slate-500">아직 등록된 기술·관심사가 없습니다.</p> : <div className="flex flex-wrap gap-2">{profile.skills.map((skill) => <span key={skill} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{skill}</span>)}</div>}</section>
      {profile.publicGrowth && <section className="card-game p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black tracking-widest text-violet-500">GROWTH</p><h2 className="mt-1 text-lg font-black text-slate-900">성장 정보</h2></div><span className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-black text-violet-700">Lv.{profile.publicGrowth.level}</span></div><div className="mt-4"><div className="mb-1 flex justify-between text-xs font-bold text-slate-500"><span>경험치</span><span>{profile.publicGrowth.xp} / {profile.publicGrowth.xpMax}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${Math.min(100, Math.round((profile.publicGrowth.xp / Math.max(1, profile.publicGrowth.xpMax)) * 100))}%` }}/></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 md:grid-cols-4">{growthStatItems.map((stat) => <div key={stat.key} className="rounded-xl bg-slate-50 p-3"><span className="flex items-center gap-1.5 text-slate-400"><Icon name={stat.icon} size={14} />{stat.label}</span><span className="mt-1 block text-base text-slate-800">{profile.publicGrowth!.stats[stat.key]}</span></div>)}</div>{profile.publicGrowth.achievements.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{profile.publicGrowth.achievements.map((achievement) => <span key={achievement.id} title={achievement.description} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700"><Icon name="trophy" size={14} />{achievement.title}</span>)}</div>}</section>}
      {profile.publicProjects && <section className="card-game p-6"><p className="text-xs font-black tracking-widest text-blue-500">PROJECTS</p><h2 className="mt-1 text-lg font-black text-slate-900">공개 프로젝트</h2>{profile.publicProjects.length === 0 ? <p className="mt-3 text-sm text-slate-500">공개된 프로젝트가 없습니다.</p> : <div className="mt-4 space-y-3">{profile.publicProjects.map((project) => <article key={`${project.name}-${project.updatedAt}`} className="rounded-2xl border-2 border-blue-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-black text-slate-900">{project.name}</h3><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{project.status === 'archived' ? '보관됨' : '진행 중'}</span></div><p className="mt-2 text-sm text-slate-600">{project.objective}</p></article>)}</div>}</section>}
      {profile.publicLearning && <section className="card-game p-6"><p className="text-xs font-black tracking-widest text-emerald-500">LEARNING</p><h2 className="mt-1 text-lg font-black text-slate-900">학습 기록</h2>{profile.publicLearning.goals.length === 0 && profile.publicLearning.plans.length === 0 && profile.publicLearning.sessions.length === 0 ? <p className="mt-3 text-sm text-slate-500">공개된 학습 기록이 없습니다.</p> : <div className="mt-4 space-y-3">{profile.publicLearning.goals.map((goal) => <div key={`${goal.subject}-${goal.updatedAt}`} className="rounded-2xl bg-emerald-50/60 p-4"><p className="font-bold text-slate-900">{goal.subject}</p><p className="mt-1 text-xs font-semibold text-emerald-700">목표 상태 · {goal.status}</p></div>)}{profile.publicLearning.plans.length > 0 && <p className="text-sm font-bold text-slate-600">학습 계획 {profile.publicLearning.plans.length}개 · 세션 {profile.publicLearning.sessions.length}개</p>}</div>}</section>}
      {profile.publicPortfolio && <section className="card-game p-6"><p className="text-xs font-black tracking-widest text-amber-500">PORTFOLIO</p><h2 className="mt-1 text-lg font-black text-slate-900">공개 포트폴리오</h2>{profile.publicPortfolio.length === 0 ? <p className="mt-3 text-sm text-slate-500">공개된 포트폴리오가 없습니다.</p> : <div className="mt-4 space-y-3">{profile.publicPortfolio.map((entry) => <Link key={entry.id} to={`/portfolio/public/${encodeURIComponent(entry.id)}`} className="block rounded-2xl border-2 border-amber-100 p-4 no-underline"><div className="flex items-start justify-between gap-3"><h3 className="font-black text-slate-900">{entry.title}</h3><span className="text-xs font-bold text-amber-700">공개 보기 →</span></div><p className="mt-2 text-sm text-slate-600">{entry.summary}</p></Link>)}</div>}</section>}
    </div>}
  </main></AppShell>;
}
