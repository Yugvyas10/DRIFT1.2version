'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  ArrowRight,
  FileText,
  Layers,
  Play,
  ShieldAlert,
  Cpu,
  DollarSign,
  Settings,
  Key,
  BookOpen,
  Terminal,
  Sparkles,
  Command as CommandIcon,
  X,
  CornerDownLeft,
  Building2,
  Info,
  Mail,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';

export interface CommandItem {
  id: string;
  title: string;
  category: 'Quick Actions' | 'Navigation' | 'Documentation' | 'Platform & Settings';
  href?: string;
  action?: () => void;
  snippet: string;
  keywords?: string[];
  icon: React.ElementType;
  shortcut?: string;
}

const commandDatabase: CommandItem[] = [
  // Quick Actions
  {
    id: 'act-demo',
    title: 'Launch Live AST & Traffic Demo Sandbox',
    category: 'Quick Actions',
    href: '/live-demo',
    snippet: 'Run interactive OpenAPI diffing and shadow replay simulation in browser',
    keywords: ['sandbox', 'demo', 'diff', 'try', 'test'],
    icon: Play,
    shortcut: '↵',
  },
  {
    id: 'act-pipeline',
    title: 'Inspect 6-Stage API Sentinel Pipeline',
    category: 'Quick Actions',
    href: '/interactive-pipeline',
    snippet: 'Step through contract ingestion, semantic diff, and CI PR gate',
    keywords: ['pipeline', 'stages', 'flow', 'sentinel'],
    icon: Layers,
    shortcut: '⌘P',
  },
  {
    id: 'act-cli',
    title: 'Copy drift check CLI Command',
    category: 'Quick Actions',
    href: '/docs#cli',
    snippet: 'drift check --baseline=openapi.v1.yaml --candidate=openapi.v2.yaml',
    keywords: ['cli', 'terminal', 'command', 'run'],
    icon: Terminal,
    shortcut: '⌘C',
  },

  // Navigation
  {
    id: 'nav-tech',
    title: 'Technology & Engine Architecture',
    category: 'Navigation',
    href: '/technology',
    snippet: 'Rust semantic diff core, consumer dependency graph, and eBPF traffic capture',
    keywords: ['rust', 'ebpf', 'tech', 'architecture'],
    icon: Cpu,
  },
  {
    id: 'nav-dashboard',
    title: 'Analytics Telemetry Dashboard',
    category: 'Navigation',
    href: '/dashboard',
    snippet: 'Active sentinel runs, service project grid, and compatibility charts',
    keywords: ['dashboard', 'telemetry', 'analytics', 'projects'],
    icon: ShieldAlert,
  },
  {
    id: 'nav-docs',
    title: 'Documentation Platform',
    category: 'Navigation',
    href: '/docs',
    snippet: 'Comprehensive integration guides, SDK reference, and FAQ',
    keywords: ['docs', 'guides', 'help', 'api'],
    icon: BookOpen,
  },
  {
    id: 'nav-pricing',
    title: 'Pricing & Enterprise Licenses',
    category: 'Navigation',
    href: '/pricing',
    snippet: 'Hobby Free, Pro $49/mo, and Self-Hosted Enterprise tiers',
    keywords: ['pricing', 'plans', 'pro', 'enterprise'],
    icon: DollarSign,
  },
  {
    id: 'nav-blog',
    title: 'Engineering Blog & Articles',
    category: 'Navigation',
    href: '/blog',
    snippet: 'Technical deep-dives on API regression testing and zero false-positives',
    keywords: ['blog', 'articles', 'posts', 'news'],
    icon: FileText,
  },
  {
    id: 'nav-enterprise',
    title: 'Enterprise Air-Gapped Deployments',
    category: 'Navigation',
    href: '/enterprise',
    snippet: 'SOC 2 Type II, SAML 2.0 / SCIM SSO, and custom CI connectors',
    keywords: ['enterprise', 'soc2', 'saml', 'sso', 'security'],
    icon: Building2,
  },
  {
    id: 'nav-contact',
    title: 'Contact Sales Engineering',
    category: 'Navigation',
    href: '/contact',
    snippet: 'Schedule a technical architecture call with our team',
    keywords: ['contact', 'sales', 'support', 'email'],
    icon: Mail,
  },
  {
    id: 'nav-about',
    title: 'About DRIFT Philosophy',
    category: 'Navigation',
    href: '/about',
    snippet: 'Structural AST dereferencing combined with shadow traffic replay',
    keywords: ['about', 'company', 'philosophy'],
    icon: Info,
  },

  // Documentation & Guides
  {
    id: 'doc-cli-ref',
    title: 'CLI Command Line Interface Reference',
    category: 'Documentation',
    href: '/docs#cli',
    snippet: 'Commands: drift init, drift check, drift replay, drift ci',
    keywords: ['cli', 'reference', 'commands', 'terminal'],
    icon: Terminal,
  },
  {
    id: 'doc-github',
    title: 'GitHub Actions Integration Guide',
    category: 'Documentation',
    href: '/docs#github',
    snippet: 'Add .github/workflows/drift.yml to block breaking PR merges',
    keywords: ['github', 'actions', 'ci', 'workflow'],
    icon: Zap,
  },
  {
    id: 'doc-rules',
    title: 'Compatibility Rules & Overrides',
    category: 'Documentation',
    href: '/docs#rules',
    snippet: 'Classify changes as breaking, compatible, or cosmetic via drift.config.ts',
    keywords: ['rules', 'config', 'breaking', 'cosmetic'],
    icon: FileText,
  },

  // Platform & Settings
  {
    id: 'set-profile',
    title: 'User Profile & Preferences',
    category: 'Platform & Settings',
    href: '/settings',
    snippet: 'Manage avatar, email, notification webhooks, and team roles',
    keywords: ['settings', 'profile', 'user', 'account'],
    icon: Settings,
  },
  {
    id: 'set-keys',
    title: 'API Sentinel Keys Manager',
    category: 'Platform & Settings',
    href: '/settings#keys',
    snippet: 'Manage drft_live_ authentication tokens for CI runners',
    keywords: ['api', 'keys', 'tokens', 'secrets'],
    icon: Key,
  },
];

