// SVG character illustrations for ISEOL platform

type CharacterAppearance = Record<string, string | number | boolean>;

export function UserCharacter({ className = '', size = 120, appearance = {} }: { className?: string; size?: number; appearance?: Record<string, string | number | boolean> }) {
  const hairColor = appearance.hairStyle === 'violet-bob' ? '#7c3aed' : appearance.hairStyle === 'mint-curl' ? '#0f766e' : '#4338ca';
  const skinColor = appearance.skinTone === 'warm' ? '#f5c78e' : appearance.skinTone === 'cool' ? '#f1d3c5' : '#fde68a';
  const outfitColor = appearance.outfit === 'violet-jacket' ? '#7c3aed' : appearance.outfit === 'mint-sweater' ? '#059669' : '#3b82f6';
  const outfitDarkColor = appearance.outfit === 'violet-jacket' ? '#6d28d9' : appearance.outfit === 'mint-sweater' ? '#047857' : '#2563eb';
  const shoeColor = appearance.shoes === 'boots' ? '#78350f' : appearance.shoes === 'slippers' ? '#64748b' : '#0f172a';
  const accessory = typeof appearance.accessory === 'string' ? appearance.accessory : '';
  const accessoryIcon = accessory === 'glasses' ? '👓' : accessory === 'headphones' ? '🎧' : accessory === 'cap' ? '🧢' : '';
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 120 156" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Hair */}
      <ellipse cx="60" cy="38" rx="28" ry="26" fill={hairColor}/>
      <rect x="33" y="44" width="8" height="20" rx="4" fill={hairColor}/>
      <rect x="79" y="44" width="8" height="20" rx="4" fill={hairColor}/>
      {/* Face */}
      <ellipse cx="60" cy="52" rx="24" ry="26" fill={skinColor}/>
      {/* Eyes */}
      <ellipse cx="51" cy="48" rx="4" ry="4.5" fill="#1e293b"/>
      <ellipse cx="69" cy="48" rx="4" ry="4.5" fill="#1e293b"/>
      <circle cx="52.5" cy="46.5" r="1.5" fill="white"/>
      <circle cx="70.5" cy="46.5" r="1.5" fill="white"/>
      {/* Blush */}
      <ellipse cx="45" cy="55" rx="5" ry="3" fill="#fca5a5" opacity="0.6"/>
      <ellipse cx="75" cy="55" rx="5" ry="3" fill="#fca5a5" opacity="0.6"/>
      {/* Smile */}
      <path d="M53 60 Q60 66 67 60" stroke="#92400e" strokeWidth="2" strokeLinecap="round" fill="none"/>
      {/* Body - hoodie */}
      <rect x="32" y="76" width="56" height="52" rx="12" fill={outfitColor}/>
      {/* Hood detail */}
      <path d="M44 76 Q60 70 76 76" stroke={outfitDarkColor} strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Pocket */}
      <rect x="47" y="100" width="26" height="16" rx="8" fill={outfitDarkColor}/>
      {/* Arms */}
      <rect x="18" y="78" width="16" height="36" rx="8" fill={outfitColor}/>
      <rect x="86" y="78" width="16" height="36" rx="8" fill={outfitColor}/>
      {/* Hands */}
      <ellipse cx="26" cy="118" rx="9" ry="8" fill={skinColor}/>
      <ellipse cx="94" cy="118" rx="9" ry="8" fill={skinColor}/>
      {/* Legs */}
      <rect x="38" y="126" width="18" height="26" rx="8" fill="#1e3a8a"/>
      <rect x="64" y="126" width="18" height="26" rx="8" fill="#1e3a8a"/>
      {/* Shoes */}
      <ellipse cx="47" cy="152" rx="12" ry="6" fill={shoeColor}/>
      <ellipse cx="73" cy="152" rx="12" ry="6" fill={shoeColor}/>
      {/* Laptop prop */}
      <rect x="80" y="110" width="22" height="14" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1"/>
      <rect x="78" y="123" width="26" height="3" rx="1.5" fill="#e2e8f0"/>
      {accessoryIcon && <text x="60" y="25" textAnchor="middle" fontSize="14" aria-hidden="true">{accessoryIcon}</text>}
    </svg>
  );
}

