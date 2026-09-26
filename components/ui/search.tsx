"use client";

import React from "react";
import { Search as SearchIcon } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";

export function SearchTrigger({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick?: () => void;
}) {
  const { toggleSearch } = useAppStore();
  const handleClick = onClick || toggleSearch;

  if (compact) {
    return (
      <button
        onClick={handleClick}
        aria-label="Search documentation"
        title="Search (⌘K)"
        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:bg-secondary/60 hover:text-foreground transition-all shadow-sm cursor-pointer"
      >
        <SearchIcon className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-[10px] text-muted-foreground/80">
          ⌘K
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-3.5 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:bg-secondary/60 hover:text-foreground transition-all shadow-sm cursor-pointer"
    >
      <SearchIcon className="h-3.5 w-3.5 text-primary" />
      <span>Search docs...</span>
      <kbd className="pointer-events-none ml-1.5 inline-flex h-4.5 select-none items-center gap-0.5 rounded border border-border/80 bg-background/60 px-1.5 font-mono text-[10px] text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  );
}
