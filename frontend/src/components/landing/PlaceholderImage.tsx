import { GemIcon } from "./icons";

export function PlaceholderImage({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] text-[#94A3B8] ${className}`}
    >
      <GemIcon className="h-8 w-8" />
      {label && <span className="px-2 text-center text-xs font-medium">{label}</span>}
    </div>
  );
}
