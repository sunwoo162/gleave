import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AppShell } from '../components/Navigation';
import { Icon } from '../components/Icon';
import { AICompanionAsset, UserCharacterAsset } from '../components/CharacterAssets';
import { formatWorldTime } from '../domain/worldState';
import { approveAiChatExecutionPlan, createAiChatConversation, createAiChatExecutionPlanWorkRequest, getAiAgentProfile, getAiChatConversation, getRuntimeStatus, getSettings, listAiChatConversations, listUserProjects, rejectAiChatExecutionPlan, sendAiChatMessage, type AiAgentProfile, type AiChatAttachmentInput, type AiChatContextSelection, type AiChatConversation, type UserProject, type UserRuntimeStatus, UserApiError } from '../api/userApi';
import { userFacingError } from '../errorMessage';
import { useUser } from '../store/useUser';

function errorMessage(error: unknown): string { return userFacingError(error, 'AI 대화를 불러오지 못했습니다.'); }
function timeLabel(value: string, timezone?: string): string { return formatWorldTime(timezone, value); }
function latestProjectContextId(conversation: AiChatConversation): string | null { return [...conversation.messages].reverse().find((message) => message.role === 'user')?.projectId ?? null; }
const DEFAULT_CONTEXT_SELECTION: AiChatContextSelection = { memory: true, projectFiles: true, learningHistory: true, activityTimeline: true, teamDocs: true };
function latestContextSelection(conversation: AiChatConversation): AiChatContextSelection { return [...conversation.messages].reverse().find((message) => message.role === 'user')?.contextSelection ?? { ...DEFAULT_CONTEXT_SELECTION }; }
const CONTEXT_EDITOR_ITEMS: Array<{ key: keyof AiChatContextSelection; label: string; description: string }> = [
  { key: 'memory', label: '개인 기억', description: '저장된 사용자 전용 기억' },
  { key: 'learningHistory', label: '학습 기록', description: '학습 세션과 답변 기록' },
  { key: 'projectFiles', label: '프로젝트 맥락', description: '선택한 프로젝트의 제한된 메타데이터' },
  { key: 'activityTimeline', label: '활동 타임라인', description: '검증된 활동 증거의 요약' },
  { key: 'teamDocs', label: '팀 공유 문서', description: '허가된 스터디 공유 자료' },
];
const MAX_ATTACHMENT_BYTES = 24 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 48 * 1024;
const MAX_ATTACHMENTS = 3;
const ACCEPTED_ATTACHMENT_MIMES = new Set(['application/javascript', 'application/json', 'application/typescript', 'application/xml', 'text/css', 'text/csv', 'text/html', 'text/javascript', 'text/markdown', 'text/plain', 'text/typescript', 'text/xml']);
const ACCEPTED_ATTACHMENT_EXTENSIONS = new Set(['.cjs', '.css', '.csv', '.html', '.js', '.jsx', '.json', '.md', '.mjs', '.ts', '.tsx', '.txt', '.xml']);
function fileSizeLabel(size: number): string { return size < 1024 ? `${size}B` : `${Math.ceil(size / 1024)}KB`; }
function isSupportedAttachment(file: File): boolean { const mime = file.type.toLowerCase().split(';', 1)[0]; const dot = file.name.lastIndexOf('.'); const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''; return ACCEPTED_ATTACHMENT_MIMES.has(mime) || ACCEPTED_ATTACHMENT_EXTENSIONS.has(extension); }