export function GlobalSearchModal() {
  const router = useRouter();
  const { isSearchOpen, setSearchOpen } = useAppStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keyboard shortcut listener (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(!isSearchOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setSearchOpen]);

  // Filter commands by fuzzy match
  const filteredResults = useMemo(() => {
    if (!query.trim()) {
      // Default / empty search view shows top quick actions and navigation items
      return commandDatabase;
    }
    const q = query.toLowerCase().trim();
    return commandDatabase.filter((item) => {
      const titleMatch = item.title.toLowerCase().includes(q);
      const snippetMatch = item.snippet.toLowerCase().includes(q);
      const categoryMatch = item.category.toLowerCase().includes(q);
      const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(q));
      return titleMatch || snippetMatch || categoryMatch || keywordMatch;
    });
  }, [query]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on modal open
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isSearchOpen]);

  // Auto scroll active selection item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Keyboard Navigation inside Modal (Up, Down, Enter, Esc)
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % Math.max(1, filteredResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        executeItem(filteredResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchOpen(false);
    }
  };

  const executeItem = (item: CommandItem) => {
    setSearchOpen(false);
    setQuery('');
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
    }
  };

  // Helper to highlight matching query text
  const renderHighlightedText = (text: string, highlightQuery: string) => {
    if (!highlightQuery.trim()) return text;
    const parts = text.split(new RegExp(`(${highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === highlightQuery.toLowerCase() ? (
            <mark key={i} className="bg-primary/30 text-primary font-bold rounded px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Group items by Category
  const categorized = useMemo(() => {
    const map: Record<string, CommandItem[]> = {};
    filteredResults.forEach((item) => {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    });
    return map;
  }, [filteredResults]);

  let globalItemIndex = 0;

  if (!isSearchOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-xl"
          onClick={() => setSearchOpen(false)}
        />

        {/* Command Palette Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -12 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl glass-strong border border-primary/30 shadow-2xl ring-1 ring-white/10"
          onKeyDown={handleModalKeyDown}
        >
          {/* Header Search Input */}
          <div className="relative flex items-center border-b border-border/60 px-4 py-3 bg-background/40">
            <Search className="h-4 w-4 text-primary mr-3 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search documentation, pages, CLI..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 text-muted-foreground hover:text-foreground mr-2"
                aria-label="Clear query"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-secondary/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Body Results List */}
          <div className="max-h-[380px] overflow-y-auto p-2 font-sans text-xs space-y-4">
            {filteredResults.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/40 text-muted-foreground">
                  <Search className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">No results found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No commands or pages matching &quot;<span className="text-primary">{query}</span>&quot;
                  </p>
                </div>
              </div>
            ) : (
              Object.entries(categorized).map(([category, items]) => (
                <div key={category} className="space-y-1">
                  <div className="px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center justify-between">
                    <span>{category}</span>
                    <span className="text-[9px] font-normal lowercase">{items.length} items</span>
                  </div>

                  {items.map((item) => {
                    const currentIndex = globalItemIndex++;
                    const isSelected = currentIndex === selectedIndex;
                    const IconComp = item.icon;

                    return (
                      <button
                        key={item.id}
                        ref={(el) => {
                          itemRefs.current[currentIndex] = el;
                        }}
                        onClick={() => executeItem(item)}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        className={cn(
                          'flex items-center justify-between w-full px-3 py-2.5 rounded-xl transition-all text-left group relative',
                          isSelected
                            ? 'bg-primary/15 text-foreground ring-1 ring-primary/30 border-l-2 border-primary'
                            : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                              isSelected
                                ? 'border-primary/50 bg-primary/20 text-primary'
                                : 'border-border/60 bg-secondary/40 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary'
                            )}
                          >
                            <IconComp className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-foreground truncate">
                                {renderHighlightedText(item.title, query)}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                              {renderHighlightedText(item.snippet, query)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {item.shortcut && (
                            <kbd className="hidden sm:inline-flex items-center justify-center rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {item.shortcut}
                            </kbd>
                          )}
                          <ArrowRight
                            className={cn(
                              'h-3.5 w-3.5 transition-all',
                              isSelected
                                ? 'text-primary translate-x-0.5 opacity-100'
                                : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100'
                            )}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer Shortcuts Guide */}
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 bg-background/50 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-secondary/60 px-1 font-mono text-[9px]">↑</kbd>
                <kbd className="rounded border border-border bg-secondary/60 px-1 font-mono text-[9px]">↓</kbd>
                <span>Navigate</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9px]">↵</kbd>
                <span>Select</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9px]">ESC</kbd>
                <span>Close</span>
              </span>
            </div>

            <div className="flex items-center gap-1 text-[10px] font-mono text-primary/80">
              <Sparkles className="h-3 w-3 text-primary animate-pulse" />
              <span>DRIFT Command Palette</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
