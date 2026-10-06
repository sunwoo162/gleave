import { Link } from 'react-router';
import { AICharacter } from '../components/Character';
import { Icon } from '../components/Icon';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8" style={{ fontFamily: 'var(--font-body)', background: '#e8f5ff' }}>
      <div className="float-anim mb-6"><AICharacter size={120}/></div>
      <h1 className="text-7xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>404</h1>
      <h2 className="text-2xl font-bold mb-3" style={{ color: '#0f1b35' }}>페이지를 찾을 수 없어요</h2>
      <p className="text-base mb-8 max-w-sm" style={{ color: '#64748b' }}>요청한 페이지가 존재하지 않거나 이동됐어요. AI 이설이 길을 잃었나봐요!</p>
      <div className="flex gap-3 flex-wrap justify-center">
        <Link to="/world" className="px-6 py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', textDecoration: 'none' }}>
          <Icon name="home" size={17} /> 내 세계로 돌아가기
        </Link>
        <Link to="/" className="px-6 py-3 rounded-xl font-bold border-2 border-blue-200" style={{ color: '#3b82f6', textDecoration: 'none' }}>
          랜딩 페이지
        </Link>
      </div>
    </div>
  );
}
