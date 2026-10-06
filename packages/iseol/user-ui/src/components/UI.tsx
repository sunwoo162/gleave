// Reusable UI components for ISEOL

import React from 'react';
import { Icon, type IconName } from './Icon';

// XP Bar
export function XPBar({ current, max, showLabel = true }: { current: number; max: number; showLabel?: boolean }) {
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div>
      <div className="xp-bar-track">
        <div className="xp-bar-fill" style={{ width: `${pct}%` }}/>
      </div>
      {showLabel && <p className="text-xs mt-1" style={{ color: '#64748b', fontFamily: 'var(--font-body)' }}>{current.toLocaleString()} / {max.toLocaleString()} XP</p>}
    </div>
  );
}

// Level Badge
export function LevelBadge({ level, size = 'md' }: { level: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' };
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-black border-2 border-white`} style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: 'white', fontFamily: 'var(--font-display)', boxShadow: '0 2px 8px rgba(245,158,11,0.4)' }}>
      {level}
    </div>
  );
}

// Status Badge
export function StatusBadge({ status }: { status: 'running' | 'success' | 'error' | 'warning' | 'pending' | 'unknown' }) {
  const map = {
    running: { label: '실행 중', icon: 'rotate' as IconName, cls: 'status-running' },
    success: { label: '성공', icon: 'check' as IconName, cls: 'status-success' },
    error: { label: '오류', icon: 'x' as IconName, cls: 'status-error' },
    warning: { label: '확인 필요', icon: 'alertTriangle' as IconName, cls: 'status-warning' },
    pending: { label: '대기 중', icon: 'clock' as IconName, cls: 'status-pending' },
    unknown: { label: '확인 불가', icon: 'help' as IconName, cls: 'status-pending' },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${s.cls}`}>
      <Icon name={s.icon} size={13} />
      {s.label}
    </span>
  );
}

// Section Header
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-xl font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{title}</h2>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// Achievement Badge
export function AchievementBadge({ icon, label, color, locked = false }: { icon: string; label: string; color: string; locked?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 ${locked ? 'opacity-40' : ''}`}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: locked ? '#f1f5f9' : `${color}20`, border: `2px solid ${locked ? '#e2e8f0' : color}` }}>
        {locked ? <Icon name="lock" size={20} /> : icon}
      </div>
      <span className="text-xs font-semibold text-center" style={{ color: '#475569', maxWidth: '60px', lineHeight: 1.2 }}>{label}</span>
    </div>
  );
}

// Mission Item: status is a persisted-record signal, not a fabricated progress or XP reward.
export function MissionItem({ icon, title, state, detail }: { icon: IconName; title: string; state: 'recorded' | 'next-action'; detail?: string }) {
  const recorded = state === 'recorded';
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${recorded ? 'border-sky-200 bg-sky-50' : 'border-amber-200 bg-amber-50'}`}>
      <Icon name={icon} size={21} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: recorded ? '#075985' : '#92400e' }}>{title}</p>
        <p className="text-xs mt-1" style={{ color: '#64748b' }}>{detail ?? (recorded ? '저장된 기록' : '다음 행동')}</p>
      </div>
      <div className="flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg" style={{ background: recorded ? '#e0f2fe' : '#fef3c7', color: recorded ? '#075985' : '#92400e' }}>{recorded ? '기록 있음' : '열기'}</div>
    </div>
  );
}

