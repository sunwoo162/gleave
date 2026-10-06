import type { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'lightbulb'
  | 'bolt'
  | 'sparkles'
  | 'brain'
  | 'book'
  | 'users'
  | 'globe'
  | 'message'
  | 'chart'
  | 'palette'
  | 'settings'
  | 'user'
  | 'character'
  | 'plug'
  | 'monitor'
  | 'robot'
  | 'code'
  | 'fileText'
  | 'rocket'
  | 'edit'
  | 'compass'
  | 'heart'
  | 'bell'
  | 'rotate'
  | 'check'
  | 'alertTriangle'
  | 'clock'
  | 'calendar'
  | 'help'
  | 'question'
  | 'lock'
  | 'shield'
  | 'eye'
  | 'eyeOff'
  | 'mail'
  | 'trophy'
  | 'x'
  | 'menu';

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

function shape(name: IconName): ReactNode {
  switch (name) {
    case 'home':
      return <path d="m3 10.5 9-7 9 7v9a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" />;
    case 'lightbulb':
      return <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.2 14.5A6 6 0 1 1 15.8 14.5c-.8.7-1.3 1.7-1.3 2.7h-5c0-1-.5-2-1.3-2.7Z" /><path d="M12 2v1" /><path d="m4.9 4.9.7.7" /><path d="M2 12h1" /><path d="m19.1 4.9-.7.7" /><path d="M21 12h1" /></>;
    case 'bolt':
      return <path d="m13 2-9 12h7l-1 8 9-12h-7z" />;
    case 'sparkles':
      return <><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2z" /><path d="m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7z" /><path d="m5 14-.5 1.5L3 16l1.5.5L5 18l.5-1.5L7 16l-1.5-.5z" /></>;
    case 'brain':
      return <><path d="M9.5 4.5A3 3 0 0 0 6 7.3 3 3 0 0 0 4 12a3 3 0 0 0 2 4.7A3 3 0 0 0 9.5 19H12V5z" /><path d="M14.5 4.5A3 3 0 0 1 18 7.3 3 3 0 0 1 20 12a3 3 0 0 1-2 4.7 3 3 0 0 1-3.5 2.3H12V5z" /><path d="M8 9h2M7.5 13h2M16 9h-2M16.5 13h-2M12 7v10" /></>;
    case 'book':
      return <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" /><path d="M4 5.5v15" /><path d="M8 7h8M8 11h8" /></>;
    case 'users':
      return <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 4 5" /></>;
    case 'globe':
      return <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>;
    case 'message':
      return <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.5-.7L4 20l1.6-3.8A7.3 7.3 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" /><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" /></>;
    case 'chart':
      return <><path d="M4 19V5M4 19h17" /><path d="m7 15 3-4 3 2 5-7" /><path d="M18 6h2v2" /></>;
    case 'palette':
      return <><path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a1.5 1.5 0 0 1 0-3h2.5A6.5 6.5 0 0 0 21 8.5C19.8 5.3 16.4 3 12 3Z" /><circle cx="7.5" cy="9" r=".8" fill="currentColor" stroke="none" /><circle cx="10" cy="6.5" r=".8" fill="currentColor" stroke="none" /><circle cx="14" cy="6.5" r=".8" fill="currentColor" stroke="none" /><circle cx="17" cy="9" r=".8" fill="currentColor" stroke="none" /></>;
    case 'settings':
      return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-1.5 1.5-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7v.2H13v-.2a1.8 1.8 0 0 0-1.1-1.7 1.8 1.8 0 0 0-2 .4l-.1.1-1.5-1.5.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 7 13H6.8v-2H7a1.8 1.8 0 0 0 1.7-1.1 1.8 1.8 0 0 0-.4-2l-.1-.1 1.5-1.5.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 13 5.1V5h2v.1a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.4l.1-.1 1.5 1.5-.1.1a1.8 1.8 0 0 0-.4 2A1.8 1.8 0 0 0 21 11h.2v2H21a1.8 1.8 0 0 0-1.6 2Z" /></>;
    case 'user':
      return <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>;
    case 'character':
      return <><circle cx="12" cy="8" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /><path d="M8 4.5 9.5 3M16 4.5 14.5 3" /></>;
    case 'plug':
      return <><path d="M9 7V3M15 7V3M7 7h10v3a5 5 0 0 1-10 0zM12 15v6" /></>;
    case 'monitor':
      return <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>;
    case 'robot':
      return <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 7V4M9 4h6M9 12h.01M15 12h.01M8 16h8" /></>;
    case 'code':
      return <><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /><path d="m13 5-2 14" /></>;
    case 'fileText':
      return <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>;
    case 'rocket':
      return <><path d="M14 4c3-3 6-3 6-3s0 3-3 6l-6 6-4-4z" /><path d="m7 13-3 3 4 1 1 4 3-3M13 8l3 3" /></>;
    case 'edit':
      return <><path d="m4 16-.8 4.8L8 20l11-11-4-4z" /><path d="m13 6 4 4M15 4l1-1a2.1 2.1 0 0 1 3 3l-1 1" /></>;
    case 'compass':
      return <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" /></>;
    case 'heart':
      return <path d="M20.8 8.8c0 5.2-8.8 10-8.8 10S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z" />;
    case 'bell':
      return <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></>;
    case 'rotate':
      return <><path d="M20 11a8 8 0 0 0-14.7-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.7 4L20 15" /><path d="M20 20v-5h-5" /></>;
    case 'check':
      return <path d="m5 12 4 4L19 6" />;
    case 'alertTriangle':
      return <><path d="m12 3 9 17H3z" /><path d="M12 9v4M12 17h.01" /></>;
    case 'clock':
      return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
    case 'calendar':
      return <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>;
    case 'help':
      return <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1 .8-1.7 1.2-1.7 2.7" /><path d="M12 17h.01" /></>;
    case 'question':
      return <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1 .8-1.7 1.2-1.7 2.7" /><path d="M12 17h.01" /></>;
    case 'shield':
      return <><path d="M12 3 20 6v5c0 5-3.2 8.5-8 10-4.8-1.5-8-5-8-10V6z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>;
    case 'lock':
      return <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>;
    case 'eye':
      return <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>;
    case 'eyeOff':
      return <><path d="m3 3 18 18" /><path d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a17.8 17.8 0 0 1-3.2 3.8M6.2 6.2C3.9 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.1 0 2.1-.2 3-.5" /><path d="M9.9 9.9a2.5 2.5 0 0 0 3.5 3.5" /></>;
    case 'mail':
      return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>;
    case 'trophy':
      return <><path d="M8 4h8v4a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 12v5M8 21h8M9 17h6" /></>;
    case 'x':
      return <><path d="m6 6 12 12M18 6 6 18" /></>;
    case 'menu':
      return <><path d="M4 7h16M4 12h16M4 17h16" /></>;
  }
}

export function Icon({ name, size = 18, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
    >
      {shape(name)}
    </svg>
  );
}
