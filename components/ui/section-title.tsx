import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SectionTitleProps {
  badge?: string;
  title: string;
  subtitle?: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}

export function SectionTitle({
  badge,
  title,
  subtitle,
  description,
  align = "center",
  className,
}: SectionTitleProps) {
  const textBody = subtitle || description;
  return (
    <div
      className={cn(
        "flex flex-col space-y-3 mb-12",
        align === "center" ? "items-center text-center max-w-3xl mx-auto" : "items-start text-left max-w-2xl",
        className
      )}
    >
      {badge && <Badge variant="default" className="font-mono">{badge}</Badge>}
      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
        {title}
      </h2>
      {textBody && (
        <p className="text-base text-slate-400 leading-relaxed max-w-2xl">
          {textBody}
        </p>
      )}
    </div>
  );
}
