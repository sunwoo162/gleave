import { Link } from 'react-router';
import { AICompanionAsset } from '../components/CharacterAssets';
import { Icon, type IconName } from '../components/Icon';

type InformationKind = 'terms' | 'privacy' | 'help';

const content: Record<InformationKind, {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  sections: Array<{ title: string; body: string }>;
}> = {
  terms: {
    eyebrow: 'NPC SERVICE GUIDE',
    title: '이용 원칙',
    description: 'NPC의 현재 제품 동작과 사용자 확인이 필요한 경계를 안내합니다.',
    icon: 'shield',
    sections: [
      { title: '사용자 기록의 주체', body: '프로젝트, 학습, 협업, 활동, 포트폴리오 기록은 인증된 사용자 계정에 귀속됩니다. NPC는 실제로 저장되고 검증된 기록만 성장이나 포트폴리오 근거로 표시합니다.' },
      { title: 'AI 제안과 실행', body: '개인 AI의 설명과 실행 계획은 제안 또는 대기 상태로 저장될 수 있으며, 사용자가 승인한 작업만 기존 실행 권한 경계를 통과합니다. AI 응답이 곧 파일 변경이나 배포 성공을 의미하지 않습니다.' },
      { title: '공개 범위', body: '포트폴리오는 비공개, 링크 공유, 전체 공개 범위를 사용자가 선택합니다. 공개 항목에서도 내부 사용자 식별자와 개인 원장 세부 정보는 공개 모델에 포함하지 않습니다.' },
      { title: '현재 제공 범위', body: '외부 연동과 로컬 Runtime의 실제 가용성은 환경에 따라 달라집니다. 연결되지 않은 기능은 성공으로 표시하지 않으며, AI 방송실은 현재 제품 범위에서 보류되어 있습니다.' },
    ],
  },
  privacy: {
    eyebrow: 'NPC DATA GUIDE',
    title: '개인정보 및 데이터 범위',
    description: '개인 세계와 협업 데이터가 어떤 경계로 분리되는지 안내합니다.',
    icon: 'lock',
    sections: [
      { title: '개인 영역', body: '계정, 캐릭터, 개인 AI 프로필, 장기 기억, 학습 세션과 개인 활동은 인증된 사용자 범위로 읽고 씁니다. 다른 사용자의 개인 원장이나 기억을 일반 사용자 화면에서 조회하지 않습니다.' },
      { title: '공유 영역', body: '팀, 스터디, 친구 메시지, 커뮤니티와 공개 포트폴리오는 각각의 멤버십·친구·공개 범위 규칙을 따릅니다. 개인 메시지와 팀 공유 정보는 별도 영역으로 유지됩니다.' },
      { title: '로컬 AI와 Runtime', body: '개인 AI 맥락은 사용자의 설정과 선택된 범위 안에서만 구성됩니다. 외부 AI 요청을 기본 동작으로 만들지 않으며, 연결되지 않은 Runtime이나 UNKNOWN 상태를 성공으로 기록하지 않습니다.' },
      { title: '사용자 관리', body: '설정에서 지원되는 권한, 알림, 개인정보 공개 범위를 변경할 수 있습니다. 현재 화면에 없는 삭제·외부 연동 기능을 제공되는 것처럼 표시하지 않습니다.' },
    ],
  },
  help: {
    eyebrow: 'NPC HELP DESK',
    title: '도움말',
    description: '처음 시작할 때의 흐름과 상태 표시를 빠르게 확인하세요.',
    icon: 'question',
    sections: [
      { title: '처음 시작하기', body: '회원가입 후 온보딩에서 이름과 관심사를 저장하면 내 세계, 캐릭터, 개인 AI 화면으로 이동합니다. 아직 활동이 없다면 성장 수치와 업적은 비어 있는 상태로 표시됩니다.' },
      { title: '프로젝트', body: 'Idea Lab에서 아이디어와 요구사항을 저장한 뒤 프로젝트 작업실에서 작업 요청과 승인 상태를 확인합니다. Runtime이 연결되지 않으면 실행 결과 대신 대기 또는 확인 불가 상태가 표시됩니다.' },
      { title: '학습과 포트폴리오', body: '학습 목표를 만들고 계획·세션·복습을 기록할 수 있습니다. 검증된 학습 보고서만 포트폴리오 근거로 선택되며, 사용자가 편집하고 공개하기 전까지 초안은 비공개입니다.' },
      { title: '상태가 대기 중일 때', body: 'WAITING_AGENT, WAITING_EXTERNAL, UNKNOWN, 승인 대기는 실패나 성공으로 임의 변환되지 않습니다. 설정의 Runtime 상태와 각 작업실의 안내를 확인하고, 연결이 필요한 작업은 해당 환경이 준비된 뒤 다시 시도하세요.' },
    ],
  },
};

export function InformationPage({ kind }: { kind: InformationKind }) {
  const page = content[kind];
  return <main className="min-h-screen p-6 md:p-12" style={{ background: '#e8f5ff', fontFamily: 'var(--font-body)' }}>
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 no-underline" aria-label="NPC 랜딩 페이지로 이동">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>이</span>
          <span className="text-xl font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>NPC</span>
        </Link>
        <nav aria-label="정보 페이지 메뉴" className="flex gap-3 text-sm font-bold">
          <Link to="/help" className="text-blue-600 no-underline">도움말</Link>
          <Link to="/login" className="text-slate-600 no-underline">로그인</Link>
        </nav>
      </header>
      <article className="card-game overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 border-b border-blue-100 bg-white p-6 md:p-9">
          <div className="rounded-2xl bg-violet-50 p-3 text-violet-700"><Icon name={page.icon} size={28} /></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-black tracking-widest text-blue-500">{page.eyebrow}</p><h1 className="mt-2 text-3xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>{page.title}</h1><p className="mt-2 text-sm leading-7 text-slate-600">{page.description}</p></div>
          <AICompanionAsset size={72} alt="NPC 개인 AI 동반자" />
        </div>
        <div className="space-y-4 bg-slate-50 p-6 md:p-9">
          {page.sections.map((section) => <section key={section.title} className="rounded-2xl border border-blue-100 bg-white p-5"><h2 className="text-base font-black text-slate-900">{section.title}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p></section>)}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 bg-white p-6 text-sm"><span className="text-slate-500">현재 제품 동작 기준 안내 · 기능 상태는 실제 연결 여부를 따릅니다.</span><Link to="/signup" className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white no-underline">NPC 시작하기</Link></footer>
      </article>
    </div>
  </main>;
}

export function TermsPage() { return <InformationPage kind="terms" />; }
export function PrivacyPage() { return <InformationPage kind="privacy" />; }
export function HelpPage() { return <InformationPage kind="help" />; }