export default function AIChat() {
  const profile = useUser();
  const timezone = profile.status === 'ready' ? profile.timezone : undefined;
  const [conversations, setConversations] = useState<AiChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<AiChatConversation | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [runtimeStatus, setRuntimeStatus] = useState<UserRuntimeStatus | null>(null);
  const [agentProfile, setAgentProfile] = useState<AiAgentProfile | null>(null);
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectContextAllowed, setProjectContextAllowed] = useState(false);
  const [contextPermissions, setContextPermissions] = useState<AiChatContextSelection>({ ...DEFAULT_CONTEXT_SELECTION });
  const [contextSelection, setContextSelection] = useState<AiChatContextSelection>({ ...DEFAULT_CONTEXT_SELECTION });
  const [contextEditorOpen, setContextEditorOpen] = useState(false);
  const [inputAttachments, setInputAttachments] = useState<AiChatAttachmentInput[]>([]);
  const loadGeneration = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const conversationRef = useRef<AiChatConversation | null>(null);
  const conversationMutationInFlight = useRef(false);

  const load = async () => {
    if (conversationMutationInFlight.current) return;
    const generation = ++loadGeneration.current;
    try {
      setError('');
      const result = await listAiChatConversations();
      const projectResult = await listUserProjects().catch(() => ({ projects: [] as UserProject[] }));
      const settingsResult = await getSettings().catch(() => null);
      const agentResult = await getAiAgentProfile().catch(() => null);
      if (generation !== loadGeneration.current || conversationMutationInFlight.current) return;
      const nextContextPermissions = settingsResult?.settings.aiAccess ?? DEFAULT_CONTEXT_SELECTION;
      const nextProjectContextAllowed = nextContextPermissions.projectFiles === true;
      setConversations(result.conversations);
      setContextPermissions(nextContextPermissions);
      setProjectContextAllowed(nextProjectContextAllowed);
      setProjects(nextProjectContextAllowed ? projectResult.projects : []);
      setAgentProfile(agentResult?.profile ?? null);
      const id = selectedIdRef.current ?? result.conversations[0]?.id ?? null;
      selectedIdRef.current = id;
      setSelectedId(id);
      if (id) {
        const nextConversation = (await getAiChatConversation(id)).conversation;
        if (generation !== loadGeneration.current) return;
        conversationRef.current = nextConversation;
        setConversation(nextConversation);
        setSelectedProjectId(latestProjectContextId(nextConversation));
        setContextSelection(latestContextSelection(nextConversation));
      }
    } catch (caught) { if (generation === loadGeneration.current) setError(errorMessage(caught)); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    void getRuntimeStatus().then((result) => setRuntimeStatus(result.runtime)).catch(() => setRuntimeStatus(null));
  }, []);

  const selectConversation = async (id: string) => {
    const generation = ++loadGeneration.current;
    try {
      setError('');
      selectedIdRef.current = id;
      setSelectedId(id);
      const nextConversation = (await getAiChatConversation(id)).conversation;
      if (generation !== loadGeneration.current) return;
      conversationRef.current = nextConversation;
      setConversation(nextConversation);
      setSelectedProjectId(latestProjectContextId(nextConversation));
      setContextSelection(latestContextSelection(nextConversation));
      setInputAttachments([]);
    } catch (caught) { if (generation === loadGeneration.current) setError(errorMessage(caught)); }
  };

  const newConversation = async () => {
    conversationMutationInFlight.current = true;
    loadGeneration.current += 1;
    try {
      setBusy(true);
      setError('');
      const result = await createAiChatConversation('새 개인 AI 대화');
      setConversations((current) => [result.conversation, ...current]);
      selectedIdRef.current = result.conversation.id;
      conversationRef.current = result.conversation;
      setSelectedId(result.conversation.id);
      setConversation(result.conversation);
      setSelectedProjectId(null);
      setContextSelection({ ...DEFAULT_CONTEXT_SELECTION });
      setContextEditorOpen(false);
      setInputAttachments([]);
      conversationMutationInFlight.current = false;
      await load();
      setStatus('새 대화를 만들었습니다.');
    } catch (caught) { setError(errorMessage(caught)); }
    finally {
      conversationMutationInFlight.current = false;
      setBusy(false);
    }
  };

  const send = async () => {
    const content = input.trim();
    const conversationId = conversation?.id ?? selectedId;
    if (!content || busy) return;
    if (!conversationId) {
      setError('개인 AI 대화를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      const projectIdForMessage = contextSelection.projectFiles ? selectedProjectId : null;
      const result = await sendAiChatMessage(conversationId, content, { contextSelection, ...(projectIdForMessage ? { projectId: projectIdForMessage } : {}), ...(inputAttachments.length > 0 ? { attachments: inputAttachments } : {}) });
      conversationRef.current = result.conversation;
      setConversation(result.conversation);
      setConversations((current) => current.map((item) => item.id === result.conversation.id ? result.conversation : item));
      setSelectedProjectId(latestProjectContextId(result.conversation));
      setContextSelection(latestContextSelection(result.conversation));
      setInputAttachments([]);
      setInput('');
      setStatus(result.runtimeStatus === 'completed' ? '개인 AI Runtime이 답변을 저장했습니다.' : '메시지를 저장했습니다. 개인 AI Runtime 연결을 기다리고 있습니다.');
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };

  const chooseAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      setError('');
      const currentSize = inputAttachments.reduce((total, attachment) => total + new TextEncoder().encode(attachment.content).byteLength, 0);
      const next: AiChatAttachmentInput[] = [];
      for (const file of Array.from(files)) {
        if (inputAttachments.length + next.length >= MAX_ATTACHMENTS) throw new Error('메시지에는 텍스트 파일을 최대 3개까지 첨부할 수 있습니다.');
        if (!isSupportedAttachment(file)) throw new Error('텍스트 파일만 첨부할 수 있습니다.');
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('첨부 파일은 24KB 이하만 사용할 수 있습니다.');
        const content = await file.text();
        const size = new TextEncoder().encode(content).byteLength;
        if (!content) throw new Error('빈 첨부 파일은 사용할 수 없습니다.');
        if (currentSize + next.reduce((total, attachment) => total + new TextEncoder().encode(attachment.content).byteLength, 0) + size > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error('한 메시지의 첨부 파일은 48KB 이하만 사용할 수 있습니다.');
        next.push({ name: file.name, mimeType: file.type || 'text/plain', content });
      }
      setInputAttachments((current) => [...current, ...next]);
      setStatus(`${next.length}개 첨부 파일을 준비했습니다. 전송 전에는 저장되지 않습니다.`);
    } catch (caught) { setError(errorMessage(caught)); }
  };

  const toggleContextSelection = (key: keyof AiChatContextSelection) => {
    setContextSelection((current) => {
      const next = { ...current, [key]: !current[key] };
      if (key === 'projectFiles' && !next.projectFiles) setSelectedProjectId(null);
      return next;
    });
  };

  const updateExecutionPlan = async (messageId: string, action: 'approve' | 'reject') => {
    if (!conversation || busy) return;
    try {
      setBusy(true);
      setError('');
      const result = action === 'approve' ? await approveAiChatExecutionPlan(conversation.id, messageId) : await rejectAiChatExecutionPlan(conversation.id, messageId);
      conversationRef.current = result.conversation;
      setConversation(result.conversation);
      setConversations((current) => current.map((item) => item.id === result.conversation.id ? result.conversation : item));
      setStatus(action === 'approve' ? '실행 계획 승인 기록을 저장했습니다. 별도 실행은 시작되지 않았습니다.' : '실행 계획 거절 기록을 저장했습니다.');
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };

  const createExecutionPlanWorkRequest = async (messageId: string) => {
    if (!conversation || busy) return;
    try {
      setBusy(true);
      setError('');
      const result = await createAiChatExecutionPlanWorkRequest(conversation.id, messageId);
      conversationRef.current = result.conversation;
      setConversation(result.conversation);
      setConversations((current) => current.map((item) => item.id === result.conversation.id ? result.conversation : item));
      setStatus(result.created ? '프로젝트 작업 요청을 저장했습니다. 실행은 시작되지 않았습니다.' : '기존 프로젝트 작업 요청을 다시 확인했습니다. 실행은 시작되지 않았습니다.');
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };

  const exportConversation = () => {
    if (!conversation || messages.length === 0) return;
    const markdown = [`# ${conversation.title}`, '', ...messages.map((message) => `## ${message.role === 'user' ? '사용자' : message.role === 'assistant' ? agentName : '시스템'} · ${timeLabel(message.createdAt, timezone)}\n\n${message.content}${message.attachments?.length ? `\n\n첨부 파일:\n${message.attachments.map((attachment) => `\n### ${attachment.name} (${fileSizeLabel(attachment.size)})\n\n\`\`\`\n${attachment.content}\n\`\`\``).join('\n')}` : ''}`)].join('\n\n');
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `iseol-ai-conversation-${conversation.id.replace(/^conversation-/, '')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('대화 내보내기를 시작했습니다.');
  };

  const messages = conversation?.messages ?? [];
  const runtimeReady = runtimeStatus?.aiChat === 'ready';
  const agentName = agentProfile?.name || '이설';
  const agentAvatar = agentProfile?.avatarUrl || '';

  return <AppShell>
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: 'var(--font-body)' }}>
      <aside className="w-64 border-r-2 border-blue-100 bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b-2 border-blue-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)', color: 'white' }}><Icon name="sparkles" size={18} /></div>
            <div>
              <p className="font-black text-sm" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{agentName}</p>
              <p className="text-xs px-2 py-0.5 rounded-full inline-block font-bold" style={{ background: runtimeReady ? '#dcfce7' : '#fef3c7', color: runtimeReady ? '#166534' : '#92400e' }}>{runtimeReady ? 'Runtime 연결됨' : 'Runtime 연결 대기'}</p>
            </div>
          </div>
          <button onClick={() => void newConversation()} disabled={busy} className="w-full py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>+ 새 대화</button>
        </div>
        <div className="flex-1 overflow-auto p-2 panel-scroll">
          {conversations.length === 0 ? <p className="p-3 text-xs text-slate-500">저장된 대화가 없습니다.</p> : conversations.map((item) => <button key={item.id} onClick={() => void selectConversation(item.id)} className="w-full text-left p-3 rounded-xl cursor-pointer mb-1" style={{ background: selectedId === item.id ? '#f5f3ff' : undefined, border: selectedId === item.id ? '2px solid #ddd6fe' : '2px solid transparent' }}><p className="font-bold text-sm truncate" style={{ color: '#0f1b35' }}>{item.title}</p><p className="text-xs truncate mt-0.5" style={{ color: '#94a3b8' }}>{item.messages.at(-1)?.content ?? '아직 메시지가 없습니다.'}</p><p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{timeLabel(item.updatedAt, timezone)}</p></button>)}
        </div>
        <div className="p-3 border-t-2 border-blue-100"><p className="text-xs font-bold mb-2" style={{ color: '#94a3b8' }}>현재 저장 범위</p><div className="space-y-1"><div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg" style={{ background: '#f5f3ff', color: '#7c3aed' }}><Icon name="brain" size={14} /> 개인 기억에 맥락 저장</div><div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg" style={{ background: '#f0f9ff', color: '#0ea5e9' }}><Icon name="lock" size={14} /> 사용자 전용 대화</div></div></div>
      </aside>
      <section className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-6 py-3 border-b-2 border-blue-100 bg-white flex-shrink-0"><div><p className="font-bold text-sm" style={{ color: '#0f1b35' }}>개인 AI 대화</p><p className="text-xs" style={{ color: '#94a3b8' }}>저장된 대화와 개인 기억을 사용자별로 관리합니다.</p></div><div className="flex items-center gap-2"><button type="button" onClick={exportConversation} disabled={!conversation || messages.length === 0 || busy} className="rounded-xl border-2 border-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700 disabled:opacity-40">대화 내보내기</button><span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: runtimeReady ? '#dcfce7' : '#fef3c7', color: runtimeReady ? '#166534' : '#92400e' }}>{runtimeReady ? '실행 Runtime 연결됨' : '실행 Runtime 대기'}</span></div></header>
        <div className="flex items-center gap-2 px-6 py-3 text-xs" style={{ background: runtimeReady ? '#ecfdf5' : '#fef3c7', borderBottom: `2px solid ${runtimeReady ? '#bbf7d0' : '#fde68a'}`, color: runtimeReady ? '#166534' : '#92400e' }}>{runtimeReady ? <Icon name="check" size={14} /> : <Icon name="alertTriangle" size={14} />}{runtimeReady ? '현재 로컬 Runtime capability가 준비되어 있습니다. 답변·추가 실행·파일 변경은 별도 승인 절차를 따릅니다.' : '현재 로컬 AI Runtime capability가 준비되지 않았습니다. 답변을 생성하지 않고 전송한 요청은 개인 대화와 개인 기억에 저장됩니다.'}</div>
        {error && <p role="alert" className="mx-6 mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {status && <p role="status" className="mx-6 mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{status}</p>}
        <div className="border-b border-blue-100 bg-white px-6 py-2"><button type="button" aria-expanded={contextEditorOpen} onClick={() => setContextEditorOpen((current) => !current)} disabled={!conversation || busy} className="rounded-lg border-2 border-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700 disabled:opacity-40">맥락 편집</button><span className="ml-2 text-xs text-slate-500">다음 메시지에 포함할 사용자 맥락을 선택합니다.</span></div>
        {contextEditorOpen && <section aria-label="AI 대화 맥락 편집" className="border-b-2 border-violet-100 bg-violet-50 px-6 py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-violet-950">다음 메시지의 맥락 범위</p><p className="mt-1 text-xs text-violet-700">선택은 다음 메시지에만 저장됩니다. 파일 변경이나 실행 권한은 포함하지 않습니다.</p></div><button type="button" onClick={() => setContextEditorOpen(false)} className="text-xs font-bold text-violet-700">닫기</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{CONTEXT_EDITOR_ITEMS.map(({ key, label, description }) => <label key={key} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700"><input type="checkbox" checked={contextSelection[key]} disabled={!conversation || busy || !contextPermissions[key]} onChange={() => toggleContextSelection(key)} className="mt-0.5" /><span><span className="block font-bold">{label}</span><span className="block text-slate-500">{contextPermissions[key] ? description : '설정에서 허용 필요'}</span></span></label>)}</div></section>}
        {messages.filter((message) => message.executionPlan).map((message) => {
          const plan = message.executionPlan!;
          const statusLabel = plan.status === 'proposed' ? '승인 대기' : plan.status === 'approved' ? '승인 기록됨' : '거절됨';
          return <section key={`execution-plan-${message.id}`} aria-label="AI 실행 계획" className="mx-6 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">
            <div className="flex items-center justify-between gap-3"><p className="font-black text-amber-950">실행 계획</p><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-amber-800">{statusLabel}</span></div>
            <p className="mt-3 font-bold text-slate-900">{plan.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">{plan.summary}</p>
            <ol className="mt-3 space-y-2">{plan.steps.map((step, index) => <li key={step.id} className="rounded-xl bg-white px-3 py-2"><p className="text-xs font-bold">{index + 1}. {step.title} · {step.operation}</p><p className="mt-1 text-xs text-slate-600">{step.description}</p></li>)}</ol>
                {plan.status === 'proposed' ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void updateExecutionPlan(message.id, 'approve')} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">실행 계획 승인</button><button type="button" onClick={() => void updateExecutionPlan(message.id, 'reject')} disabled={busy} className="rounded-lg border-2 border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-40">실행 계획 거절</button></div> : plan.status === 'approved' && message.projectId && !plan.workRequestId ? <div className="mt-3"><button type="button" onClick={() => void createExecutionPlanWorkRequest(message.id)} disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">프로젝트 작업 요청 만들기</button><p className="mt-2 text-xs text-blue-800">작업 요청만 저장하며 Run 실행은 기존 프로젝트 승인 단계에서 별도로 확인합니다.</p></div> : plan.workRequestId && message.projectId ? <div className="mt-3"><p className="text-xs font-bold text-blue-800">프로젝트 작업 요청 연결됨 · Run 실행은 시작되지 않았습니다.</p><Link to={`/projects/${encodeURIComponent(message.projectId)}`} className="mt-2 inline-flex rounded-lg border-2 border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 no-underline">프로젝트 작업실에서 실행 승인 검토</Link><p className="mt-2 text-xs text-slate-600">작업실에서 queued 요청을 확인한 뒤, 기존 승인 체크포인트에서만 Run 실행을 결정합니다.</p></div> : plan.workRequestId ? <p className="mt-3 text-xs font-bold text-blue-800">프로젝트 작업 요청 연결됨 · Run 실행은 시작되지 않았습니다.</p> : <p className="mt-3 text-xs font-bold text-amber-800">승인/거절 기록만 저장되며 별도 실행은 시작되지 않았습니다.</p>}
          </section>;
        })}
        <div className="flex-1 overflow-auto p-6 space-y-5 panel-scroll" style={{ background: '#f8fafc' }}>
          {!conversation ? <div className="h-full flex items-center justify-center"><div className="card-game p-8 text-center"><p className="font-bold" style={{ color: '#0f1b35' }}>개인 AI 대화를 시작하세요.</p><p className="text-sm mt-2 text-slate-500">새 대화를 만들면 사용자 전용 저장 공간이 생성됩니다.</p><button onClick={() => void newConversation()} className="mt-4 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: '#7c3aed' }}>새 대화 만들기</button></div></div>
            : messages.length === 0 ? <div className="h-full flex items-center justify-center"><p className="text-sm text-slate-500">아직 메시지가 없습니다. 학습이나 프로젝트 맥락을 질문해 보세요.</p></div>
              : messages.map((message) => <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}><div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ background: message.role === 'user' ? 'linear-gradient(135deg, #3b82f6, #0ea5e9)' : 'linear-gradient(135deg, #7c3aed, #6366f1)', color: 'white' }}>{message.role === 'user' ? <UserCharacterAsset size={22} alt="내 캐릭터" /> : agentAvatar ? <img src={agentAvatar} alt={agentName} className="h-full w-full object-cover" /> : <AICompanionAsset size={30} alt={agentName} />}</div><div className={`max-w-xl flex flex-col gap-1 ${message.role === 'user' ? 'items-end' : ''}`}><div className="px-4 py-3 rounded-2xl text-sm leading-relaxed" style={{ background: message.role === 'user' ? 'linear-gradient(135deg, #dbeafe, #ede9fe)' : 'white', color: '#0f1b35', border: message.role === 'user' ? '2px solid transparent' : '2px solid #e0f4ff' }}>{message.content}{message.attachments?.length ? <div className="mt-3 space-y-1 border-t border-blue-100 pt-2">{message.attachments.map((attachment) => <details key={attachment.id} className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs"><summary className="cursor-pointer font-bold text-slate-700">첨부 파일 · {attachment.name} ({fileSizeLabel(attachment.size)})</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600">{attachment.content}</pre></details>)}</div> : null}</div><span className="text-xs" style={{ color: '#94a3b8' }}>{timeLabel(message.createdAt, timezone)} · {message.status === 'waiting_runtime' ? 'Runtime 대기' : '저장됨'}{message.projectId ? ' · 프로젝트 맥락 연결됨' : ''}</span></div></div>)}
        </div>
                <footer className="p-4 border-t-2 border-blue-100 bg-white flex-shrink-0"><div className="mb-3 rounded-xl border-2 border-violet-100 bg-violet-50 px-3 py-2"><label htmlFor="ai-chat-file-input" className="block text-xs font-bold text-violet-900">첨부 파일</label><input id="ai-chat-file-input" aria-label="AI 대화 첨부 파일" type="file" multiple accept=".cjs,.css,.csv,.html,.js,.jsx,.json,.md,.mjs,.ts,.tsx,.txt,.xml,text/*,application/json" onChange={(event) => { void chooseAttachments(event.target.files); event.currentTarget.value = ''; }} disabled={!conversation || busy} className="mt-1 block w-full text-xs text-slate-600 disabled:opacity-50" /><p className="mt-1 text-xs text-violet-700">텍스트 파일만 최대 3개·파일당 24KB·한 메시지 48KB까지 첨부할 수 있습니다. 첨부 내용은 이 대화에 저장되며 파일 내용이나 실행 권한은 자동으로 공유하지 않습니다.</p>{inputAttachments.length > 0 && <ul className="mt-2 space-y-1">{inputAttachments.map((attachment, index) => <li key={`${attachment.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700"><span className="truncate">{attachment.name} ({fileSizeLabel(new TextEncoder().encode(attachment.content).byteLength)})</span><button type="button" aria-label={`${attachment.name} 첨부 제거`} onClick={() => setInputAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={busy} className="font-bold text-rose-600 disabled:opacity-50">제거</button></li>)}</ul>}</div><div className="mb-3 rounded-xl border-2 border-violet-100 bg-violet-50 px-3 py-2"><label htmlFor="ai-chat-project-context" className="block text-xs font-bold text-violet-900">프로젝트 맥락 연결</label><select id="ai-chat-project-context" aria-label="AI 대화 프로젝트 연결" value={selectedProjectId ?? ''} onChange={(event) => setSelectedProjectId(event.target.value || null)} disabled={!conversation || busy || !projectContextAllowed} className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-100"><option value="">프로젝트 맥락 연결 안 함</option>{selectedProjectId && !projects.some((project) => project.id === selectedProjectId) && <option value={selectedProjectId}>연결된 프로젝트 확인 필요</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><p className="mt-1 text-xs text-violet-700">{projectContextAllowed ? '선택하면 다음 메시지에 제한된 프로젝트 메타데이터만 연결합니다. 파일 내용이나 실행 권한은 자동으로 공유하지 않습니다.' : '프로젝트 맥락 권한 꺼짐: 설정에서 AI의 프로젝트 파일 맥락 접근을 허용하면 사용할 수 있습니다.'}</p></div><div className="flex gap-3 items-end"><textarea aria-label="AI 이설에게 메시지 보내기" value={input} onChange={(event) => setInput(event.target.value)} rows={2} disabled={!conversation || busy} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={conversation ? '개인 AI에게 보낼 메시지를 입력하세요.' : '먼저 새 대화를 만들어 주세요.'} className="flex-1 px-4 py-3 rounded-xl border-2 border-blue-100 outline-none text-sm resize-none" /><button onClick={() => void send()} disabled={!conversation || !input.trim() || busy} className="px-5 py-3 rounded-xl font-bold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>{busy ? '저장 중…' : '전송 →'}</button></div></footer>
      </section>
      <aside className="w-56 border-l-2 border-blue-100 bg-white p-4 hidden lg:flex flex-col items-center"><div className="float-anim mb-4">{agentAvatar ? <img src={agentAvatar} alt={agentName} className="h-[100px] w-[100px] rounded-full object-cover" /> : <AICompanionAsset size={100} alt="ISEOL 개인 AI 동반자"/>}</div><p className="font-black text-sm text-center mb-1" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{agentName}</p><p className="text-xs text-center mb-1 px-2 py-1 rounded-full font-bold" style={{ background: runtimeReady ? '#dcfce7' : '#fef3c7', color: runtimeReady ? '#166534' : '#92400e' }}>{runtimeReady ? '답변 Runtime 연결됨' : '답변 Runtime 대기'}</p><p className="text-xs text-center mt-4" style={{ color: '#94a3b8' }}>{runtimeReady ? '현재 대화에서 저장된 Runtime 답변을 확인할 수 있습니다.' : '답변·코드 실행·파일 수정은 Runtime 연결 후 승인 절차를 거칩니다.'}</p></aside>
    </div>
  </AppShell>;
}
