import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { UserCharacterAsset } from './CharacterAssets';
import { Icon, type IconName } from './Icon';
import { useUser } from '../store/useUser';
import { getRuntimeStatus, listUserNotifications, markUserNotificationRead, openUserNotificationStream, type UserNotification, type UserRuntimeStatus } from '../api/userApi';

type NavItem = { path: string; label: string; icon: IconName; color: string };

const navItems: NavItem[] = [
  { path: '/world', label: '내 세계', icon: 'home', color: '#3b82f6' },
  { path: '/idea-lab', label: 'Idea Lab', icon: 'lightbulb', color: '#f59e0b' },
  { path: '/projects', label: '프로젝트 작업실', icon: 'bolt', color: '#6366f1' },
  { path: '/ai-chat', label: 'AI 이설', icon: 'sparkles', color: '#8b5cf6' },
  { path: '/memory', label: '개인 기억', icon: 'brain', color: '#7c3aed' },
  { path: '/learning', label: '학습 공간', icon: 'book', color: '#10b981' },
  { path: '/teams', label: '팀 · 스터디', icon: 'users', color: '#f43f5e' },
  { path: '/community', label: '커뮤니티 광장', icon: 'globe', color: '#0ea5e9' },
  { path: '/friends', label: '친구 · 메시지', icon: 'message', color: '#ec4899' },
  { path: '/activity', label: '활동 기록', icon: 'chart', color: '#f97316' },
  { path: '/portfolio', label: '포트폴리오', icon: 'palette', color: '#14b8a6' },
  { path: '/settings', label: '설정', icon: 'settings', color: '#64748b' },
];
const mobileMenuItems = [{ path: '/character', label: '캐릭터', icon: 'character' as IconName, color: '#8b5cf6' }, { path: '/profile', label: '프로필', icon: 'user' as IconName, color: '#0ea5e9' }, ...navItems];

