import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      src="/brandmark.png"
      alt="Next Chapter"
      className={cn("h-7 w-auto shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