export function AICharacter({ className = '', size = 120 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 120 156" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Floating orb / AI aura */}
      <circle cx="60" cy="44" r="30" fill="url(#aiGrad)" opacity="0.2"/>
      {/* Hair - silver/purple */}
      <ellipse cx="60" cy="38" rx="26" ry="24" fill="#7c3aed"/>
      {/* Hair streaks */}
      <path d="M37 42 Q40 28 50 26" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M83 42 Q80 28 70 26" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" fill="none"/>
      {/* Antenna */}
      <line x1="60" y1="14" x2="60" y2="26" stroke="#a78bfa" strokeWidth="2"/>
      <circle cx="60" cy="12" r="4" fill="#8b5cf6"/>
      <circle cx="60" cy="12" r="2" fill="#ddd6fe"/>
      {/* Face */}
      <ellipse cx="60" cy="52" rx="23" ry="25" fill="#e9d5ff"/>
      {/* Eyes - glowing */}
      <ellipse cx="51" cy="48" rx="5" ry="5" fill="#7c3aed"/>
      <ellipse cx="69" cy="48" rx="5" ry="5" fill="#7c3aed"/>
      <ellipse cx="51" cy="48" rx="3" ry="3" fill="#ddd6fe"/>
      <ellipse cx="69" cy="48" rx="3" ry="3" fill="#ddd6fe"/>
      <circle cx="52" cy="47" r="1" fill="white"/>
      <circle cx="70" cy="47" r="1" fill="white"/>
      {/* Smile */}
      <path d="M53 60 Q60 67 67 60" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" fill="none"/>
      {/* Body - dress/robe */}
      <path d="M34 78 Q60 72 86 78 L90 128 Q60 136 30 128 Z" fill="#7c3aed"/>
      {/* Robe detail */}
      <path d="M50 78 L52 130" stroke="#6d28d9" strokeWidth="1.5" opacity="0.5"/>
      <path d="M70 78 L68 130" stroke="#6d28d9" strokeWidth="1.5" opacity="0.5"/>
      {/* Star ornament */}
      <path d="M60 90 L62 96 L68 96 L63 100 L65 106 L60 102 L55 106 L57 100 L52 96 L58 96 Z" fill="#fbbf24"/>
      {/* Arms */}
      <path d="M34 88 Q24 96 22 108" stroke="#7c3aed" strokeWidth="12" strokeLinecap="round" fill="none"/>
      <path d="M86 88 Q96 96 98 108" stroke="#7c3aed" strokeWidth="12" strokeLinecap="round" fill="none"/>
      {/* Hands with sparkle */}
      <ellipse cx="20" cy="112" rx="9" ry="8" fill="#e9d5ff"/>
      <ellipse cx="100" cy="112" rx="9" ry="8" fill="#e9d5ff"/>
      {/* Sparkles */}
      <path d="M12 104 L13 107 L16 108 L13 109 L12 112 L11 109 L8 108 L11 107 Z" fill="#fbbf24" opacity="0.8"/>
      <path d="M108 104 L109 107 L112 108 L109 109 L108 112 L107 109 L104 108 L107 107 Z" fill="#fbbf24" opacity="0.8"/>
      {/* Skirt base */}
      <path d="M30 128 Q60 138 90 128 Q85 152 60 154 Q35 152 30 128 Z" fill="#6d28d9"/>
      {/* Gradient overlay */}
      <defs>
        <radialGradient id="aiGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8b5cf6"/>
          <stop offset="100%" stopColor="#3b82f6"/>
        </radialGradient>
      </defs>
    </svg>
  );
}

export function MiniCharacter({ className = '', color = '#3b82f6' }: { className?: string; color?: string }) {
  return (
    <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <ellipse cx="20" cy="13" rx="9" ry="9" fill="#fde68a"/>
      <ellipse cx="20" cy="16" rx="8" ry="10" fill="#fde68a"/>
      <ellipse cx="20" cy="11" rx="10" ry="8" fill={color}/>
      <ellipse cx="15.5" cy="15" rx="1.5" ry="1.8" fill="#1e293b"/>
      <ellipse cx="24.5" cy="15" rx="1.5" ry="1.8" fill="#1e293b"/>
      <path d="M17 21 Q20 24 23 21" stroke="#92400e" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <rect x="11" y="26" width="18" height="14" rx="5" fill={color}/>
      <rect x="5" y="27" width="7" height="10" rx="3.5" fill={color}/>
      <rect x="28" y="27" width="7" height="10" rx="3.5" fill={color}/>
      <rect x="13" y="39" width="6" height="8" rx="3" fill="#1e3a8a"/>
      <rect x="21" y="39" width="6" height="8" rx="3" fill="#1e3a8a"/>
    </svg>
  );
}

