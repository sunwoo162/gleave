import { useState } from 'react';

export const USER_CHARACTER_ASSET_SRC = '/app/assets/characters/iseol-user-character-v1.png';
export const AI_COMPANION_ASSET_SRC = '/app/assets/characters/iseol-ai-companion-v1.png';

type CharacterAssetProps = {
  src: string;
  alt: string;
  size: number;
  className?: string;
  aspectRatio: number;
  fallbackLabel: string;
};

function CharacterAsset({ src, alt, size, className = '', aspectRatio, fallbackLabel }: CharacterAssetProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size * aspectRatio, objectFit: 'contain' as const };

  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-2 text-center text-[10px] font-semibold text-slate-400 ${className}`}
        style={style}
        role="img"
        aria-label={`${alt} — ${fallbackLabel}`}
      >
        {fallbackLabel}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`inline-block object-contain ${className}`}
      style={style}
      width={size}
      height={Math.round(size * aspectRatio)}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function UserCharacterAsset({ className = '', size = 120, alt = 'NPC 사용자 캐릭터' }: { className?: string; size?: number; alt?: string }) {
  return <CharacterAsset src={USER_CHARACTER_ASSET_SRC} alt={alt} size={size} aspectRatio={1.5} className={className} fallbackLabel="사용자 캐릭터 자산 대기" />;
}

export function AICompanionAsset({ className = '', size = 120, alt = 'ISEOL 개인 AI 동반자' }: { className?: string; size?: number; alt?: string }) {
  return <CharacterAsset src={AI_COMPANION_ASSET_SRC} alt={alt} size={size} aspectRatio={0.99} className={className} fallbackLabel="AI 동반자 자산 대기" />;
}
