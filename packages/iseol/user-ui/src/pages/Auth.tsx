import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { UserCharacterAsset, AICompanionAsset } from '../components/CharacterAssets';
import { Btn } from '../components/UI';
import { Icon } from '../components/Icon';
import { getWorld, logIn, signUp, UserApiError } from '../api/userApi';
import { setProfile } from '../store/userStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthLayout({ children, side }: { children: React.ReactNode; side: 'login' | 'signup' }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="hidden md:flex flex-col items-center justify-center p-12 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95)' }}>
        <div className="absolute inset-0 opacity-20">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="absolute rounded-full" style={{ width: Math.random()*8+4, height: Math.random()*8+4, left: `${Math.random()*100}%`, top: `${Math.random()*100}%`, background: ['#60a5fa','#a78bfa','#34d399','#fbbf24','#fb7185'][i%5], opacity: 0.6 }}/>
          ))}
        </div>
        <div className="relative text-center">
          <div className="flex justify-center gap-8 mb-8">
            <div className="float-anim"><UserCharacterAsset size={100}/></div>
            <div className="float-anim" style={{ animationDelay: '1.2s' }}><AICompanionAsset size={100}/></div>
          </div>
          <h2 className="text-3xl font-black text-white mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            {side === 'login' ? 'NPC 세계에 돌아오세요' : '나만의 세계를 시작해요'}
          </h2>
          <p className="text-indigo-200 leading-relaxed">
            캐릭터와 함께 개발하고, 공부하고,<br/>사람들과 협업하며 성장하세요.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>이</div>
            <span className="text-xl font-black" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(90deg, #2563eb, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NPC</span>
          </div>
          {/* Local account boundary */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-6 text-sm" style={{ background: '#fef3c7', border: '2px solid #fbbf24', color: '#92400e' }}>
            <Icon name="monitor" size={17} />
            <div>
              <strong>로컬 계정</strong> — 계정과 세션은 현재 NPC 로컬 Runtime에 저장됩니다.
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = '이메일을 입력해주세요.';
    else if (!EMAIL_RE.test(email)) e.email = '올바른 이메일 형식이 아닙니다.';
    if (!password) e.password = '비밀번호를 입력해주세요.';
    else if (password.length < 8) e.password = '비밀번호는 8자 이상이어야 합니다.';
    return e;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      await logIn({ email: email.trim(), password });
      const { world } = await getWorld();
      setProfile({ status: 'loading', error: undefined });
      navigate(world.onboardingCompleted ? '/world' : '/onboarding');
    } catch (error) {
      setErrors({ general: error instanceof UserApiError && error.status === 401 ? '이메일 또는 비밀번호를 확인해주세요.' : '로그인 서버에 연결할 수 없습니다.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout side="login">
      <h1 className="text-3xl font-black mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>다시 돌아오셨군요!</h1>
      <p className="text-sm mb-6" style={{ color: '#64748b' }}>계정으로 로그인하고 나만의 세계로 돌아가세요.</p>

      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        {errors.general && <div className="p-3 rounded-xl text-sm font-semibold status-error">{errors.general}</div>}
        <div>
          <label htmlFor="login-email" className="block text-sm font-bold mb-1.5" style={{ color: '#0f1b35' }}>이메일</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: undefined })); }}
            placeholder="hello@example.com"
            autoComplete="email"
            className="w-full px-4 py-3 rounded-xl border-2 outline-none text-sm transition-all"
            style={{ border: `2px solid ${errors.email ? '#f43f5e' : '#bae8ff'}`, color: '#0f1b35' }}
            onFocus={e => e.currentTarget.style.borderColor = errors.email ? '#f43f5e' : '#3b82f6'}
            onBlur={e => e.currentTarget.style.borderColor = errors.email ? '#f43f5e' : '#bae8ff'}
            aria-describedby={errors.email ? 'login-email-err' : undefined}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p id="login-email-err" className="text-xs mt-1 font-semibold" style={{ color: '#f43f5e' }}>{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="login-pw" className="block text-sm font-bold mb-1.5" style={{ color: '#0f1b35' }}>비밀번호</label>
          <div className="relative">
            <input
              id="login-pw"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: undefined })); }}
              placeholder="••••••••"
              autoComplete="current-password"
              minLength={8}
              className="w-full px-4 py-3 pr-12 rounded-xl border-2 outline-none text-sm transition-all"
              style={{ border: `2px solid ${errors.password ? '#f43f5e' : '#bae8ff'}`, color: '#0f1b35' }}
              onFocus={e => e.currentTarget.style.borderColor = errors.password ? '#f43f5e' : '#3b82f6'}
              onBlur={e => e.currentTarget.style.borderColor = errors.password ? '#f43f5e' : '#bae8ff'}
              aria-describedby={errors.password ? 'login-pw-err' : undefined}
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
              style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              <Icon name={showPw ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </div>
          {errors.password && <p id="login-pw-err" className="text-xs mt-1 font-semibold" style={{ color: '#f43f5e' }}>{errors.password}</p>}
          <div className="text-right mt-1.5">
            <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>비밀번호 찾기 — 데모 모드에서는 지원되지 않음</span>
          </div>
        </div>
        <button type="submit" className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
          {loading ? '로그인 중…' : '로그인 → 내 세계로'}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-slate-100"/></div>
        <div className="relative flex justify-center"><span className="px-3 bg-white text-xs font-semibold" style={{ color: '#94a3b8' }}>또는</span></div>
      </div>

      <div className="space-y-3">
        {[{ name: 'GitHub', icon: 'code' as const }, { name: 'Google', icon: 'globe' as const }].map(p => (
          <button
            key={p.name}
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm border-2 border-slate-200 opacity-50 cursor-not-allowed"
            style={{ color: '#0f1b35' }}
            title="지원 예정 — 현재 데모 모드"
          >
            <Icon name={p.icon} size={18} />
            {p.name}로 계속하기 <span className="text-xs ml-1" style={{ color: '#94a3b8' }}>(지원 예정)</span>
          </button>
        ))}
      </div>

      <p className="text-center mt-8 text-sm" style={{ color: '#64748b' }}>
        아직 계정이 없으신가요?{' '}
        <Link to="/signup" style={{ color: '#3b82f6', fontWeight: 700, textDecoration: 'none' }}>회원가입</Link>
      </p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string; general?: string }>({});
  const [creating, setCreating] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = '이름을 입력해주세요.';
    if (!form.email.trim()) errs.email = '이메일을 입력해주세요.';
    else if (!EMAIL_RE.test(form.email)) errs.email = '올바른 이메일 형식이 아닙니다.';
    if (!form.password) errs.password = '비밀번호를 입력해주세요.';
    else if (form.password.length < 8) errs.password = '비밀번호는 8자 이상이어야 합니다.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setStep(2);
  };

  const handleCreateAccount = async () => {
    setCreating(true);
    setErrors({});
    try {
      await signUp({ email: form.email.trim(), displayName: form.name.trim(), password: form.password });
      navigate('/onboarding');
    } catch (error) {
          setErrors({ general: error instanceof UserApiError && error.status === 409 ? '이미 가입된 이메일입니다.' : error instanceof UserApiError && error.status === 400 ? '비밀번호는 8자 이상이어야 합니다.' : '계정을 만들 수 없습니다. 로컬 Runtime 연결을 확인해주세요.' });
    } finally {
      setCreating(false);
    }
  };

  const fieldBorder = (key: keyof typeof errors) => `2px solid ${errors[key] ? '#f43f5e' : '#bae8ff'}`;

  return (
    <AuthLayout side="signup">
      <h1 className="text-3xl font-black mb-2" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>NPC 세계를 시작해요</h1>
      <p className="text-sm mb-6" style={{ color: '#64748b' }}>계정을 만들고 나만의 캐릭터와 세계를 만들어보세요.</p>

      <div className="flex items-center gap-2 mb-8">
        {[1,2].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={step >= s ? { background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white' } : { border: '2px solid #e2e8f0', color: '#94a3b8' }}>{s}</div>
            {s < 2 && <div className="h-1 rounded w-16" style={{ background: step > s ? '#3b82f6' : '#e2e8f0' }}/>}
          </div>
        ))}
        <span className="ml-2 text-xs" style={{ color: '#64748b' }}>{step === 1 ? '기본 정보' : '이메일 확인'}</span>
      </div>

      {step === 1 ? (
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div>
            <label htmlFor="signup-name" className="block text-sm font-bold mb-1.5" style={{ color: '#0f1b35' }}>이름 (표시 이름)</label>
            <input id="signup-name" type="text" placeholder="이설이" autoComplete="name" value={form.name} onChange={e => { setForm(f => ({...f, name: e.target.value})); setErrors(p => ({...p, name: undefined})); }} className="w-full px-4 py-3 rounded-xl border-2 outline-none text-sm" style={{ border: fieldBorder('name'), color: '#0f1b35' }} onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'} onBlur={e => e.currentTarget.style.borderColor = errors.name ? '#f43f5e' : '#bae8ff'} aria-invalid={!!errors.name}/>
            {errors.name && <p className="text-xs mt-1 font-semibold" style={{ color: '#f43f5e' }}>{errors.name}</p>}
          </div>
          {/* Email */}
          <div>
            <label htmlFor="signup-email" className="block text-sm font-bold mb-1.5" style={{ color: '#0f1b35' }}>이메일</label>
            <input id="signup-email" type="email" placeholder="hello@example.com" autoComplete="email" value={form.email} onChange={e => { setForm(f => ({...f, email: e.target.value})); setErrors(p => ({...p, email: undefined})); }} className="w-full px-4 py-3 rounded-xl border-2 outline-none text-sm" style={{ border: fieldBorder('email'), color: '#0f1b35' }} onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'} onBlur={e => e.currentTarget.style.borderColor = errors.email ? '#f43f5e' : '#bae8ff'} aria-invalid={!!errors.email}/>
            {errors.email && <p className="text-xs mt-1 font-semibold" style={{ color: '#f43f5e' }}>{errors.email}</p>}
          </div>
          {/* Password */}
          <div>
            <label htmlFor="signup-pw" className="block text-sm font-bold mb-1.5" style={{ color: '#0f1b35' }}>비밀번호</label>
            <div className="relative">
              <input id="signup-pw" type={showPw ? 'text' : 'password'} placeholder="8자 이상" autoComplete="new-password" value={form.password} onChange={e => { setForm(f => ({...f, password: e.target.value})); setErrors(p => ({...p, password: undefined})); }} className="w-full px-4 py-3 pr-12 rounded-xl border-2 outline-none text-sm" style={{ border: fieldBorder('password'), color: '#0f1b35' }} onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'} onBlur={e => e.currentTarget.style.borderColor = errors.password ? '#f43f5e' : '#bae8ff'} aria-invalid={!!errors.password}/>
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }} aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}><Icon name={showPw ? 'eyeOff' : 'eye'} size={18} /></button>
            </div>
            {errors.password && <p className="text-xs mt-1 font-semibold" style={{ color: '#f43f5e' }}>{errors.password}</p>}
          </div>
          <button type="submit" className="w-full py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
            다음 단계 →
          </button>
        </form>
      ) : (
        <div className="text-center space-y-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto" style={{ background: '#f0fdf4', border: '3px solid #86efac' }}><Icon name="mail" size={34} /></div>
          <div>
            <h3 className="font-bold text-lg mb-1" style={{ color: '#0f1b35' }}>이메일을 확인해주세요</h3>
            <p className="text-sm" style={{ color: '#64748b' }}><strong>{form.email}</strong>으로 확인 링크를 보냈어요.</p>
            <p className="text-xs mt-2 px-3 py-1.5 rounded-lg inline-block" style={{ background: '#fef3c7', color: '#92400e' }}>현재는 로컬 계정이 즉시 생성됩니다. 외부 이메일 인증은 아직 연결되지 않았습니다.</p>
          </div>
          {errors.general && <div className="p-3 rounded-xl text-sm font-semibold status-error">{errors.general}</div>}
          <div className="space-y-3">
            <button onClick={handleCreateAccount} disabled={creating} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
              {creating ? '계정 생성 중…' : <><Icon name="check" size={16} />계정 생성 → 세계 만들기</>}
            </button>
            <Btn variant="ghost" className="w-full" disabled>외부 이메일 인증은 지원 예정</Btn>
          </div>
        </div>
      )}

      {step === 1 && (
        <p className="text-center mt-6 text-sm" style={{ color: '#64748b' }}>
          이미 계정이 있으신가요?{' '}
          <Link to="/login" style={{ color: '#3b82f6', fontWeight: 700, textDecoration: 'none' }}>로그인</Link>
        </p>
      )}
    </AuthLayout>
  );
}
