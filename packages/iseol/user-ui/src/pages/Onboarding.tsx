import { useState } from 'react';
import { useNavigate } from 'react-router';
import { UserCharacterAsset, AICompanionAsset } from '../components/CharacterAssets';
import { completeOnboarding, type CharacterType } from '../store/userStore';
import { Icon, type IconName } from '../components/Icon';
import { userFacingError } from '../errorMessage';

const TOTAL_STEPS = 7;

const characterOptions: { id: CharacterType; label: string }[] = [
  { id: 'a', label: '블루 모험가' },
  { id: 'b', label: '퍼플 마법사' },
  { id: 'c', label: '민트 탐험가' },
  { id: 'd', label: '코랄 크리에이터' },
];

const interests = ['프론트엔드', '백엔드', '풀스택', 'AI/ML', '모바일', '게임', 'DevOps', '데이터', 'UX/디자인', '보안', '임베디드'];
const activityPrefs: { id: string; icon: IconName; label: string; desc: string }[] = [
  { id: 'project', icon: 'bolt', label: '프로젝트 개발', desc: 'AI와 함께 실제 앱을 만들어요' },
  { id: 'learn', icon: 'book', label: '학습과 성장', desc: '체계적으로 기술을 배우고 싶어요' },
  { id: 'collab', icon: 'users', label: '협업과 팀', desc: '함께 하는 프로젝트가 좋아요' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [selectedChar, setSelectedChar] = useState<CharacterType>('a');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const progress = ((step - 1) / TOTAL_STEPS) * 100;

  const next = async () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      setSaving(true);
      setSaveError('');
      try {
        await completeOnboarding(name || '이설이', selectedChar, selectedInterests, selectedActivities);
        navigate('/world');
      } catch (error) {
        setSaveError(userFacingError(error, '온보딩 정보를 저장하지 못했습니다.'));
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: 'var(--font-body)', background: '#e8f5ff' }}>
      {/* Progress sidebar */}
      <div className="hidden md:flex w-72 flex-col p-8" style={{ background: 'linear-gradient(180deg, #1e1b4b, #312e81)' }}>
        <div className="flex items-center gap-2 mb-12">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>이</div>
          <span className="text-xl font-black text-white" style={{ fontFamily: 'var(--font-display)' }}>NPC</span>
        </div>
        <div className="space-y-2 flex-1">
          {['환영합니다','이름 설정','캐릭터 선택','관심 분야','활동 선택','AI 이설 소개','세계 생성 완료!'].map((label, i) => {
            const s = i + 1;
            const done = step > s;
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all" style={{ background: done ? '#10b981' : 'transparent', border: done ? 'none' : active ? '2px solid #a78bfa' : '2px solid rgba(255,255,255,0.2)', color: done ? 'white' : active ? '#a78bfa' : 'rgba(255,255,255,0.4)' }}>
                  {done ? <Icon name="check" size={14} /> : s}
                </div>
                <span className="text-sm font-semibold" style={{ color: done ? '#86efac' : active ? '#e0e7ff' : 'rgba(255,255,255,0.4)' }}>{label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-8">
          <div className="h-2 bg-indigo-900 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}/>
          </div>
          <p className="text-xs mt-2 text-indigo-300">{step} / {TOTAL_STEPS} 단계</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          {step === 1 && (
            <div className="text-center">
              <div className="flex justify-center gap-6 mb-8">
                <div className="float-anim"><UserCharacterAsset size={100}/></div>
                <div className="float-anim" style={{ animationDelay: '1s' }}><AICompanionAsset size={90}/></div>
              </div>
              <div className="flex items-center justify-center gap-2 mb-4"><Icon name="sparkles" size={25} className="text-indigo-500" /><h1 className="text-4xl font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>NPC에 오신 걸 환영해요!</h1></div>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#475569' }}>지금부터 나만의 디지털 캐릭터를 만들고, 나만의 세계를 설정할 거예요. 잠깐이면 됩니다!</p>
              <button onClick={next} className="px-10 py-4 rounded-2xl font-black text-white text-lg transition-all hover:scale-105" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', boxShadow: '0 4px 24px rgba(99,102,241,0.3)' }}>
                시작하기 →
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-3xl font-black mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>어떻게 불러드릴까요?</h2>
              <p className="text-sm mb-8" style={{ color: '#64748b' }}>NPC 안에서 사용할 표시 이름을 입력해주세요. 나중에 바꿀 수 있어요.</p>
              <label htmlFor="onboard-name" className="sr-only">표시 이름</label>
              <input id="onboard-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: 이설이, devMaster, 코딩요정" className="w-full px-5 py-4 rounded-2xl border-2 outline-none text-lg font-semibold mb-6 transition-all" style={{ border: '2px solid #bae8ff', color: '#0f1b35', fontFamily: 'var(--font-body)' }} onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'} onBlur={e => e.currentTarget.style.borderColor = '#bae8ff'}/>
              <button onClick={next} disabled={!name.trim()} className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                {name.trim() ? `"${name}"(으)로 시작할게요 →` : '이름을 입력해주세요'}
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-3xl font-black mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>나를 표현할 캐릭터를 선택해요</h2>
              <p className="text-sm mb-8" style={{ color: '#64748b' }}>캐릭터는 나중에도 꾸밀 수 있어요!</p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {characterOptions.map(c => (
                  <button key={c.id} onClick={() => setSelectedChar(c.id)} className="rounded-2xl p-4 text-center transition-all" style={{ border: `3px solid ${selectedChar === c.id ? '#3b82f6' : '#e0f4ff'}`, background: selectedChar === c.id ? '#eff6ff' : 'white', transform: selectedChar === c.id ? 'scale(1.02)' : 'scale(1)', cursor: 'pointer' }}>
                    <div className="flex justify-center mb-3"><UserCharacterAsset size={80}/></div>
                    <p className="font-bold text-sm" style={{ color: '#0f1b35' }}>{c.label}</p>
                    {selectedChar === c.id && <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#3b82f6' }}><Icon name="check" size={13} />선택됨</span>}
                  </button>
                ))}
              </div>
              <button onClick={next} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>이 캐릭터로 할게요 →</button>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-3xl font-black mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>주요 관심 분야를 알려주세요</h2>
              <p className="text-sm mb-8" style={{ color: '#64748b' }}>여러 개를 선택할 수 있어요. AI가 더 잘 맞는 추천을 드릴게요.</p>
              <div className="flex flex-wrap gap-3 mb-8">
                {interests.map(i => {
                  const sel = selectedInterests.includes(i);
                  return (
                    <button key={i} onClick={() => setSelectedInterests(sel ? selectedInterests.filter(x => x !== i) : [...selectedInterests, i])} className="px-4 py-2 rounded-xl font-bold text-sm transition-all" style={{ background: sel ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'white', color: sel ? 'white' : '#475569', border: `2px solid ${sel ? 'transparent' : '#bae8ff'}` }}>
                      {i}
                    </button>
                  );
                })}
              </div>
              <button onClick={next} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                {selectedInterests.length > 0 ? `${selectedInterests.length}개 선택 완료 →` : '건너뛰기 →'}
              </button>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="text-3xl font-black mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>주로 어떤 활동을 하고 싶으세요?</h2>
              <p className="text-sm mb-8" style={{ color: '#64748b' }}>복수 선택 가능해요. 메인 화면 구성에 반영됩니다.</p>
              <div className="space-y-4 mb-8">
                {activityPrefs.map(a => {
                  const sel = selectedActivities.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => setSelectedActivities(sel ? selectedActivities.filter(x => x !== a.id) : [...selectedActivities, a.id])} className="flex items-center gap-4 p-4 rounded-2xl w-full text-left transition-all" style={{ border: `3px solid ${sel ? '#3b82f6' : '#e0f4ff'}`, background: sel ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                      <Icon name={a.icon} size={30} className="text-blue-600" />
                      <div className="flex-1">
                        <p className="font-bold" style={{ color: '#0f1b35' }}>{a.label}</p>
                        <p className="text-sm" style={{ color: '#64748b' }}>{a.desc}</p>
                      </div>
                      <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{ background: sel ? '#3b82f6' : 'transparent', borderColor: sel ? '#3b82f6' : '#bae8ff', color: sel ? 'white' : 'transparent' }}>
                        {sel && <Icon name="check" size={14} />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button onClick={next} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>계속 →</button>
            </div>
          )}

          {step === 6 && (
            <div className="text-center">
              <div className="flex justify-center mb-6 float-anim"><AICompanionAsset size={120}/></div>
              <div className="flex items-center justify-center gap-2 mb-4"><Icon name="sparkles" size={24} className="text-violet-600" /><h2 className="text-3xl font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>개인 AI 이설을 소개해요</h2></div>
              <div className="card-game p-5 mb-6 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)', color: 'white' }}><Icon name="sparkles" size={19} /></div>
                  <div>
                    <p className="font-bold" style={{ color: '#0f1b35' }}>AI 이설</p>
                    <p className="text-xs px-2 py-0.5 rounded-full inline-block font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>AI 런타임 연결 대기</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>
                  안녕하세요! 저는 AI 이설이에요. 프로젝트 개발, 학습 계획, 코드 작성, 아이디어 정리까지 모든 걸 도와드릴게요. 실제로 코드를 실행하기 전에는 항상 먼저 여쭤볼 거예요!
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-8">
                {[{ icon: 'code' as const, label: '코드 작성' }, { icon: 'alertTriangle' as const, label: '오류 해결' }, { icon: 'fileText' as const, label: '계획 수립' }].map(f => (
                  <div key={f.label} className="p-3 rounded-xl text-center" style={{ background: '#f5f3ff' }}>
                    <div className="flex justify-center mb-1"><Icon name={f.icon} size={23} /></div>
                    <p className="text-xs font-bold" style={{ color: '#7c3aed' }}>{f.label}</p>
                  </div>
                ))}
              </div>
              <button onClick={next} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>이설과 함께 시작하기 →</button>
            </div>
          )}

          {step === 7 && (
            <div className="text-center">
              <div className="flex justify-center mb-4 text-indigo-600"><Icon name="sparkles" size={80} /></div>
              <h2 className="text-4xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>나만의 세계가 만들어졌어요!</h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#475569' }}>
                <strong>{name || '이설이'}</strong>님의 디지털 세계가 준비됐어요.<br/>이제 캐릭터를 꾸미고, 프로젝트를 시작하거나, AI 이설과 대화해보세요!
              </p>
              <div className="flex justify-center gap-4 mb-8">
                <div className="float-anim"><UserCharacterAsset size={90}/></div>
                <div className="float-anim" style={{ animationDelay: '0.8s' }}><AICompanionAsset size={80}/></div>
              </div>
              {saveError && <p className="mb-4 p-3 rounded-xl text-sm font-semibold status-error">{saveError}</p>}
              <button onClick={next} disabled={saving} className="px-12 py-4 rounded-2xl font-black text-white text-lg transition-all hover:scale-105 disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', boxShadow: '0 4px 32px rgba(99,102,241,0.3)' }}>
                {saving ? '저장 중…' : <><Icon name="home" size={18} /> 내 세계로 이동</>}
              </button>
            </div>
          )}

          {step > 1 && step < 7 && (
            <button onClick={() => setStep(step - 1)} className="mt-4 text-sm font-semibold" style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← 이전 단계
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
