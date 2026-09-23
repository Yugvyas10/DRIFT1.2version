'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Logo } from '@/components/site/logo';
import { Github, Twitter, Linkedin, ArrowUpRight } from 'lucide-react';
import { StaggerGroup, staggerItem } from '@/components/site/primitives';

const columns = [
  {
    title: 'Product',
    links: [
      { href: '/technology', label: 'Technology' },
      { href: '/interactive-pipeline', label: 'Interactive Pipeline' },
      { href: '/live-demo', label: 'Live Demo' },
      { href: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/docs', label: 'Documentation' },
      { href: '/blog', label: 'Blog' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/enterprise', label: 'Enterprise' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Get started' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

const socials = [
  { icon: Github, href: 'https://github.com', label: 'GitHub' },
  { icon: Twitter, href: 'https://twitter.com', label: 'Twitter' },
  { icon: Linkedin, href: 'https://linkedin.com', label: 'LinkedIn' },
];

export function Footer() {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith('/auth') || pathname === '/login' || pathname === '/register';
  const isDashboard = pathname?.startsWith('/dashboard');

  if (isAuth || isDashboard) return null;

  return (
    <footer className="relative mt-32 border-t border-border/60 bg-background-2/40">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="container-max px-6 py-16 sm:px-8 md:px-12 lg:px-16">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_2fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-5"
          >
            <Link href="/" className="group flex items-center gap-2.5">
              <Logo className="h-8 w-8 transition-transform duration-500 group-hover:rotate-90" />
              <span className="font-display text-lg font-semibold tracking-tight">
                DRIFT
              </span>
            </Link>
            <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
              Contract-aware API regression analysis for teams that ship fast
              without breaking things. Catch drift before it reaches production.
            </p>
            <div className="flex items-center gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/40 text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-[0_6px_20px_-6px_hsl(174_72%_51%/0.4)]"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </motion.div>

          <StaggerGroup stagger={0.07} className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <motion.div key={col.title} variants={staggerItem} className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                  {col.title}
                </h4>
                {col.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                    <ArrowUpRight className="h-3 w-3 opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                  </Link>
                ))}
              </motion.div>
            ))}
          </StaggerGroup>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-8 sm:flex-row"
        >
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} DRIFT Systems, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Security
            </Link>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
