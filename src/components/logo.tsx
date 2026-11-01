/** SAMVAAD logo: a school building with three children in front. Inline SVG, decorative (the wordmark beside it carries the name). */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect width="64" height="64" rx="16" fill="#138076" />
      {/* sun */}
      <circle cx="52" cy="12" r="4.5" fill="#fbbf24" />
      {/* flag */}
      <path d="M32 6v9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M32 6.5l7 2.4-7 2.4z" fill="#fbbf24" />
      {/* school */}
      <path d="M32 14L12 26h40z" fill="#fff" />
      <rect x="14" y="26" width="36" height="20" fill="#fff" />
      <rect x="18" y="30" width="6" height="6" rx="1" fill="#138076" />
      <rect x="40" y="30" width="6" height="6" rx="1" fill="#138076" />
      <path d="M28 46V37.5a4 4 0 018 0V46z" fill="#138076" />
      {/* ground */}
      <rect x="6" y="46" width="52" height="2.5" rx="1.25" fill="#0f6b63" />
      {/* children: left (girl), centre (boy), right */}
      <g>
        <circle cx="15" cy="46" r="3.2" fill="#fbbf24" />
        <path d="M10.5 59.5l4.5-10 4.5 10z" fill="#fb7185" />
        <circle cx="32" cy="50" r="3.2" fill="#fde68a" />
        <path d="M27.5 61.5V54a4.5 4.5 0 019 0v7.5z" fill="#60a5fa" />
        <circle cx="49" cy="46" r="3.2" fill="#fbbf24" />
        <path d="M44.5 59.5l4.5-10 4.5 10z" fill="#a78bfa" />
      </g>
    </svg>
  );
}
