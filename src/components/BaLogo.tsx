interface BaLogoProps {
  variant?: 'dark' | 'light';
}

export function BaLogo({ variant = 'dark' }: BaLogoProps) {
  const isDark = variant === 'dark';
  const primaryText = isDark ? 'text-[#1A1A1A]' : 'text-white';
  const secondaryText = isDark ? 'text-[#1A1A1A]/75' : 'text-white/75';
  const boxBg = isDark ? 'bg-[#1A1A1A]' : 'bg-[#FFD700]';
  const boxText = isDark ? 'text-[#FFD700]' : 'text-[#1A1A1A]';

  return (
    <div className="flex items-center gap-2.5 select-none shrink-0">
      <div
        className={`w-10 h-10 rounded-lg ${boxBg} flex items-center justify-center shadow-xs shrink-0`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 36 36" className="w-7 h-7" fill="none">
          <path
            d="M18 4L20.5 11.5V28H15.5V11.5L18 4Z"
            className={isDark ? 'fill-[#FFD700]' : 'fill-[#1A1A1A]'}
          />
          <rect
            x="11"
            y="29"
            width="14"
            height="2.5"
            rx="1"
            className={isDark ? 'fill-[#FFD700]' : 'fill-[#1A1A1A]'}
          />
          <path
            d="M11 14C9 15.5 8 17.5 8 20M25 14C27 15.5 28 17.5 28 20"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={boxText}
          />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={`font-display font-extrabold text-[15px] tracking-tight whitespace-nowrap ${primaryText}`}
        >
          Buenos Aires Ciudad
        </span>
        <span className={`text-[11px] font-semibold tracking-wide mt-0.5 whitespace-nowrap ${secondaryText}`}>
          EMUI · Infraestructura IT
        </span>
      </div>
    </div>
  );
}
