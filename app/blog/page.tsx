'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Clock,
  FileCode2,
  GitBranch,
  ShieldCheck,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  Reveal,
  StaggerGroup,
  staggerItem,
} from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { cn } from '@/lib/utils';

const featured = {
  category: 'Engineering',
  title: 'Why we built a semantic diff engine instead of a text diff',
  excerpt:
    'Text diffs tell you what changed. They don\'t tell you what breaks. Here\'s the architecture behind DRIFT\'s type-aware contract comparison — and why false positives are the enemy of adoption.',
  author: 'Priya Nair',
  date: 'Aug 1, 2026',
  readTime: '8 min read',
  icon: FileCode2,
};

const posts = [
  {
    category: 'Engineering',
    title: 'The consumer graph: mapping who breaks when you change',
    excerpt: 'How DRIFT builds a real-time dependency graph of every downstream service that reads your API fields.',
    author: 'Marcus Lee',
    date: 'Jul 28, 2026',
    readTime: '6 min read',
    icon: GitBranch,
  },
  {
    category: 'Security',
    title: 'Running DRIFT air-gapped: a regulated-industry guide',
    excerpt: 'A walkthrough of deploying DRIFT in a fully isolated environment with no internet egress.',
    author: 'Sofia Reyes',
    date: 'Jul 24, 2026',
    readTime: '10 min read',
    icon: ShieldCheck,
  },
  {
    category: 'Product',
    title: 'From 800ms to 118ms: optimizing the Rust diff core',
    excerpt: 'The profiling and algorithmic changes that cut our median diff latency by 85%.',
    author: 'James Park',
    date: 'Jul 20, 2026',
    readTime: '7 min read',
    icon: Zap,
  },
  {
    category: 'Engineering',
    title: 'Breaking, compatible, cosmetic: a classification framework',
    excerpt: 'How we decide whether a change is safe — and why your team should be able to override us.',
    author: 'Priya Nair',
    date: 'Jul 15, 2026',
    readTime: '9 min read',
    icon: Workflow,
  },
  {
    category: 'Product',
    title: 'Live drift monitoring: catching silent contract drift',
    excerpt: 'Production traffic rarely matches your spec. Here\'s how we detect the gaps before they break integrations.',
    author: 'Sofia Reyes',
    date: 'Jul 10, 2026',
    readTime: '5 min read',
    icon: GitBranch,
  },
  {
    category: 'Engineering',
    title: 'Why we chose Rust for the diff core (and TypeScript for everything else)',
    excerpt: 'A pragmatic split: Rust where latency matters, TypeScript where iteration speed does.',
    author: 'James Park',
    date: 'Jul 5, 2026',
    readTime: '6 min read',
    icon: FileCode2,
  },
];

const categories = ['All', 'Engineering', 'Product', 'Security'];

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState(0);

  return (
    <>
      <PageHero
        eyebrow="Blog"
        title={
          <>
            Ideas on <span className="gradient-text">API regression.</span>
          </>
        }
        description="Deep dives from the DRIFT team on contract engineering, performance, and building developer tools that teams actually trust."
      />

      {/* Featured post */}
      <section className="section-pad relative">
        <div className="container-max">
          <Reveal variant="scale">
            <Link href="/blog" className="group block overflow-hidden rounded-3xl glass-panel transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_60px_-20px_hsl(174_72%_51%/0.2)]">
              <div className="grid lg:grid-cols-[1.2fr_1fr]">
                <div className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-chart-2/5 to-transparent p-12">
                  <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
                  <featured.icon className="h-24 w-24 text-primary/40 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-3" />
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                </div>
                <div className="flex flex-col justify-center p-8 lg:p-12">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {featured.category}
                    </span>
                    <span className="text-xs text-muted-foreground">Featured</span>
                  </div>
                  <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight sm:text-3xl text-balance">
                    {featured.title}
                  </h2>
                  <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                    {featured.excerpt}
                  </p>
                  <div className="mt-6 flex items-center gap-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-chart-2/20 text-xs font-semibold text-primary ring-1 ring-primary/20">
                        {featured.author.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{featured.author}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{featured.date}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {featured.readTime}
                    </span>
                  </div>
                  <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    Read article
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Category filter + grid */}
      <section className="section-pad relative">
        <div className="container-max">
          <Reveal variant="fade">
            <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
              {categories.map((cat, i) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(i)}
                  className={cn(
                    'relative rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-300',
                    i === activeCategory
                      ? 'text-foreground'
                      : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {i === activeCategory && (
                    <motion.span
                      layoutId="blog-category"
                      className="absolute inset-0 rounded-full border border-primary/40 bg-primary/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{cat}</span>
                </button>
              ))}
            </div>
          </Reveal>

          <StaggerGroup className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <motion.div key={post.title} variants={staggerItem}>
                <Link
                  href="/blog"
                  className="group flex h-full flex-col overflow-hidden rounded-2xl glass-panel transition-all hover:border-primary/40"
                >
                  <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-secondary/40 to-transparent">
                    <div className="pointer-events-none absolute inset-0 dot-bg opacity-20" />
                    <post.icon className="h-12 w-12 text-primary/30 transition-transform duration-500 group-hover:scale-110" />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-secondary/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {post.category}
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-lg font-semibold leading-tight tracking-tight">
                      {post.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm text-muted-foreground leading-relaxed">
                      {post.excerpt}
                    </p>
                    <div className="mt-5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-chart-2/20 text-xs font-semibold text-primary ring-1 ring-primary/20">
                          {post.author.charAt(0)}
                        </div>
                        <span className="text-xs text-muted-foreground">{post.author}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {post.readTime}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Newsletter */}
      <section className="section-pad relative">
        <div className="container-max">
          <Reveal variant="scale">
            <div className="relative overflow-hidden rounded-3xl glass-panel p-10 text-center sm:p-16">
              <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
              <div className="relative">
                <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl text-balance">
                  Get the DRIFT newsletter.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                  One email per month. Engineering deep dives, no marketing fluff.
                </p>
                <form className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row" onSubmit={(e) => e.preventDefault()}>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    className="flex-1 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="submit"
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_-4px_hsl(174_72%_51%/0.5)]"
                  >
                    Subscribe
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </form>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
