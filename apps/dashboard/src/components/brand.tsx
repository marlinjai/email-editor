/** The Lumitra Mail mark: a brushed-gold envelope on the black card. */
export function BrandMark({ size = 28 }: { size?: number }) {
  const id = `mark-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9a04a" />
          <stop offset="0.42" stopColor="#f1d37a" />
          <stop offset="0.58" stopColor="#d9b552" />
          <stop offset="1" stopColor="#c9a04a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0f0e0c" stroke="rgba(241,211,122,0.28)" />
      <rect x="12" y="18" width="40" height="28" rx="4" fill="none" stroke={`url(#${id})`} strokeWidth="3.5" />
      <path d="M14 21 L32 35 L50 21" fill="none" stroke={`url(#${id})`} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
