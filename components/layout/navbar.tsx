'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import {
  AnimatePresence,
  motion,
  useScroll,
  useMotionValueEvent,
} from 'framer-motion';
import {
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Building2,
  Mail,
  Settings,
  Info,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/site/logo';
import { SearchTrigger } from '@/components/ui/search';

const primaryLinks = [
  { href: '/technology', label: 'Technology' },
  { href: '/interactive-pipeline', label: 'Pipeline' },
  { href: '/live-demo', label: 'Live Demo' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
];

const secondaryLinks = [
  {
    href: '/enterprise',
    label: 'Enterprise',
    desc: 'Air-gapped & SOC 2 security deployments',
    icon: Building2,
  },
  {
    href: '/contact',
    label: 'Contact',
    desc: 'Get in touch with our engineering team',
    icon: Mail,
  },
  {
    href: '/settings',
    label: 'Settings',
    desc: 'Account preferences & API key management',
    icon: Settings,
  },
  {
    href: '/about',
    label: 'About',
    desc: 'Our engineering philosophy & architecture',
    icon: Info,
  },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Hide on scroll-down, reveal on scroll-up (desktop only, so the
  // mobile drawer trigger stays reachable).
  useMotionValueEvent(scrollY, 'change', (latest) => {
    const prev = scrollY.getPrevious() ?? 0;
    if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) {
      setHidden(false);
      return;
    }
    if (latest > prev && latest > 140 && !open && !moreOpen) setHidden(true);
    else if (latest < prev) setHidden(false);
  });

  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  // Click outside listener for "More" dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAuth = pathname?.startsWith('/auth') || pathname === '/login' || pathname === '/register';
  const isDashboard = pathname?.startsWith('/dashboard');

  if (isAuth || isDashboard) return null;

  const isMoreActive = secondaryLinks.some((link) => pathname === link.href);

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: hidden ? '-110%' : 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        onMouseEnter={() => setHidden(false)}
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-500',
          scrolled
            ? 'border-b border-border/40 bg-background/75 backdrop-blur-2xl shadow-lg shadow-black/20'
            : 'border-b border-transparent bg-transparent'
        )}
      >
        <nav className="container-max flex h-14 items-center justify-between px-4 sm:px-6 md:h-16">
          {/* Brand Logo */}
          <Link href="/" className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <Logo className="h-7 w-7 transition-transform group-hover:scale-105" />
            <span className="font-display text-base font-bold tracking-tight text-foreground">
              DRIFT
            </span>
          </Link>

          {/* Main Navigation Links */}
          <div className="hidden items-center gap-0.5 lg:flex">
            {primaryLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    'after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-gradient-to-r after:from-primary after:to-chart-2 after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-100',
                    active
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-full bg-secondary/80 border border-border/60"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{link.label}</span>
                </Link>
              );
            })}

            {/* "More" Dropdown */}
            <div className="relative ml-0.5" ref={dropdownRef}>
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  isMoreActive || moreOpen
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span>More</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', moreOpen && 'rotate-180 text-primary')} />
              </button>

              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur-2xl shadow-xl ring-1 ring-white/10"
                  >
                    <div className="space-y-0.5">
                      {secondaryLinks.map((item) => {
                        const Icon = item.icon;
                        const active = pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMoreOpen(false)}
                            className={cn(
                              'group flex items-start gap-3 rounded-xl p-2.5 transition-colors',
                              active
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-secondary/60 text-foreground'
                            )}
                          >
                            <div className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                              active
                                ? 'border-primary/40 bg-primary/20 text-primary'
                                : 'border-border/60 bg-secondary/40 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary'
                            )}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold tracking-tight">{item.label}</span>
                                <ChevronRight className="h-3 w-3 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
                              </div>
                              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                                {item.desc}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Action Trigger Buttons */}
          <div className="hidden items-center gap-2 lg:flex">
            <SearchTrigger compact />

            <div className="h-4 w-px bg-border/60 mx-1" />

            <Link
              href="/login"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="group inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:shadow-[0_0_20px_-4px_hsl(174_72%_51%/0.6)] active:scale-95"
            >
              <span>Get started</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex items-center gap-2 lg:hidden">
            <SearchTrigger compact />
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-secondary/40 text-foreground backdrop-blur-md"
              aria-label="Toggle menu"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </nav>
      </motion.header>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-xl"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-x-0 top-14 border-b border-border/60 bg-background/95 p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="space-y-1">
                <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Navigation
                </span>
                {primaryLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      pathname === link.href
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    )}
                  >
                    <span>{link.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </Link>
                ))}
              </div>

              <div className="h-px bg-border/60" />

              <div className="space-y-1">
                <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Platform & Organization
                </span>
                {secondaryLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                        pathname === link.href
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="h-px bg-border/60" />

              <div className="flex flex-col gap-2 pt-1">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border/60 bg-secondary/40 py-2.5 text-center text-sm font-medium text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-lg"
                >
                  Get started
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
