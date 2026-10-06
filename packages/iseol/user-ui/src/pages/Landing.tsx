import { Link } from 'react-router';
import { SpaceBackground } from '../components/Character';
import { UserCharacterAsset, AICompanionAsset } from '../components/CharacterAssets';
import { Btn } from '../components/UI';
import { Icon, type IconName } from '../components/Icon';

const featureCards: Array<{ icon: IconName; title: string; desc: string; color: string; bg: string }> = [
  { icon: 'bolt', title: 'AI와 함께 개발', desc: '개인 AI 이설이 실제 코드를 작성하고 테스트하고 빌드합니다. 사용자가 승인한 작업만 실행됩니다.', color: '#8b5cf6', bg: '#f5f3ff' },
  { icon: 'globe', title: '나만의 디지털 세계', desc: '캐릭터를 만들고 개인 공간을 꾸미세요. 활동할수록 나만의 세계가 성장합니다.', color: '#3b82f6', bg: '#eff6ff' },
  { icon: 'book', title: '학습과 캐릭터 성장', desc: 'AI가 맞춤 학습 계획을 만들어 드립니다. 공부한 만큼 캐릭터가 성장하고 기록됩니다.', color: '#10b981', bg: '#ecfdf5' },
  { icon: 'users', title: '실제 사람들과 협업', desc: '팀을 구성하고 함께 프로젝트를 진행하세요. AI와 사람이 함께하는 혼합 팀도 가능합니다.', color: '#f43f5e', bg: '#fff1f2' },
  { icon: 'palette', title: '포트폴리오 자동 생성', desc: '실제 수행한 활동이 자동으로 기록되어 신뢰할 수 있는 포트폴리오가 됩니다.', color: '#f59e0b', bg: '#fffbeb' },
  { icon: 'message', title: '활기찬 커뮤니티', desc: '개발, 학습, 협업 이야기를 나누고 다양한 사람들의 캐릭터와 함께 어울려요.', color: '#0ea5e9', bg: '#f0f9ff' },
];

