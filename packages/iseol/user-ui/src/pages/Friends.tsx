import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AppShell } from '../components/Navigation';
import { UserCharacterAsset } from '../components/CharacterAssets';
import { Icon } from '../components/Icon';
import { formatWorldTime } from '../domain/worldState';
import { blockUser, createFriendRequest, listBlocks, listDirectMessages, listFriendRequests, listFriends, listProfiles, reportUser, respondToFriendRequest, sendDirectMessage, unblockUser, type DirectMessage, type FriendRequest, type PublicProfile, type SocialBlock, UserApiError } from '../api/userApi';
import { userFacingError } from '../errorMessage';
import { useUser } from '../store/useUser';

type Tab = 'friends' | 'messages' | 'requests';
export default function Friends() {
  const profile = useUser();
  const timezone = profile.status === 'ready' ? profile.timezone : undefined;
  const timeOf = (value: string): string => formatWorldTime(timezone, value);
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blocks, setBlocks] = useState<SocialBlock[]>([]);
  const [selected, setSelected] = useState<PublicProfile | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [search, setSearch] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true); setError('');
      const [friendResult, requestResult, blockResult] = await Promise.all([listFriends(), listFriendRequests(), listBlocks()]);
      setFriends(friendResult.friends); setRequests(requestResult.requests); setBlocks(blockResult.blocks);
    } catch (caught) { setError(userFacingError(caught, '친구 정보를 불러오지 못했습니다.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    void listDirectMessages(selected.userId).then((result) => setMessages(result.messages)).catch((caught) => setError(userFacingError(caught, '메시지를 불러오지 못했습니다.')));
  }, [selected]);

  const searchUsers = async (value: string) => {
    setSearch(value);
    if (!value.trim()) { setProfiles([]); return; }
    try { setProfiles((await listProfiles(value)).profiles.filter((profile) => !friends.some((friend) => friend.userId === profile.userId))); }
    catch (caught) { setError(userFacingError(caught, '사용자 검색에 실패했습니다.')); }
  };
  const send = async () => {
    if (!selected || !input.trim()) return;
    try { const result = await sendDirectMessage(selected.userId, input.trim()); setMessages((items) => [...items, result.message]); setInput(''); setStatus('메시지를 저장했습니다.'); }
    catch (caught) { setError(userFacingError(caught, '메시지를 보내지 못했습니다.')); }
  };
  const acceptRequest = async (request: FriendRequest, action: 'accept' | 'reject') => {
    try { await respondToFriendRequest(request.id, action); await load(); }
    catch (caught) { setError(userFacingError(caught, '친구 요청을 처리하지 못했습니다.')); }
  };
  const addFriend = async (profile: PublicProfile) => {
    try { await createFriendRequest(profile.userId); setStatus(`${profile.displayName}님에게 친구 요청을 보냈습니다.`); }
    catch (caught) { setError(userFacingError(caught, '친구 요청을 보내지 못했습니다.')); }
  };
  const block = async (profile: PublicProfile) => {
    try { await blockUser(profile.userId); setSelected(null); setStatus(`${profile.displayName}님을 차단했습니다.`); await load(); }
    catch (caught) { setError(userFacingError(caught, '사용자를 차단하지 못했습니다.')); }
  };
  const report = async (profile: PublicProfile) => {
    try { await reportUser(profile.userId, reportReason.trim() || '사용자 신고'); setReportReason(''); setStatus('신고가 저장되었습니다.'); }
    catch (caught) { setError(userFacingError(caught, '신고를 저장하지 못했습니다.')); }
  };
  const unblock = async (blockRecord: SocialBlock) => {
    try { await unblockUser(blockRecord.blockedUserId); setStatus('차단을 해제했습니다.'); await load(); }
    catch (caught) { setError(userFacingError(caught, '차단을 해제하지 못했습니다.')); }
  };

  return <AppShell>
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: 'var(--font-body)' }}>
      <aside className="w-72 border-r-2 border-blue-100 bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b-2 border-blue-100">
          <div className="flex items-center gap-3 mb-4"><Icon name="message" size={21} /><h2 className="font-black" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>친구 · 메시지</h2></div>
          <label htmlFor="friend-search" className="sr-only">사용자 검색</label>
          <input id="friend-search" value={search} onChange={(event) => void searchUsers(event.target.value)} placeholder="사용자 검색..." className="w-full px-3 py-2 rounded-xl border-2 border-blue-100 outline-none text-sm" />
          <label htmlFor="report-reason" className="sr-only">신고 사유</label>
          <input id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="신고 사유 (선택)" className="w-full px-3 py-2 mt-2 rounded-xl border-2 border-blue-100 outline-none text-xs" />
          <p className="text-[11px] mt-2" style={{ color: '#64748b' }}>차단된 사용자는 친구 검색과 메시지에서 제외됩니다</p>
        </div>
        <div className="flex border-b-2 border-blue-100">{([['friends', '친구'], ['messages', '메시지'], ['requests', `요청 ${requests.length}`]] as [Tab, string][]).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className="flex-1 py-2 text-xs font-bold" style={{ background: tab === value ? '#f0f9ff' : 'white', color: tab === value ? '#3b82f6' : '#64748b', borderBottom: tab === value ? '2px solid #3b82f6' : 'none' }}>{label}</button>)}</div>
      </aside>
      <main className="flex-1 flex min-w-0">
        <section className="w-80 border-r-2 border-blue-100 bg-white overflow-auto p-3">
          {error && <p role="alert" className="p-3 rounded-xl text-sm mb-3" style={{ background: '#fff1f2', color: '#be123c' }}>{error}</p>}
          {status && <p role="status" className="p-3 rounded-xl text-sm mb-3" style={{ background: '#ecfdf5', color: '#047857' }}>{status}</p>}
          {search.trim() && <div className="mb-4"><p className="text-xs font-bold mb-2" style={{ color: '#94a3b8' }}>검색 결과</p>{profiles.map((profile) => <div key={profile.userId} className="p-2 rounded-xl mb-1" style={{ background: '#f8fafc' }}><div className="flex items-center gap-2"><UserCharacterAsset size={32} alt={`${profile.displayName} 개인 캐릭터`} /><Link to={`/profile?userId=${encodeURIComponent(profile.userId)}`} aria-label={`${profile.displayName} 프로필 보기`} className="flex-1 text-sm font-semibold text-slate-900 no-underline hover:underline">{profile.displayName}</Link></div><div className="flex gap-2 mt-2"><button onClick={() => void addFriend(profile)} className="text-xs font-bold" style={{ color: '#2563eb' }}>친구 추가</button><button onClick={() => void block(profile)} className="text-xs font-bold" style={{ color: '#be123c' }}>차단</button><button onClick={() => void report(profile)} className="text-xs font-bold" style={{ color: '#d97706' }}>신고</button></div></div>)}</div>}
          {tab === 'requests' ? <>{requests.length === 0 && <Empty text="받은 친구 요청이 없습니다." />}{requests.map((request) => <div key={request.id} className="p-3 rounded-xl mb-2" style={{ background: '#f8fafc' }}><p className="text-sm font-bold" style={{ color: '#0f1b35' }}>{request.requester?.displayName ?? request.requesterUserId}</p><p className="text-xs mt-1" style={{ color: '#64748b' }}>친구 요청을 보냈습니다.</p><div className="flex gap-2 mt-2"><button onClick={() => void acceptRequest(request, 'accept')} className="flex-1 rounded-lg py-1 text-xs font-bold text-white" style={{ background: '#10b981' }}>수락</button><button onClick={() => void acceptRequest(request, 'reject')} className="flex-1 rounded-lg py-1 text-xs font-bold" style={{ background: '#e2e8f0', color: '#475569' }}>거절</button></div></div>)}</> : <>
            {tab === 'friends' && blocks.length > 0 && <div className="mb-4 p-3 rounded-xl" style={{ background: '#fff7ed' }}><p className="text-xs font-bold mb-2" style={{ color: '#9a3412' }}>차단된 사용자</p>{blocks.map((blockRecord) => <div key={blockRecord.id} className="flex items-center gap-2 py-1"><span className="flex-1 text-xs" style={{ color: '#7c2d12' }}>{blockRecord.blockedUserId}</span><button onClick={() => void unblock(blockRecord)} className="text-xs font-bold" style={{ color: '#c2410c' }}>차단 해제</button></div>)}</div>}
            {loading && <p className="text-sm p-3" style={{ color: '#94a3b8' }}>불러오는 중…</p>}{!loading && friends.length === 0 && <Empty text="아직 친구가 없습니다. 사용자를 검색해 요청을 보내보세요." />}{friends.map((friend) => <button key={friend.userId} onClick={() => { setSelected(friend); setTab('messages'); }} className="flex items-center gap-3 p-3 rounded-xl mb-1 w-full text-left" style={{ background: selected?.userId === friend.userId ? '#f0f9ff' : 'transparent', border: `2px solid ${selected?.userId === friend.userId ? '#bae8ff' : 'transparent'}` }}><UserCharacterAsset size={40} alt={`${friend.displayName} 개인 캐릭터`} /><div className="flex-1 min-w-0"><p className="font-bold text-sm truncate" style={{ color: '#0f1b35' }}>{friend.displayName}</p><p className="text-xs truncate" style={{ color: '#94a3b8' }}>@{friend.handle}</p></div></button>)}</>}
        </section>
            {selected ? <section className="flex-1 flex flex-col min-w-0"><header className="flex items-center gap-3 px-6 py-4 border-b-2 border-blue-100 bg-white"><UserCharacterAsset size={36} alt={`${selected.displayName} 개인 캐릭터`} /><div className="flex-1"><p className="font-bold text-sm" style={{ color: '#0f1b35' }}>{selected.displayName}</p><p className="text-xs" style={{ color: '#94a3b8' }}>@{selected.handle}</p></div><Link to={`/profile?userId=${encodeURIComponent(selected.userId)}`} aria-label={`${selected.displayName} 프로필 보기`} className="text-xs font-bold text-blue-600 no-underline hover:underline">프로필 보기</Link><button onClick={() => void block(selected)} className="text-xs font-bold" style={{ color: '#be123c' }}>차단</button><button onClick={() => void report(selected)} className="text-xs font-bold" style={{ color: '#d97706' }}>신고</button></header><div className="flex-1 overflow-auto p-6 space-y-3" style={{ background: '#f8fafc' }}>{messages.length === 0 && <Empty text="저장된 대화가 없습니다." />}{messages.map((message) => <div key={message.id} className={`flex ${message.senderUserId === selected.userId ? '' : 'justify-end'}`}><div className="max-w-md px-4 py-2.5 rounded-2xl text-sm" style={{ background: message.senderUserId === selected.userId ? 'white' : '#dbeafe', color: '#0f1b35', border: '2px solid #e0f4ff' }}><p>{message.body}</p><p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{timeOf(message.createdAt)}</p></div></div>)}</div><div className="p-4 border-t-2 border-blue-100 bg-white flex gap-3"><label htmlFor="message-input" className="sr-only">메시지 입력</label><input id="message-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} placeholder="메시지 입력..." className="flex-1 px-4 py-2.5 rounded-xl border-2 border-blue-100 outline-none text-sm" /><button onClick={() => void send()} disabled={!input.trim()} className="px-4 py-2.5 rounded-xl font-bold text-white disabled:opacity-40" style={{ background: '#3b82f6' }}>전송</button></div></section> : <section className="flex-1 flex items-center justify-center" style={{ background: '#f8fafc', color: '#94a3b8' }}><div className="text-center"><Icon name="message" size={44} className="mb-3" /><p className="font-semibold">친구를 선택해 대화를 시작해요</p></div></section>}
          </main>
    </div>
  </AppShell>;
}

function Empty({ text }: { text: string }) { return <p className="text-center text-sm py-6" style={{ color: '#94a3b8' }}>{text}</p>; }
