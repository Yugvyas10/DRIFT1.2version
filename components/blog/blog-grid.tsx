"use client";

import React, { useState } from "react";
import { BookOpen, Search, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SpotlightCard } from "@/components/ui/spotlight-card";

interface BlogPost {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  date: string;
  readTime: string;
}

const mockPosts: BlogPost[] = [
  { id: "1", title: "Why Traditional OpenAPI Diffing Fails in Production Microservices", category: "API Design", excerpt: "Static JSON schema comparisons miss 60% of breaking runtime mutations. Here is how shadow traffic replay changes API Sentinel design.", date: "July 28, 2026", readTime: "6 min read" },
  { id: "2", title: "Building a WASM-Powered AST Parser for OpenAPI 3.1 Dereferencing", category: "Platform Engineering", excerpt: "How we achieved sub-15ms AST dereferencing across circular schema references using Rust compiled to WebAssembly.", date: "July 15, 2026", readTime: "8 min read" },
  { id: "3", title: "Automating PR Merge Blocking with GitHub Actions & eBPF Probes", category: "DevOps", excerpt: "A guide to enforcing contract compatibility gates inline on pull request diff lines without slowing down developer velocity.", date: "June 30, 2026", readTime: "5 min read" },
];

export function BlogGrid() {
  const [search, setSearch] = useState("");

  const filtered = mockPosts.filter((post) =>
    post.title.toLowerCase().includes(search.toLowerCase()) || post.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search blog articles by title or category..."
        icon={<Search className="h-4 w-4" />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filtered.map((post) => (
          <SpotlightCard key={post.id} className="flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="default" className="text-[10px]">{post.category}</Badge>
                <span className="text-[10px] text-slate-500 font-mono">{post.readTime}</span>
              </div>
              <h3 className="text-base font-bold text-white leading-snug">{post.title}</h3>
              <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{post.excerpt}</p>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-500 font-mono text-[10px]">{post.date}</span>
              <span className="text-drift-cyan font-bold flex items-center">Read Article <ArrowRight className="ml-1 h-3 w-3" /></span>
            </div>
          </SpotlightCard>
        ))}
      </div>
    </div>
  );
}
