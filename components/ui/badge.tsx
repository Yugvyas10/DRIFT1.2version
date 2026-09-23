import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-drift-cyan/30 bg-drift-cyan/10 text-drift-cyan shadow-[0_0_10px_rgba(0,240,255,0.15)]",
        secondary:
          "border-slate-700 bg-slate-800/80 text-slate-300",
        breaking:
          "border-rose-500/40 bg-rose-500/10 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.15)]",
        warning:
          "border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]",
        success:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]",
        purple:
          "border-purple-500/40 bg-purple-500/10 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.15)]",
        outline: "border-slate-700 text-slate-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
