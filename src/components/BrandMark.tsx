import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      src="/infinio-logo.png"
      alt="Infinio"
      className={cn("h-7 w-auto shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
