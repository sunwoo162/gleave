import { useState } from 'react';

export const PERSONAL_WORKSHOP_ENVIRONMENT_ASSET_SRC = '/app/assets/environments/iseol-personal-workshop-v1-provisional.png';

function EnvironmentAsset({ src, alt, fallbackLabel, className = '' }: { src: string; alt: string; fallbackLabel: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div className={`pointer-events-none absolute inset-0 ${className}`} role="img" aria-label={`${alt} — ${fallbackLabel}`} />;
  }

  return <img src={src} alt={alt} className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${className}`} loading="eager" decoding="async" onError={() => setFailed(true)} />;
}

export function PersonalWorkshopEnvironmentAsset({ className = '' }: { className?: string }) {
  return <EnvironmentAsset src={PERSONAL_WORKSHOP_ENVIRONMENT_ASSET_SRC} alt="개인 작업실 환경" fallbackLabel="개인 작업실 환경 자산 대기" className={className} />;
}