// Project Card
export function ProjectCard({ name, desc, tags, status, members, lastEdit, onClick }: {
  name: string; desc: string; tags: string[]; status: 'running' | 'success' | 'pending';
  members: number; lastEdit: string; onClick?: () => void;
}) {
  const tagColors: Record<string, string> = {
    'React': '#3b82f6', 'TypeScript': '#6366f1', 'Node.js': '#10b981',
    'Python': '#f59e0b', 'AI': '#8b5cf6', '팀': '#f43f5e', '개인': '#0ea5e9',
    'CSS': '#ec4899', 'DB': '#14b8a6',
  };
  return (
    <div className="card-game p-4 cursor-pointer" onClick={onClick}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{name}</h3>
          <p className="text-sm mt-0.5 line-clamp-2" style={{ color: '#64748b' }}>{desc}</p>
        </div>
        <StatusBadge status={status}/>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.map(t => (
          <span key={t} className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${tagColors[t] || '#64748b'}15`, color: tagColors[t] || '#64748b' }}>{t}</span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs" style={{ color: '#94a3b8' }}>
        <span className="inline-flex items-center gap-1"><Icon name="users" size={14} /> {members}명</span>
        <span>{lastEdit}</span>
      </div>
    </div>
  );
}

// Stat Card
export function StatCard({ icon, label, value, color, sub }: { icon: IconName; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="card-game p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${color}15` }}>
          <Icon name={icon} size={21} />
        </div>
        <div>
          <p className="text-xs font-semibold" style={{ color: '#94a3b8' }}>{label}</p>
          <p className="text-xl font-black" style={{ fontFamily: 'var(--font-display)', color }}>{value}</p>
        </div>
      </div>
      {sub && <p className="text-xs" style={{ color: '#64748b' }}>{sub}</p>}
    </div>
  );
}

// Pill Button
export function Btn({ children, onClick, variant = 'primary', size = 'md', className = '', disabled = false }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'violet' | 'mint' | 'coral' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg'; className?: string; disabled?: boolean;
}) {
  const variants = {
    primary: 'text-white hover:opacity-90',
    secondary: 'bg-blue-50 text-blue-700 border-2 border-blue-200 hover:bg-blue-100',
    violet: 'text-white hover:opacity-90',
    mint: 'text-white hover:opacity-90',
    coral: 'text-white hover:opacity-90',
    ghost: 'bg-transparent text-slate-600 border-2 border-slate-200 hover:bg-slate-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  };
  const bgs = {
    primary: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    secondary: '',
    violet: 'linear-gradient(135deg, #7c3aed, #6366f1)',
    mint: 'linear-gradient(135deg, #10b981, #0891b2)',
    coral: 'linear-gradient(135deg, #f43f5e, #ec4899)',
    ghost: '',
    danger: '',
  };
  const sizes = { sm: 'text-xs px-3 py-1.5 rounded-lg', md: 'text-sm px-4 py-2 rounded-xl', lg: 'text-base px-6 py-3 rounded-xl' };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-bold transition-all active:scale-95 ${variants[variant]} ${sizes[size]} ${className}`}
      style={{ background: bgs[variant] || undefined, fontFamily: 'var(--font-body)' }}
    >
      {children}
    </button>
  );
}

// Empty State
export function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{title}</h3>
      <p className="text-sm max-w-xs" style={{ color: '#64748b', lineHeight: 1.6 }}>{desc}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// Chat bubble
export function ChatBubble({ role, text, time }: { role: 'user' | 'ai'; text: string; time: string }) {
  const isAI = role === 'ai';
  return (
    <div className={`flex gap-3 ${isAI ? '' : 'flex-row-reverse'}`}>
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm" style={{ background: isAI ? 'linear-gradient(135deg, #7c3aed, #6366f1)' : 'linear-gradient(135deg, #3b82f6, #0ea5e9)', color: 'white' }}>
        {isAI ? <Icon name="sparkles" size={16} /> : '나'}
      </div>
      <div className={`max-w-xs lg:max-w-sm ${isAI ? '' : 'items-end'} flex flex-col gap-1`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isAI ? 'rounded-tl-sm' : 'rounded-tr-sm'}`} style={{ background: isAI ? '#f5f3ff' : 'linear-gradient(135deg, #dbeafe, #ede9fe)', color: '#0f1b35' }}>
          {text}
        </div>
        <span className="text-xs" style={{ color: '#94a3b8' }}>{time}</span>
      </div>
    </div>
  );
}