export default function Landing() {
  return (
    <div style={{ fontFamily: 'var(--font-body)', background: '#e8f5ff' }}>
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur border-b-2 border-blue-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', fontFamily: 'var(--font-display)' }}>이</div>
            <span className="text-xl font-black" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NPC</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold" style={{ color: '#475569' }}>
            <a href="#features" className="hover:text-blue-600 transition-colors" style={{ textDecoration: 'none' }}>기능</a>
            <a href="#world" className="hover:text-blue-600 transition-colors" style={{ textDecoration: 'none' }}>나만의 세계</a>
            <a href="#community" className="hover:text-blue-600 transition-colors" style={{ textDecoration: 'none' }}>커뮤니티</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Btn variant="ghost" size="sm">로그인</Btn>
            </Link>
            <Link to="/signup" style={{ textDecoration: 'none' }}>
              <Btn variant="primary" size="sm">무료로 시작하기</Btn>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
        <div className="absolute inset-0">
          <SpaceBackground />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-sm font-bold" style={{ background: 'linear-gradient(135deg, #dbeafe, #ede9fe)', color: '#4338ca' }}>
              <Icon name="sparkles" size={16} /> AI · 개발 · 학습 · 협업 플랫폼
            </div>
            <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>
              내 캐릭터와 함께<br/>
              <span style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>나만의 세계</span>를<br/>
              만들어가세요
            </h1>
            <p className="text-lg leading-relaxed mb-8" style={{ color: '#475569' }}>
              현실의 나를 디지털 캐릭터로 표현하고, AI 이설과 함께 실제 프로젝트를 개발하고, 공부하고, 사람들과 협업하면서 나만의 성장 기록을 쌓아가는 곳.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/signup" style={{ textDecoration: 'none' }}>
                <Btn variant="primary" size="lg"><Icon name="rocket" size={17} /> 지금 시작하기</Btn>
              </Link>
              <Link to="/onboarding" style={{ textDecoration: 'none' }}>
                <Btn variant="secondary" size="lg">⬡ 미리 둘러보기</Btn>
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-6">
              <div className="flex -space-x-2">
                {['#3b82f6','#8b5cf6','#10b981','#f43f5e'].map((c,i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white" style={{ background: c }}/>
                ))}
              </div>
              <p className="text-sm font-semibold" style={{ color: '#475569' }}>나만의 캐릭터와 활동 기록을 지금 시작해보세요</p>
            </div>
          </div>
          <div className="relative flex justify-center">
            {/* World card */}
            <div className="relative w-full max-w-md">
              <div className="rounded-3xl overflow-hidden border-4 border-white shadow-2xl" style={{ background: 'linear-gradient(135deg, #bae6fd, #ddd6fe, #fbcfe8)' }}>
                <div className="relative h-64 overflow-hidden">
                  <div className="absolute inset-0 flex items-end justify-center pb-0">
                    {/* Room illustration */}
                    <div className="w-full h-full relative">
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #e0f2fe 0%, #ede9fe 60%, #ddd6fe 100%)' }}/>
                      {/* Window */}
                      <div className="absolute top-4 right-8 w-20 h-24 rounded-lg" style={{ background: '#bae6fd', border: '3px solid #93c5fd' }}/>
                      {/* Desk */}
                      <div className="absolute bottom-0 left-0 right-0 h-20" style={{ background: '#c4b5fd', borderRadius: '12px 12px 0 0' }}/>
                      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-48 h-3 rounded" style={{ background: '#a78bfa' }}/>
                      {/* Characters */}
                      <div className="absolute bottom-18 left-1/4 float-anim">
                        <UserCharacterAsset size={80}/>
                      </div>
                      <div className="absolute bottom-18 right-1/4 float-anim" style={{ animationDelay: '1s' }}>
                        <AICompanionAsset size={70}/>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-5 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-black text-base" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>예시 캐릭터의 세계</p>
                      <p className="text-xs" style={{ color: '#64748b' }}>실제 활동이 저장되면 성장 정보가 표시됩니다</p>
                    </div>
                    <Icon name="sparkles" size={26} />
                  </div>
                  <div className="xp-bar-track">
                    <div className="xp-bar-fill" style={{ width: '68%' }}/>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {['프로젝트 3개 완료', '연속 학습 7일', '팀 결성'].map(t => (
                      <span key={t} className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: '#f0f9ff', color: '#0ea5e9' }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Floating badges */}
              <div className="absolute -top-4 -right-4 px-3 py-1.5 rounded-xl shadow-lg text-sm font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: 'white' }}>예시 성장 기록</div>
              <div className="absolute -bottom-4 -left-4 px-3 py-1.5 rounded-xl shadow-lg text-sm font-bold" style={{ background: 'linear-gradient(135deg, #10b981, #0891b2)', color: 'white' }}>실제 검증 후 표시</div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature sections */}
      <section id="features" className="py-24 px-6" style={{ background: 'white' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>NPC가 만드는 경험</h2>
            <p className="text-lg" style={{ color: '#64748b' }}>게임의 설레임과 개발 도구의 실용성이 함께</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureCards.map(f => (
              <div key={f.title} className="card-game p-6" style={{ borderColor: `${f.color}30` }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: f.bg, color: f.color }}><Icon name={f.icon} size={28} /></div>
                <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* World preview section */}
      <section id="world" className="py-24 px-6 bg-iseol-hero">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl font-black mb-6" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>
              혼자서도, 팀으로도<br/>
              <span style={{ color: '#7c3aed' }}>프로젝트를 만들어가세요</span>
            </h2>
            <div className="space-y-4">
              {[
                { step: '1', title: '아이디어를 입력하면', desc: 'AI가 여러 개의 프로토타입을 만들어 비교할 수 있게 해줍니다.' },
                { step: '2', title: '마음에 드는 걸 선택하면', desc: '실제 프로젝트 작업실에서 개발을 계속 이어갑니다.' },
                { step: '3', title: '팀원이 필요하다면', desc: '모집 광장에서 사람을 찾아 함께 진행할 수 있습니다.' },
              ].map(s => (
                <div key={s.title} className="flex gap-4 p-4 rounded-2xl" style={{ background: 'white', border: '2px solid #ddd6fe' }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black" style={{ background: '#ede9fe', color: '#7c3aed' }}>{s.step}</span>
                  <div>
                    <p className="font-bold" style={{ color: '#0f1b35' }}>{s.title}</p>
                    <p className="text-sm" style={{ color: '#64748b' }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {/* Idea Lab preview */}
            <div className="card-game p-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="lightbulb" size={20} />
                <span className="font-bold" style={{ fontFamily: 'var(--font-display)' }}>Idea Lab</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>생성 중...</span>
              </div>
              <p className="text-sm p-3 rounded-xl mb-3" style={{ background: '#f8fafc', color: '#475569', borderLeft: '3px solid #3b82f6' }}>
                "개인 할 일 관리 웹앱을 만들고 싶어. 카테고리 분류와 마감일 설정이 가능했으면 해."
              </p>
              <div className="flex gap-2">
                {['후보 A', '후보 B', '후보 C'].map((c, i) => (
                  <div key={c} className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold text-center ${i === 1 ? 'text-white' : 'bg-blue-50 text-blue-700'}`} style={i === 1 ? { background: 'linear-gradient(135deg, #3b82f6, #6366f1)' } : {}}>
                    <span className="inline-flex items-center justify-center gap-1">{c} {i === 1 && <Icon name="check" size={13} />}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* AI chat preview */}
            <div className="card-game p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)', color: 'white' }}><Icon name="sparkles" size={16} /></div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#0f1b35' }}>AI 이설</p>
                  <p className="text-xs" style={{ color: '#10b981' }}>● 온라인</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="px-3 py-2 rounded-xl" style={{ background: '#f5f3ff', color: '#0f1b35' }}>
                  로그인 기능을 추가할까요? JWT 토큰을 사용하는 방식으로 구현하겠습니다.
                </div>
                <div className="px-3 py-2 rounded-xl ml-4" style={{ background: '#dbeafe', color: '#0f1b35' }}>
                  응, 추가해줘!
                </div>
                <div className="flex items-center gap-1 px-3 py-2 rounded-xl" style={{ background: '#f5f3ff', color: '#0f1b35' }}>
                  <Icon name="check" size={14} /> 실행 계획 확인이 필요합니다 → <span className="font-bold" style={{ color: '#7c3aed' }}>승인하기</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-black mb-4 text-white" style={{ fontFamily: 'var(--font-display)' }}>지금 NPC에서 나만의 세계를 만들어보세요</h2>
          <p className="text-lg mb-10" style={{ color: '#a5b4fc' }}>캐릭터를 만들고, AI와 함께 개발하고, 사람들과 협업하며 성장하세요.</p>
          <Link to="/signup" style={{ textDecoration: 'none' }}>
            <button className="px-10 py-4 rounded-2xl text-lg font-black text-white transition-all hover:scale-105" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', boxShadow: '0 4px 32px rgba(139,92,246,0.4)' }}>
              <Icon name="rocket" size={18} /> 무료로 시작하기
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-white border-t-2 border-blue-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>이</div>
            <span className="font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>NPC</span>
          </div>
          <p className="text-sm" style={{ color: '#94a3b8' }}>현실의 나를 디지털 세계로 연결하는 AI 플랫폼</p>
          <div className="flex gap-4 text-sm" style={{ color: '#94a3b8' }}>
            <Link to="/terms" style={{ textDecoration: 'none', color: 'inherit' }}>이용 원칙</Link>
            <Link to="/privacy" style={{ textDecoration: 'none', color: 'inherit' }}>개인정보 안내</Link>
            <Link to="/help" style={{ textDecoration: 'none', color: 'inherit' }}>도움말</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
