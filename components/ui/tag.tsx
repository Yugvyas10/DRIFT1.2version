import * as React from "react";
import { cn } from "@/lib/utils";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  active?: boolean;
  onSelect?: () => void;
}

export function Tag({ className, active, onSelect, children, ...props }: TagProps) {
  return (
    <span
      onClick={onSelect}
      className={cn(
        "inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs font-mono transition-all",
        active
          ? "border-drift-cyan bg-drift-cyan/15 text-drift-cyan font-medium"
          : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
