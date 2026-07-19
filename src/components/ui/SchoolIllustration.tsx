'use client';

export default function SchoolIllustration() {
  return (
    <svg
      viewBox="0 0 480 600"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* 하늘 그라데이션 */}
      <defs>
        <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#87CEEB" />
          <stop offset="60%" stopColor="#B8E4F9" />
          <stop offset="100%" stopColor="#D4EFFC" />
        </linearGradient>
        <linearGradient id="grass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7EC850" />
          <stop offset="100%" stopColor="#5BA33B" />
        </linearGradient>
        <linearGradient id="building" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFF5E6" />
          <stop offset="100%" stopColor="#FFE8CC" />
        </linearGradient>
        <linearGradient id="roof" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E8734A" />
          <stop offset="100%" stopColor="#D4623D" />
        </linearGradient>
      </defs>

      {/* 하늘 */}
      <rect width="480" height="600" fill="url(#sky)" />

      {/* 구름들 */}
      <g opacity="0.9">
        <ellipse cx="80" cy="80" rx="50" ry="20" fill="white" />
        <ellipse cx="60" cy="75" rx="30" ry="18" fill="white" />
        <ellipse cx="100" cy="78" rx="35" ry="16" fill="white" />
      </g>
      <g opacity="0.7">
        <ellipse cx="350" cy="50" rx="45" ry="18" fill="white" />
        <ellipse cx="330" cy="45" rx="28" ry="15" fill="white" />
        <ellipse cx="375" cy="47" rx="32" ry="14" fill="white" />
      </g>
      <g opacity="0.5">
        <ellipse cx="220" cy="110" rx="35" ry="14" fill="white" />
        <ellipse cx="205" cy="107" rx="22" ry="12" fill="white" />
      </g>

      {/* 태양 */}
      <circle cx="400" cy="70" r="35" fill="#FFD93D" opacity="0.9" />
      <circle cx="400" cy="70" r="28" fill="#FFE066" />

      {/* 뒷산 */}
      <path d="M-20 350 Q60 250 140 320 Q200 280 260 310 Q340 260 420 300 Q460 280 500 320 L500 400 L-20 400 Z" fill="#8BC470" opacity="0.5" />

      {/* 잔디 언덕 */}
      <ellipse cx="240" cy="480" rx="300" ry="140" fill="url(#grass)" />

      {/* 학교 건물 본관 */}
      <rect x="100" y="220" width="280" height="180" rx="4" fill="url(#building)" stroke="#E0C9A8" strokeWidth="1" />

      {/* 지붕 */}
      <path d="M85 225 L240 160 L395 225 Z" fill="url(#roof)" />
      <rect x="220" y="165" width="40" height="25" rx="2" fill="#D4623D" />
      {/* 지붕 위 깃발 */}
      <line x1="240" y1="145" x2="240" y2="168" stroke="#8B5E3C" strokeWidth="2" />
      <path d="M240 145 L260 152 L240 159 Z" fill="#3EC46D" />

      {/* 창문 — 2층 */}
      {[140, 190, 270, 320].map((x) => (
        <g key={`w2-${x}`}>
          <rect x={x} y="240" width="30" height="35" rx="3" fill="#87CEEB" stroke="#C4A882" strokeWidth="1.5" />
          <line x1={x + 15} y1="240" x2={x + 15} y2="275" stroke="#C4A882" strokeWidth="1" />
          <line x1={x} y1="257" x2={x + 30} y2="257" stroke="#C4A882" strokeWidth="1" />
        </g>
      ))}

      {/* 창문 — 1층 */}
      {[140, 190, 270, 320].map((x) => (
        <g key={`w1-${x}`}>
          <rect x={x} y="310" width="30" height="35" rx="3" fill="#87CEEB" stroke="#C4A882" strokeWidth="1.5" />
          <line x1={x + 15} y1="310" x2={x + 15} y2="345" stroke="#C4A882" strokeWidth="1" />
          <line x1={x} y1="327" x2={x + 30} y2="327" stroke="#C4A882" strokeWidth="1" />
        </g>
      ))}

      {/* 현관문 */}
      <rect x="218" y="330" width="44" height="70" rx="22" fill="#8B5E3C" />
      <rect x="222" y="334" width="36" height="62" rx="18" fill="#A0714F" />
      <circle cx="250" cy="368" r="3" fill="#FFD93D" />

      {/* 현관 지붕 */}
      <path d="M205 335 L240 310 L275 335 Z" fill="#E8734A" />

      {/* 학교 이름 현판 */}
      <rect x="175" y="285" width="130" height="22" rx="4" fill="white" stroke="#C4A882" strokeWidth="1" />
      <text x="240" y="301" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#5B4A3B" fontFamily="sans-serif">
        애월초등학교
      </text>

      {/* 좌측 나무 */}
      <rect x="55" y="340" width="12" height="50" rx="3" fill="#8B5E3C" />
      <ellipse cx="61" cy="320" rx="30" ry="35" fill="#5BA33B" />
      <ellipse cx="50" cy="330" rx="22" ry="25" fill="#6DC04B" />

      {/* 우측 나무 */}
      <rect x="413" y="340" width="12" height="50" rx="3" fill="#8B5E3C" />
      <ellipse cx="419" cy="320" rx="30" ry="35" fill="#5BA33B" />
      <ellipse cx="430" cy="330" rx="22" ry="25" fill="#6DC04B" />

      {/* 꽃들 */}
      {[80, 120, 360, 400].map((x, i) => (
        <g key={`flower-${i}`}>
          <line x1={x} y1="415" x2={x} y2="430" stroke="#5BA33B" strokeWidth="1.5" />
          <circle cx={x} cy="412" r="5" fill={i % 2 === 0 ? '#FF6B9D' : '#FFD93D'} />
          <circle cx={x} cy="412" r="2" fill={i % 2 === 0 ? '#FFD93D' : '#FF6B9D'} />
        </g>
      ))}

      {/* 운동장 길 */}
      <path d="M200 400 Q220 440 225 480 Q230 520 235 560" stroke="#E8D5B7" strokeWidth="30" fill="none" strokeLinecap="round" />
      <path d="M280 400 Q260 440 255 480 Q250 520 245 560" stroke="#E8D5B7" strokeWidth="30" fill="none" strokeLinecap="round" />
    </svg>
  );
}
