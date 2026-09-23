"use client";

import React, { useState } from "react";
import { FileCode, Search, Code, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";

interface EndpointItem {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  summary: string;
  schemaSnippet: string;
}

const mockEndpoints: EndpointItem[] = [
  {
    id: "ep-1",
    method: "POST",
    path: "/v2/orders",
    summary: "Create a new checkout order",
    schemaSnippet: `{
  "parameters": [
    { "name": "amount", "type": "integer", "required": true },
    { "name": "billing_zip", "type": "string", "required": true }
  ]
}`,
  },
  {
    id: "ep-2",
    method: "GET",
    path: "/v1/users",
    summary: "Retrieve user profile details",
    schemaSnippet: `{
  "responses": {
    "200": { "description": "User object with created_timestamp" }
  }
}`,
  },
  {
    id: "ep-3",
    method: "POST",
    path: "/v1/payments/charge",
    summary: "Execute credit card token charge",
    schemaSnippet: `{
  "requestBody": {
    "required": true,
    "content": { "application/json": { "schema": { "type": "object" } } }
  }
}`,
  },
];

export function ApiExplorerView() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointItem>(mockEndpoints[0]);
  const [search, setSearch] = useState("");

  const filtered = mockEndpoints.filter((ep) =>
    ep.path.toLowerCase().includes(search.toLowerCase()) || ep.summary.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Endpoints Sidebar List */}
      <div className="space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search endpoints..."
          icon={<Search className="h-4 w-4" />}
        />
        <div className="space-y-1 font-mono text-xs">
          {filtered.map((ep) => {
            const isSelected = ep.id === selectedEndpoint.id;
            return (
              <button
                key={ep.id}
                onClick={() => setSelectedEndpoint(ep)}
                className={`flex items-center justify-between w-full p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-drift-cyan bg-drift-cyan/15 text-drift-cyan font-bold"
                    : "border-slate-800 bg-[#06080D] text-slate-300 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                    ep.method === "GET" ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"
                  }`}>
                    {ep.method}
                  </span>
                  <span className="truncate">{ep.path}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Endpoint Detail Inspector */}
      <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#06080D] p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <span className="px-2 py-0.5 rounded font-mono text-xs font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {selectedEndpoint.method}
            </span>
            <h3 className="text-base font-bold text-white font-mono">{selectedEndpoint.path}</h3>
          </div>
          <Badge variant="outline">OPENAPI 3.1</Badge>
        </div>

        <p className="text-xs text-slate-400">{selectedEndpoint.summary}</p>

        <div className="space-y-2">
          <span className="font-mono text-[10px] uppercase text-slate-500 block">Schema Definition</span>
          <CodeBlock code={selectedEndpoint.schemaSnippet} language="json" filename={`${selectedEndpoint.path.replace(/\//g, "_")}.json`} />
        </div>
      </div>
    </div>
  );
}