export function SpaceBackground({ className = '' }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="skyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd"/>
          <stop offset="40%" stopColor="#ddd6fe"/>
          <stop offset="100%" stopColor="#fbcfe8"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#skyGrad)"/>
      {/* Clouds */}
      <ellipse cx="120" cy="80" rx="60" ry="30" fill="white" opacity="0.5"/>
      <ellipse cx="160" cy="70" rx="50" ry="28" fill="white" opacity="0.5"/>
      <ellipse cx="80" cy="75" rx="40" ry="22" fill="white" opacity="0.5"/>
      <ellipse cx="620" cy="60" rx="70" ry="32" fill="white" opacity="0.4"/>
      <ellipse cx="660" cy="50" rx="55" ry="28" fill="white" opacity="0.4"/>
      {/* Stars/sparkles */}
      <circle cx="300" cy="50" r="3" fill="#fbbf24" opacity="0.7"/>
      <circle cx="500" cy="80" r="2" fill="#a78bfa" opacity="0.8"/>
      <circle cx="400" cy="40" r="2.5" fill="#34d399" opacity="0.6"/>
      <circle cx="700" cy="100" r="2" fill="#fb7185" opacity="0.7"/>
      {/* Floating islands */}
      <ellipse cx="200" cy="300" rx="90" ry="35" fill="#86efac" opacity="0.6"/>
      <ellipse cx="200" cy="298" rx="85" ry="28" fill="#4ade80" opacity="0.4"/>
      <ellipse cx="600" cy="360" rx="100" ry="38" fill="#a5f3fc" opacity="0.5"/>
      <ellipse cx="600" cy="358" rx="95" ry="30" fill="#67e8f9" opacity="0.3"/>
      {/* Floor */}
      <path d="M0 420 Q400 390 800 420 L800 500 L0 500 Z" fill="#dbeafe" opacity="0.5"/>
      <path d="M0 440 Q400 415 800 440 L800 500 L0 500 Z" fill="#ede9fe" opacity="0.4"/>
    </svg>
  );
}

export function WorkroomBackground({ className = '' }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 700 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="roomGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ede9fe"/>
          <stop offset="100%" stopColor="#dbeafe"/>
        </linearGradient>
      </defs>
      <rect width="700" height="400" fill="url(#roomGrad)"/>
      {/* Wall */}
      <rect x="0" y="0" width="700" height="260" fill="#f5f3ff" opacity="0.6"/>
      {/* Floor */}
      <rect x="0" y="260" width="700" height="140" fill="#ddd6fe" opacity="0.4"/>
      {/* Window */}
      <rect x="520" y="40" width="140" height="180" rx="8" fill="#bae6fd" opacity="0.5" stroke="#93c5fd" strokeWidth="2"/>
      <line x1="590" y1="40" x2="590" y2="220" stroke="#93c5fd" strokeWidth="2"/>
      <line x1="520" y1="130" x2="660" y2="130" stroke="#93c5fd" strokeWidth="2"/>
      {/* Sun outside window */}
      <circle cx="620" cy="90" r="24" fill="#fde68a" opacity="0.8"/>
      {/* Desk */}
      <rect x="80" y="230" width="380" height="20" rx="6" fill="#c4b5fd"/>
      <rect x="90" y="250" width="16" height="80" rx="4" fill="#a78bfa"/>
      <rect x="444" y="250" width="16" height="80" rx="4" fill="#a78bfa"/>
      {/* Monitor */}
      <rect x="150" y="150" width="200" height="130" rx="8" fill="#1e293b"/>
      <rect x="154" y="154" width="192" height="120" rx="6" fill="#0f172a"/>
      <rect x="155" y="155" width="190" height="118" rx="5" fill="#1e3a8a" opacity="0.7"/>
      {/* Code on monitor */}
      <rect x="164" y="165" width="80" height="4" rx="2" fill="#60a5fa" opacity="0.7"/>
      <rect x="164" y="173" width="110" height="4" rx="2" fill="#34d399" opacity="0.7"/>
      <rect x="172" y="181" width="90" height="4" rx="2" fill="#fbbf24" opacity="0.7"/>
      <rect x="172" y="189" width="60" height="4" rx="2" fill="#f472b6" opacity="0.7"/>
      <rect x="164" y="197" width="100" height="4" rx="2" fill="#a78bfa" opacity="0.7"/>
      {/* Bookshelf */}
      <rect x="30" y="80" width="40" height="160" rx="4" fill="#c4b5fd" opacity="0.5"/>
      <rect x="35" y="90" width="8" height="60" rx="2" fill="#f472b6"/>
      <rect x="45" y="95" width="8" height="55" rx="2" fill="#60a5fa"/>
      <rect x="35" y="155" width="8" height="40" rx="2" fill="#34d399"/>
      <rect x="45" y="158" width="8" height="37" rx="2" fill="#fbbf24"/>
      {/* Plant */}
      <rect x="430" y="210" width="16" height="30" rx="3" fill="#92400e"/>
      <ellipse cx="438" cy="200" rx="28" ry="24" fill="#16a34a"/>
      <ellipse cx="428" cy="195" rx="18" ry="16" fill="#15803d"/>
      <ellipse cx="450" cy="198" rx="16" ry="15" fill="#22c55e"/>
    </svg>
  );
}
