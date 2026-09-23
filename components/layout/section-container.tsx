import React from "react";
import { cn } from "@/lib/utils";

interface SectionContainerProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  gridBg?: boolean;
  className?: string;
  id?: string;
}

export function SectionContainer({
  children,
  gridBg = false,
  className,
  id,
  ...props
}: SectionContainerProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative py-16 md:py-24 overflow-hidden",
        gridBg && "bg-grid-pattern",
        className
      )}
      {...props}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {children}
      </div>
    </section>
  );
}