function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    void listUserNotifications().then((result) => {
      if (!active) return;
      setNotifications(result.notifications.slice(0, 12));
      setUnreadCount(result.unreadCount);
    }).catch(() => { /* the shell remains usable when the notification endpoint is unavailable */ });
    const closeStream = openUserNotificationStream(() => { if (active) void refresh(); }, () => { if (active) void refresh(); });
    return () => { active = false; closeStream(); };
  }, []);

  async function refresh() {
    try {
      const result = await listUserNotifications();
      setNotifications(result.notifications.slice(0, 12));
      setUnreadCount(result.unreadCount);
    } catch { /* preserve the last durable view */ }
  }

  async function openNotification(notification: UserNotification) {
    if (!notification.readAt) {
      try {
        await markUserNotificationRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch { /* keep the unread state visible when the read transition fails */ }
    }
    setOpen(false);
    if (notification.source.type === 'team-message' || notification.source.type === 'team-invite') navigate('/teams');
    else if (notification.source.type === 'community-comment') navigate('/community');
    else if (notification.source.type === 'direct-message') navigate('/friends');
    else if (notification.source.type === 'ai-completion') navigate('/ai-chat');
    else if (notification.source.type === 'achievement') navigate('/character');
    else navigate('/world');
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="notification-bell"
        aria-label={unreadCount > 0 ? `알림 ${unreadCount}개` : '알림'}
        aria-expanded={open}
        onClick={() => { setOpen((current) => !current); if (!open) void refresh(); }}
        className="relative w-9 h-9 rounded-xl border-2 border-blue-100 bg-white text-base hover:bg-blue-50 transition-colors"
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && <span aria-label="읽지 않은 알림" className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-rose-500 px-1 text-[10px] leading-4 font-black text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="알림" className="absolute left-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-blue-100 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-sm font-black" style={{ color: '#0f1b35' }}>알림</p>
            <span className="text-xs font-semibold text-slate-400">읽지 않음 {unreadCount}</span>
          </div>
          {notifications.length === 0 ? (
            <p role="status" className="rounded-xl bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">새 알림이 없습니다.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`block w-full rounded-xl p-3 text-left transition-colors hover:bg-blue-50 ${notification.readAt ? 'bg-white' : 'bg-blue-50/70'}`}>
                  <span className="flex items-center gap-2 text-xs font-black text-slate-800"><span className={`h-2 w-2 rounded-full ${notification.readAt ? 'bg-slate-200' : 'bg-blue-500'}`} />{notification.title}</span>
                  <span className="mt-1 block text-xs font-medium text-slate-500">{notification.body}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const profile = useUser();
  const [aiChatStatus, setAiChatStatus] = useState<UserRuntimeStatus['aiChat'] | 'unknown'>('unknown');

  useEffect(() => {
    let active = true;
    void getRuntimeStatus().then(({ runtime }) => {
      if (active) setAiChatStatus(runtime.aiChat);
    }).catch(() => {
      if (active) setAiChatStatus('unknown');
    });
    return () => { active = false; };
  }, []);
  const aiRuntimeLabel = aiChatStatus === 'ready'
    ? 'AI Runtime 준비'
    : aiChatStatus === 'unavailable'
      ? 'AI Runtime 연결 대기'
      : 'AI Runtime 상태 확인 중';

  return (
    <aside className="w-64 min-h-screen bg-white border-r-2 border-blue-100 flex flex-col" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="p-5 border-b-2 border-blue-100 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', fontFamily: 'var(--font-display)' }}>이</div>
          <span className="text-xl font-black" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NPC</span>
        </Link>
        <NotificationBell />
      </div>

      <div className="px-4 py-3 border-b-2 border-blue-100">
        <Link to="/character" className="flex items-center gap-3 rounded-xl p-2 hover:bg-blue-50 transition-colors no-underline group">
          <div className="relative">
            <UserCharacterAsset size={40} alt="내 캐릭터" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center text-xs font-bold text-white">{profile.level}</div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: '#0f1b35' }}>{profile.name || '불러오는 중…'}</p>
            <div className="mt-1 xp-bar-track">
              <div className="xp-bar-fill" style={{ width: `${Math.min(100, profile.xpMax ? profile.xp / profile.xpMax * 100 : 0)}%` }}/>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{profile.xp.toLocaleString()} / {profile.xpMax.toLocaleString()} XP</p>
          </div>
        </Link>
        <Link to="/profile" className="mt-2 block rounded-xl px-2 py-1.5 text-center text-xs font-bold text-blue-600 no-underline hover:bg-blue-50">공개 프로필 편집</Link>
      </div>

      <div className="px-4 py-2 border-b-2 border-blue-100">
        <div className="flex rounded-xl overflow-hidden border-2 border-blue-100">
          <Link to="/world" aria-label="개인 공간" aria-current={location.pathname.startsWith('/teams') ? undefined : 'page'} className="flex-1 text-center text-xs py-1.5 font-bold no-underline" style={{ background: 'linear-gradient(135deg, #dbeafe, #ede9fe)', color: '#2563eb' }}>개인 공간</Link>
          <Link to="/teams" aria-current={location.pathname.startsWith('/teams') ? 'page' : undefined} className="flex-1 text-center text-xs py-1.5 font-semibold text-slate-400 hover:text-slate-600 transition-colors no-underline">팀 공간</Link>
        </div>
      </div>

      <nav aria-label="주요 메뉴" className="flex-1 overflow-y-auto p-3 space-y-0.5 panel-scroll">
        {navItems.map(item => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
            <Link key={item.path} to={item.path} aria-current={isActive ? 'page' : undefined} className={`nav-item ${isActive ? 'active' : ''}`} style={isActive ? { background: `linear-gradient(135deg, ${item.color}18, ${item.color}10)`, color: item.color } : {}}>
              <span className="flex h-6 w-6 items-center justify-center"><Icon name={item.icon} size={18} /></span>
              <span>{item.label}</span>
                  {item.path === '/ai-chat' && <span className="ml-auto w-2 h-2 rounded-full" aria-label={aiRuntimeLabel} style={{ background: aiChatStatus === 'ready' ? '#22c55e' : '#fbbf24' }} title={aiRuntimeLabel}/>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t-2 border-blue-100 space-y-1">
        <Link to="/integrations" className="nav-item text-xs">
          <span className="flex h-5 w-5 items-center justify-center"><Icon name="plug" size={16} /></span>
          <span>연동 및 실행 환경</span>
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#f1f5f9', color: '#64748b', fontSize: '9px' }}>상태 확인</span>
        </Link>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuCloseButtonRef = useRef<HTMLButtonElement>(null);
  const menuDialogRef = useRef<HTMLDivElement>(null);
  const mobileItems = navItems.slice(0, 5);

  useEffect(() => {
    if (!menuOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuCloseButtonRef.current?.focus();
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
      else menuTriggerRef.current?.focus();
    };
  }, [menuOpen]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
      return;
    }
    if (event.key !== 'Tab' || !menuDialogRef.current) return;
    const focusable = Array.from(menuDialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      {/* Full-screen overlay menu */}
      {menuOpen && (
        <div
          ref={menuDialogRef}
          id="mobile-navigation-menu"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-navigation-title"
          onKeyDown={handleMenuKeyDown}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(15,27,53,0.95)', fontFamily: 'var(--font-body)' }}
        >
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white text-sm" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>이</div>
              <span id="mobile-navigation-title" className="text-lg font-black text-white" style={{ fontFamily: 'var(--font-display)' }}>ISEOL 전체 메뉴</span>
            </div>
            <button type="button" ref={menuCloseButtonRef} onClick={() => setMenuOpen(false)} className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xl" style={{ background: 'rgba(255,255,255,0.15)' }} aria-label="메뉴 닫기"><Icon name="x" size={20} /></button>
          </div>
          <div className="flex-1 overflow-auto px-4 pb-8 grid grid-cols-2 gap-3 content-start mt-2">
            {mobileMenuItems.map(item => {
              const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 p-4 rounded-2xl no-underline transition-all"
                  style={{ background: isActive ? `${item.color}25` : 'rgba(255,255,255,0.08)', border: `2px solid ${isActive ? item.color : 'transparent'}` }}
                >
                  <span className="flex h-8 w-8 items-center justify-center"><Icon name={item.icon} size={24} /></span>
                  <span className="text-sm font-bold text-white">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <nav aria-label="모바일 주요 메뉴" className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-blue-100 flex z-40 md:hidden">
        {mobileItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} className="flex-1 flex flex-col items-center py-2 gap-0.5 no-underline">
              <span className="flex h-6 items-center"><Icon name={item.icon} size={20} /></span>
              <span className="font-semibold truncate w-full text-center px-1" style={{ color: isActive ? item.color : '#94a3b8', fontSize: '11px' }}>
                {item.label.split(' ')[0]}
              </span>
            </Link>
          );
        })}
            <button
              type="button"
              ref={menuTriggerRef}
              onClick={() => setMenuOpen(true)}
              className="flex-1 flex flex-col items-center py-2 gap-0.5"
              aria-label="전체 메뉴 열기"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation-menu"
              aria-haspopup="dialog"
            >
          <span className="flex h-6 items-center"><Icon name="menu" size={20} /></span>
          <span className="font-semibold" style={{ color: '#94a3b8', fontSize: '11px' }}>더 보기</span>
        </button>
      </nav>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile.status === 'unauthenticated') navigate('/login', { replace: true });
  }, [navigate, profile.status]);

  if (profile.status === 'unauthenticated') {
    return <main className="min-h-screen bg-slate-50 p-6" aria-label="인증 필요"><p role="status" className="mx-auto max-w-md rounded-xl bg-white p-5 text-sm font-semibold text-slate-600">로그인이 필요합니다.</p></main>;
  }

  return (
    <div className="responsive-shell flex min-h-screen" style={{ background: '#e8f5ff' }}>
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <main className="responsive-main flex-1 min-h-screen overflow-auto pb-16 md:pb-0">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
