export default function WalkingMascot() {
  return (
    <div className="fixed bottom-0 left-0 w-full h-[180px] overflow-hidden pointer-events-none z-[9999]">
      <style>{`
        @keyframes wm-move {
          0%   { transform: translateX(-12vw); }
          100% { transform: translateX(112vw); }
        }
        @keyframes wm-bob {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-7px); }
        }
        @keyframes wm-arm-l {
          0%,100% { transform: rotate(28deg); }
          50%     { transform: rotate(-28deg); }
        }
        @keyframes wm-arm-r {
          0%,100% { transform: rotate(-28deg); }
          50%     { transform: rotate(28deg); }
        }
        @keyframes wm-leg-l {
          0%,100% { transform: rotate(-24deg); }
          50%     { transform: rotate(24deg); }
        }
        @keyframes wm-leg-r {
          0%,100% { transform: rotate(24deg); }
          50%     { transform: rotate(-24deg); }
        }
        @keyframes wm-hand {
          0%,100% { transform: rotate(0deg); }
          50%     { transform: rotate(12deg); }
        }
        .wm-mover {
          position: absolute;
          bottom: 8px;
          width: 150px;
          height: 170px;
          animation: wm-move 9s linear infinite;
        }
        .wm-bob       { animation: wm-bob 0.46s ease-in-out infinite; transform-origin: 50% 100%; }
        .wm-arm-left  { transform-origin: 50% 8%;  animation: wm-arm-l 0.46s ease-in-out infinite; }
        .wm-arm-right { transform-origin: 50% 8%;  animation: wm-arm-r 0.46s ease-in-out infinite; }
        .wm-leg-left  { transform-origin: 50% 10%; animation: wm-leg-l 0.46s ease-in-out infinite; }
        .wm-leg-right { transform-origin: 50% 10%; animation: wm-leg-r 0.46s ease-in-out infinite; }
        .wm-hand-l    { transform-origin: 50% 15%; animation: wm-hand 0.92s ease-in-out infinite; }
      `}</style>

      <div className="wm-mover">
        <svg viewBox="0 0 150 170" width="150" height="170" overflow="visible">
          <g className="wm-bob">
            {/* back leg */}
            <g className="wm-leg-right" transform="translate(78,96)">
              <rect x="-7" y="0" width="14" height="34" rx="7" fill="#2E6B53" />
              <rect x="-9" y="32" width="18" height="10" rx="5" fill="#16302B" />
            </g>
            {/* front leg */}
            <g className="wm-leg-left" transform="translate(64,96)">
              <rect x="-7" y="0" width="14" height="34" rx="7" fill="#39FF85" />
              <rect x="-9" y="32" width="18" height="10" rx="5" fill="#16302B" />
            </g>

            {/* back arm */}
            <g className="wm-arm-right" transform="translate(96,58)">
              <rect x="-6" y="0" width="12" height="30" rx="6" fill="#2E6B53" />
              <circle cx="0" cy="32" r="8" fill="#FFD27D" />
            </g>

            {/* bud body */}
            <path
              d="M75 30
                 C110 30 122 60 110 88
                 C124 96 124 112 108 116
                 C112 128 100 138 75 138
                 C50 138 38 128 42 116
                 C26 112 26 96 40 88
                 C28 60 40 30 75 30 Z"
              fill="#39FF85"
              stroke="#16302B"
              strokeWidth="3"
            />
            {/* trichome leaves */}
            <path d="M75 30 C68 14 58 10 50 16 C58 22 64 28 75 30 Z" fill="#2E6B53" />
            <path d="M75 30 C82 14 92 10 100 16 C92 22 86 28 75 30 Z" fill="#2E6B53" />

            {/* face */}
            <circle cx="58" cy="78" r="13" fill="#fff" />
            <circle cx="92" cy="78" r="13" fill="#fff" />
            <circle cx="60" cy="80" r="8" fill="#1E90FF" />
            <circle cx="94" cy="80" r="8" fill="#1E90FF" />
            <circle cx="57" cy="76" r="2.6" fill="#fff" />
            <circle cx="91" cy="76" r="2.6" fill="#fff" />

            <path
              d="M58 100 C68 116 82 116 92 100 C92 116 78 124 75 124 C72 124 58 116 58 100 Z"
              fill="#16302B"
            />
            <path d="M64 104 C70 110 80 110 86 104" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />

            {/* front arm with gesture hand */}
            <g className="wm-arm-left" transform="translate(54,58)">
              <rect x="-6" y="0" width="12" height="28" rx="6" fill="#39FF85" stroke="#16302B" strokeWidth="2" />
              <g className="wm-hand-l" transform="translate(0,30)">
                <circle cx="0" cy="0" r="9" fill="#FFD27D" />
                <rect x="-2.5" y="-16" width="5" height="12" rx="2.5" fill="#FFD27D" />
                <rect x="4" y="-14" width="5" height="11" rx="2.5" fill="#FFD27D" />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
