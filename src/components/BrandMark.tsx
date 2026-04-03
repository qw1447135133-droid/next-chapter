import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      src="/infinio-logo.png"
      alt="InFinio-一站式智能体自动化平台"
      className={cn("h-7 w-auto shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
