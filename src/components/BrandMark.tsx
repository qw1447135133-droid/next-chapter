import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-7 w-7 shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="blueGradient" x1="0" y1="256" x2="256" y2="256" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <linearGradient id="purpleGradient" x1="256" y1="256" x2="512" y2="256" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>

      {/* Left loop (blue) - multiple strokes for depth */}
      <path
        d="M 100,256 C 100,180 130,140 180,140 C 230,140 260,180 260,220 C 260,260 230,300 180,300 C 130,300 100,332 100,256 Z"
        stroke="url(#blueGradient)"
        strokeWidth="32"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M 110,256 C 110,190 135,155 180,155 C 225,155 250,190 250,220 C 250,250 225,285 180,285 C 135,285 110,322 110,256 Z"
        stroke="url(#blueGradient)"
        strokeWidth="24"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M 120,256 C 120,200 140,170 180,170 C 220,170 240,200 240,220 C 240,240 220,270 180,270 C 140,270 120,312 120,256 Z"
        stroke="url(#blueGradient)"
        strokeWidth="16"
        fill="none"
        strokeLinecap="round"
        opacity="0.3"
      />

      {/* Right loop (purple) - multiple strokes for depth */}
      <path
        d="M 332,220 C 332,180 362,140 412,140 C 462,140 492,180 492,256 C 492,332 462,372 412,372 C 362,372 332,260 332,220 Z"
        stroke="url(#purpleGradient)"
        strokeWidth="32"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M 342,220 C 342,190 367,155 412,155 C 457,155 482,190 482,256 C 482,322 457,357 412,357 C 367,357 342,250 342,220 Z"
        stroke="url(#purpleGradient)"
        strokeWidth="24"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M 352,220 C 352,200 372,170 412,170 C 452,170 472,200 472,256 C 472,312 452,342 412,342 C 372,342 352,240 352,220 Z"
        stroke="url(#purpleGradient)"
        strokeWidth="16"
        fill="none"
        strokeLinecap="round"
        opacity="0.3"
      />

      {/* Connecting bridge */}
      <path
        d="M 260,220 Q 296,210 332,220"
        stroke="#6366f1"
        strokeWidth="32"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Stars/sparkles */}
      <g fill="#60a5fa" opacity="0.9">
        <circle cx="150" cy="200" r="6" />
        <circle cx="210" cy="270" r="5" />
      </g>
      <g fill="#c084fc" opacity="0.9">
        <circle cx="380" cy="210" r="5.5" />
        <circle cx="440" cy="300" r="6" />
      </g>

      <g stroke="#a855f7" strokeWidth="4" opacity="0.8" strokeLinecap="round">
        <line x1="130" y1="180" x2="130" y2="195" />
        <line x1="122.5" y1="187.5" x2="137.5" y2="187.5" />

        <line x1="460" y1="320" x2="460" y2="335" />
        <line x1="452.5" y1="327.5" x2="467.5" y2="327.5" />
      </g>
    </svg>
  );
}
