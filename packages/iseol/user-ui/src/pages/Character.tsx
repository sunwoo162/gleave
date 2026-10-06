import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AppShell } from '../components/Navigation';
import { UserCharacter } from '../components/Character';
import { UserCharacterAsset } from '../components/CharacterAssets';
import { Icon, type IconName } from '../components/Icon';
import { LevelBadge, XPBar } from '../components/UI';
import { updateCharacter } from '../api/userApi';
import { useUser } from '../store/useUser';
import { loadProfile } from '../store/userStore';
import { userFacingError } from '../errorMessage';

const accessories = [
  { id: 'cap', name: '블루 캡', icon: '🧢', unlocked: true },
  { id: 'glasses', name: '안경', icon: '👓', unlocked: true },
  { id: 'headphones', name: '헤드폰', icon: '🎧', unlocked: true },
  { id: 'crown', name: '왕관', icon: '👑', unlocked: false },
  { id: 'cape', name: '망토', icon: '🦸', unlocked: false },
];

const roomItems = [
  { id: 'plant', name: '화분', icon: '🪴', unlocked: true },
  { id: 'trophy', name: '트로피', icon: '🏆', unlocked: true },
  { id: 'lamp', name: '조명', icon: '💡', unlocked: true },
  { id: 'potion', name: '포션', icon: '🧪', unlocked: false },
  { id: 'magic', name: '마법봉', icon: '🪄', unlocked: false },
];

const appearanceFields = [
  { key: 'hairStyle', label: '헤어스타일', options: [['blue-wave', '블루 웨이브'], ['violet-bob', '바이올렛 보브'], ['mint-curl', '민트 컬']] },
  { key: 'skinTone', label: '피부톤', options: [['default', '기본'], ['warm', '따뜻한 톤'], ['cool', '차분한 톤']] },
  { key: 'outfit', label: '의상', options: [['blue-hoodie', '블루 후디'], ['violet-jacket', '바이올렛 재킷'], ['mint-sweater', '민트 스웨터']] },
  { key: 'shoes', label: '신발', options: [['sneakers', '스니커즈'], ['boots', '부츠'], ['slippers', '슬리퍼']] },
] as const;
type AppearanceKey = typeof appearanceFields[number]['key'];
type AppearanceDraft = Record<AppearanceKey, string>;
const defaultAppearance: AppearanceDraft = { hairStyle: 'blue-wave', skinTone: 'default', outfit: 'blue-hoodie', shoes: 'sneakers' };

