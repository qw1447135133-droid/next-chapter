import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 220 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-7 w-12 shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brandMarkStroke" x1="20" y1="18" x2="200" y2="102" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2140A5" />
          <stop offset="0.42" stopColor="#2EA6D5" />
          <stop offset="0.7" stopColor="#7C5CE6" />
          <stop offset="1" stopColor="#B45AE1" />
        </linearGradient>
        <linearGradient id="brandMarkGlow" x1="36" y1="22" x2="185" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9EE7FF" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#C9BCFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFD1FF" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      <path
        d="M56 60C56 38 40 24 22 24C10 24 0 34 0 49C0 74 20 95 48 95C73 95 91 74 108 60C126 45 145 24 171 24C197 24 220 45 220 71C220 93 204 108 185 108C157 108 137 84 121 69C105 53 86 24 56 24C26 24 3 47 3 71"
        stroke="url(#brandMarkStroke)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M58 60C58 44 46 34 30 34C18 34 10 41 10 51C10 68 24 84 45 84C65 84 82 69 98 54C116 38 136 14 168 14C188 14 205 25 213 42"
        stroke="url(#brandMarkGlow)"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.95"
      />

      <g fill="#D9F7FF">
        <circle cx="21" cy="67" r="3.2" opacity="0.95" />
        <circle cx="50" cy="28" r="2.1" opacity="0.7" />
        <circle cx="98" cy="72" r="2.4" opacity="0.72" />
        <circle cx="155" cy="30" r="2.8" opacity="0.88" />
        <circle cx="190" cy="76" r="2.2" opacity="0.82" />
        <circle cx="122" cy="18" r="1.8" opacity="0.76" />
      </g>

      <g stroke="#EFFBFF" strokeLinecap="round" opacity="0.82">
        <path d="M73 33L75.3 38.7L81 41L75.3 43.3L73 49L70.7 43.3L65 41L70.7 38.7L73 33Z" strokeWidth="1.4" />
        <path d="M148 74L149.7 77.8L153.5 79.5L149.7 81.2L148 85L146.3 81.2L142.5 79.5L146.3 77.8L148 74Z" strokeWidth="1.2" />
        <path d="M177 44L178.3 46.9L181.2 48.2L178.3 49.5L177 52.4L175.7 49.5L172.8 48.2L175.7 46.9L177 44Z" strokeWidth="1.1" />
      </g>
    </svg>
  );
}
