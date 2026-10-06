export type ProvenanceActor = 'user' | 'ai' | 'system';

export function actorLabel(actorType: ProvenanceActor): string {
  if (actorType === 'user') return '사용자 기여';
  if (actorType === 'ai') return 'AI 기여';
  return '시스템 기록';
}
