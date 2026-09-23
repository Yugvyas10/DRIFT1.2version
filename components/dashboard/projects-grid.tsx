"use client";

import React, { useState, useEffect } from "react";
import { FolderGit2, Plus, Search, CheckCircle2, ShieldAlert, AlertTriangle } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent } from "@/components/ui/modal";

interface ProjectItem {
  id: string;
  name: string;
  env: string;
  specVersion: string;
  status: "HEALTHY" | "WARNING" | "CRITICAL";
  replayedRequests: string;
  lastRun: string;
}

const initialProjects: ProjectItem[] = [
  { id: "1", name: "Payments Core Microservice", env: "Production", specVersion: "v1.2.0", status: "HEALTHY", replayedRequests: "1.4M / mo", lastRun: "4m ago" },
  { id: "2", name: "Orders & Checkout Service", env: "Staging Candidate", specVersion: "v1.3.0-rc1", status: "CRITICAL", replayedRequests: "500k / mo", lastRun: "12m ago" },
  { id: "3", name: "User Auth & Tokens Mesh", env: "Production", specVersion: "v2.1.0", status: "HEALTHY", replayedRequests: "2.8M / mo", lastRun: "1h ago" },
  { id: "4", name: "Webhooks Dispatch Engine", env: "Production", specVersion: "v1.0.4", status: "WARNING", replayedRequests: "300k / mo", lastRun: "3h ago" },
];

export function ProjectsGrid() {
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [env, setEnv] = useState("Production");
  const [specVersion, setSpecVersion] = useState("v1.0.0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch initial projects from API endpoint
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (data.projects && Array.isArray(data.projects) && data.projects.length > 0) {
          const formatted = data.projects.map((p: any) => ({
            id: p.id,
            name: p.name,
            env: p.environment || "Production",
            specVersion: p.specVersion || "v1.0.0",
            status: "HEALTHY" as const,
            replayedRequests: "100k / mo",
            lastRun: "Just now",
          }));
          setProjects((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const newItems = formatted.filter((item: any) => !existingIds.has(item.id));
            return [...prev, ...newItems];
          });
        }
      })
      .catch((err) => console.error("Error fetching projects API:", err));
  }, []);

  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.env.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, environment: env, specVersion }),
      });
      const data = await res.json();

      if (data.project) {
        const newProj: ProjectItem = {
          id: data.project.id,
          name: data.project.name,
          env: data.project.environment,
          specVersion: data.project.specVersion,
          status: "HEALTHY",
          replayedRequests: "0 / mo",
          lastRun: "Just created",
        };
        setProjects((prev) => [newProj, ...prev]);
        setName("");
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error("Error creating project:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar: Filter & New Project Modal Trigger */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-slate-800 bg-[#0A0E17]">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              type="text"
              placeholder="Search microservices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-[#06080D] text-xs"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-800 bg-[#06080D] text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="HEALTHY">Healthy</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        <Button size="sm" onClick={() => setIsModalOpen(true)} className="shadow-cyan-glow w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1.5" /> Add Microservice Project
        </Button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredProjects.map((p) => (
          <SpotlightCard key={p.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-[#06080D] text-drift-cyan">
                  <FolderGit2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{p.name}</h4>
                  <p className="text-xs text-slate-400">{p.env} • <span className="font-mono text-drift-cyan">{p.specVersion}</span></p>
                </div>
              </div>

              <Badge
                variant={p.status === "HEALTHY" ? "success" : p.status === "WARNING" ? "warning" : "breaking"}
                className="text-[10px]"
              >
                {p.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 font-mono text-xs">
              <div>
                <span className="text-slate-500 text-[10px] block">REPLAY VOLUME</span>
                <span className="text-white font-bold">{p.replayedRequests}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">LAST SENTINEL RUN</span>
                <span className="text-slate-300">{p.lastRun}</span>
              </div>
            </div>
          </SpotlightCard>
        ))}
      </div>

      {/* Create Project Modal */}
      <Modal open={isModalOpen} onOpenChange={setIsModalOpen}>
        <ModalContent className="max-w-md bg-[#0A0E17] border-slate-800 p-6 space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">Add Microservice Project</h3>
            <p className="text-xs text-slate-400">Register a new microservice for contract AST diffing & shadow replay.</p>
          </div>

          <form onSubmit={handleCreateProject} className="space-y-4 font-sans text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-mono text-[10px] uppercase font-bold">Project Name</label>
              <Input
                type="text"
                placeholder="Billing & Invoicing Service"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-[#06080D] text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-mono text-[10px] uppercase font-bold">Environment</label>
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-800 bg-[#06080D] text-xs text-slate-300 focus:outline-none"
              >
                <option value="Production">Production</option>
                <option value="Staging Candidate">Staging Candidate</option>
                <option value="Development">Development</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-mono text-[10px] uppercase font-bold">Initial Spec Version</label>
              <Input
                type="text"
                placeholder="v1.0.0"
                value={specVersion}
                onChange={(e) => setSpecVersion(e.target.value)}
                required
                className="bg-[#06080D] text-xs font-mono"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={isSubmitting} className="shadow-cyan-glow">
                Create Project
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