export function CharacterDetail() {
  const profile = useUser();
  const growth = profile.growth;
  const stats = [
    { label: '개발', value: growth?.stats.development ?? 0, icon: 'code' as IconName, color: '#6366f1', note: growth ? '검증된 증거 기반' : '성장 API 연결 대기' },
    { label: '학습', value: growth?.stats.learning ?? 0, icon: 'book' as IconName, color: '#10b981', note: growth ? '검증된 증거 기반' : '성장 API 연결 대기' },
    { label: '협업', value: growth?.stats.collaboration ?? 0, icon: 'users' as IconName, color: '#f43f5e', note: growth ? '검증된 증거 기반' : '성장 API 연결 대기' },
    { label: '꾸준함', value: growth?.stats.consistency ?? 0, icon: 'rotate' as IconName, color: '#f59e0b', note: growth ? '검증된 증거 기반' : '성장 API 연결 대기' },
  ];

  return (
    <AppShell>
      <div className="p-6 md:p-8" style={{ fontFamily: 'var(--font-body)' }}>
        <div className="grid md:grid-cols-3 gap-8">
          {/* Character display */}
          <div className="md:col-span-1">
            <div className="card-game p-6 text-center" style={{ background: 'linear-gradient(180deg, #e0f2fe, #ede9fe)' }}>
              <div className="float-anim flex justify-center mb-4">
                <UserCharacterAsset size={140}/>
              </div>
              <div className="flex items-center justify-center gap-3 mb-2">
                <LevelBadge level={profile.level} size="lg"/>
                <div>
                  <p className="font-black text-xl" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{profile.name || '내 캐릭터'}</p>
                  <p className="text-xs" style={{ color: '#64748b' }}>{profile.handle ? `@${profile.handle}` : '사용자 데이터 대기'}</p>
                </div>
              </div>
              <XPBar current={profile.xp} max={profile.xpMax}/>
              <p className="text-xs mt-1 mb-4" style={{ color: '#64748b' }}>성장 기록은 검증된 활동이 저장된 뒤 표시됩니다.</p>
              <Link to="/character/customize" className="block w-full py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)', textDecoration: 'none' }}>
                <span className="inline-flex items-center justify-center gap-2"><Icon name="edit" size={16} /> 캐릭터 꾸미기</span>
              </Link>
            </div>
          </div>

          {/* Stats and history */}
          <div className="md:col-span-2 space-y-6">
            {/* Activity stats */}
            <div className="card-game p-5">
              <p className="font-bold text-sm mb-4" style={{ color: '#0f1b35' }}>활동 기반 성장 정보</p>
              <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>아래 수치는 실제 활동 기록을 바탕으로 합니다. 특정 능력치가 아니라 누적 활동량을 나타냅니다.</p>
              <div className="space-y-4">
                {stats.map(s => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex" style={{ color: s.color }}><Icon name={s.icon} size={18} /></span>
                        <span className="text-sm font-bold" style={{ color: '#0f1b35' }}>{s.label}</span>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>— {s.note}</span>
                      </div>
                      <span className="text-sm font-bold" style={{ color: s.color }}>{s.value} XP</span>
                    </div>
                    <div className="xp-bar-track">
                      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, s.value))}%`, background: `linear-gradient(90deg, ${s.color}, ${s.color}88)`, borderRadius: 999, transition: 'width 0.6s ease' }}/>
                    </div>
                    <Link to="/activity" className="inline-block text-xs mt-1 font-semibold no-underline" style={{ color: '#3b82f6' }}>→ 활동 내역 보기</Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievements */}
            <div className="card-game p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-sm" style={{ color: '#0f1b35' }}>획득한 업적</p>
                <span className="text-xs" style={{ color: '#64748b' }}>{growth?.achievements.length ?? 0}개 획득</span>
              </div>
              {growth?.achievements.length ? <div className="space-y-3">{growth.achievements.map((achievement) => <div key={achievement.id} className="flex items-start gap-3 rounded-xl bg-amber-50 p-3"><span className="inline-flex text-amber-600" aria-hidden="true"><Icon name="trophy" size={22} /></span><div><p className="text-sm font-bold" style={{ color: '#0f1b35' }}>{achievement.title}</p><p className="mt-1 text-xs" style={{ color: '#64748b' }}>{achievement.description}</p><p className="mt-1 text-[11px] font-semibold" style={{ color: '#92400e' }}>검증 증거 {achievement.evidenceEventIds.length}건</p></div></div>)}</div> : <p className="text-sm" style={{ color: '#64748b' }}>아직 획득한 검증 업적이 없습니다. 실제 활동 기록이 쌓이면 이곳에 표시됩니다.</p>}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export function CharacterCustomize() {
  const profile = useUser();
  const [tab, setTab] = useState<'char' | 'room'>('char');
  const [selectedAcc, setSelectedAcc] = useState('cap');
  const [appearance, setAppearance] = useState<AppearanceDraft>(defaultAppearance);
  const [selectedRooms, setSelectedRooms] = useState<string[]>(['plant']);
  const [initializedUserId, setInitializedUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const characterReady = profile.status === 'ready' && Boolean(profile.id && profile.characterRecord);

  useEffect(() => {
    if (profile.status !== 'ready' || !profile.id || !profile.characterRecord || initializedUserId === profile.id) return;
    const saved = profile.characterRecord.appearance;
    const savedAppearance = { ...defaultAppearance };
    for (const field of appearanceFields) {
      const value = saved[field.key];
      if (typeof value === 'string') savedAppearance[field.key] = value;
    }
    setSelectedAcc(typeof saved.accessory === 'string' ? saved.accessory : 'cap');
    setAppearance(savedAppearance);
    setSelectedRooms(typeof saved.roomItems === 'string' ? saved.roomItems.split(',').filter(Boolean) : ['plant']);
    setInitializedUserId(profile.id);
  }, [initializedUserId, profile.characterRecord, profile.id]);

  const save = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      await updateCharacter({ appearance: { accessory: selectedAcc, ...appearance, roomItems: selectedRooms.join(',') } });
      await loadProfile();
      setSaveMessage('캐릭터 설정을 저장했습니다.');
    } catch (error) {
      setSaveMessage(userFacingError(error, '캐릭터 설정을 저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (saving || !characterReady) return;
    setSelectedAcc('cap');
    setAppearance(defaultAppearance);
    setSelectedRooms(['plant']);
    setSaveMessage('기본 캐릭터 설정으로 되돌렸습니다. 저장하기를 눌러 반영하세요.');
  };

  return (
    <AppShell>
      <div className="p-6 md:p-8" style={{ fontFamily: 'var(--font-body)' }}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>캐릭터 · 공간 꾸미기</h1>
          <div className="flex gap-3">
            <Link to="/character" className="px-4 py-2 rounded-xl font-bold border-2 border-slate-200 text-slate-500 text-sm no-underline">취소</Link>
            <button type="button" onClick={reset} disabled={saving || !characterReady} aria-label="캐릭터 설정 초기화" className="px-4 py-2 rounded-xl font-bold border-2 border-amber-200 text-amber-700 text-sm disabled:opacity-50">초기화</button>
            <button onClick={save} disabled={saving || !characterReady} className="px-4 py-2 rounded-xl font-bold text-white text-sm disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>{saving ? '저장 중…' : '저장하기'}</button>
          </div>
        </div>
        {!characterReady && <p role="status" className="mb-4 p-3 rounded-xl text-sm font-semibold" style={{ background: '#f8fafc', color: '#64748b' }}>캐릭터 설정을 불러오는 중입니다…</p>}
        {saveMessage && <p role="status" className="mb-4 p-3 rounded-xl text-sm font-semibold" style={{ background: '#f0f9ff', color: '#2563eb' }}>{saveMessage}</p>}

        <div className="grid md:grid-cols-5 gap-6">
          {/* Preview */}
          <div className="md:col-span-2">
            <div className="card-game p-8 text-center" style={{ background: 'linear-gradient(180deg, #e0f2fe, #ede9fe, #fce7f3)', minHeight: 320 }}>
              <div className="float-anim flex justify-center mb-4">
                    <UserCharacter size={150} appearance={{ ...appearance, accessory: selectedAcc }}/>
              </div>
              <p className="text-sm font-semibold" style={{ color: '#64748b' }}>변경 미리보기</p>
              <div className="flex justify-center gap-2 mt-3">
                    {accessories.filter(a => a.id === selectedAcc).map(a => <span key={a.id} className="text-2xl" aria-label={`선택한 액세서리 ${a.name}`}>{a.icon}</span>)}
                    {roomItems.filter(item => selectedRooms.includes(item.id)).map(item => <span key={item.id} className="text-2xl" aria-label={`선택한 소품 ${item.name}`}>{item.icon}</span>)}
              </div>
            </div>
          </div>

          {/* Editor */}
          <div className="md:col-span-3">
            <div className="flex gap-2 mb-5">
              {[['char','캐릭터 꾸미기'], ['room','개인 공간 꾸미기']].map(([v,l]) => (
                    <button type="button" key={v} onClick={() => setTab(v as typeof tab)} aria-pressed={tab === v} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: tab === v ? 'linear-gradient(135deg, #7c3aed, #6366f1)' : '#f5f3ff', color: tab === v ? 'white' : '#7c3aed' }}>
                  {l}
                </button>
              ))}
            </div>

            {tab === 'char' && (
              <div className="space-y-5">
                <div className="card-game p-4">
                  <p className="font-bold text-sm mb-3" style={{ color: '#0f1b35' }}>액세서리</p>
                  <div className="grid grid-cols-5 gap-3">
                        {accessories.map(a => (
                          <button type="button" key={a.id} disabled={!a.unlocked || !characterReady || saving} aria-pressed={selectedAcc === a.id} aria-label={`${a.name}${a.unlocked ? '' : ' 잠김'}`} onClick={() => setSelectedAcc(a.id)} className={`rounded-2xl p-3 text-center cursor-pointer transition-all ${!a.unlocked ? 'opacity-50' : ''}`} style={{ border: `2px solid ${selectedAcc === a.id ? '#7c3aed' : '#e0f4ff'}`, background: selectedAcc === a.id ? '#f5f3ff' : 'white' }}>
                            <div className="text-2xl mb-1">{a.unlocked ? a.icon : <Icon name="lock" size={24} />}</div>
                            <p className="text-xs font-semibold" style={{ color: '#475569', fontSize: 9 }}>{a.name}</p>
                          </button>
                        ))}
                  </div>
                </div>
                <div className="card-game p-4">
                  <p className="font-bold text-sm mb-3" style={{ color: '#0f1b35' }}>외형 설정</p>
                  <div className="grid grid-cols-2 gap-3">
                        {appearanceFields.map((field) => (
                          <div key={field.key}>
                            <label htmlFor={`appearance-${field.key}`} className="block text-xs font-bold mb-1" style={{ color: '#94a3b8' }}>{field.label}</label>
                                <select id={`appearance-${field.key}`} aria-label={field.label} value={appearance[field.key]} disabled={!characterReady || saving} onChange={(event) => setAppearance((current) => ({ ...current, [field.key]: event.target.value }))} className="w-full px-3 py-2 rounded-xl border-2 outline-none text-xs disabled:opacity-60" style={{ border: '2px solid #bae8ff', fontFamily: 'var(--font-body)' }}>
                              {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'room' && (
              <div className="card-game p-4">
                <p className="font-bold text-sm mb-3" style={{ color: '#0f1b35' }}>공간 소품</p>
                <div className="grid grid-cols-5 gap-3">
                      {roomItems.map(item => (
                        <button type="button" key={item.id} disabled={!item.unlocked || !characterReady || saving} aria-pressed={selectedRooms.includes(item.id)} aria-label={`${item.name}${item.unlocked ? '' : ' 잠김'}`} onClick={() => setSelectedRooms((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} className={`rounded-2xl p-3 text-center cursor-pointer transition-all ${!item.unlocked ? 'opacity-50' : 'hover:scale-105'}`} style={{ border: `2px solid ${selectedRooms.includes(item.id) ? '#7c3aed' : '#e0f4ff'}`, background: selectedRooms.includes(item.id) ? '#f5f3ff' : 'white' }}>
                          <div className="text-2xl mb-1">{item.unlocked ? item.icon : <Icon name="lock" size={24} />}</div>
                          <p className="text-xs font-semibold" style={{ color: '#475569', fontSize: 9 }}>{item.name}</p>
                        </button>
                  ))}
                </div>
                <p className="text-xs mt-3 inline-flex items-center gap-1" style={{ color: '#94a3b8' }}><Icon name="lock" size={14} /> 잠긴 소품은 활동을 통해 업적을 달성하면 해금됩니다</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default CharacterDetail;
