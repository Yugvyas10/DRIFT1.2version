"use client";

import React from "react";
import Image from "next/image";
import { Star, Quote } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionTitle } from "@/components/ui/section-title";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { FadeIn } from "@/components/animations/fade-in";

const testimonials = [
  {
    quote: "DRIFT caught a breaking query type mutation in our Payments API that unit tests completely missed. It saved our iOS team from a critical launch outage.",
    author: "Elena Rostova",
    role: "VP of Engineering",
    company: "PayPulse Scale",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
  },
  {
    quote: "Shadow traffic replay is a game changer. We replay 2M requests against new API contracts in seconds without any overhead on our live clusters.",
    author: "Marcus Thorne",
    role: "Principal API Architect",
    company: "Nexus Mesh Systems",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
  },
  {
    quote: "Traditional JSON diffing gave us 50 false alarms a day. DRIFT filters out the noise and only blocks pull requests when an actual breaking bug exists.",
    author: "Sarah Lin",
    role: "Lead Platform Engineer",
    company: "CloudFlow DevOps",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
  },
];

export function TestimonialsSection() {
  return (
    <SectionContainer gridBg id="testimonials">
      <SectionTitle
        badge="Engineers Love DRIFT"
        title="Trusted by Teams Shipping Mission-Critical APIs"
        description="Hear how engineering teams eliminate API regressions and ship with complete confidence."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {testimonials.map((t, idx) => (
          <FadeIn key={t.author} delay={idx * 0.1}>
            <SpotlightCard className="h-full flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-1 text-drift-cyan">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-drift-cyan" />
                  ))}
                </div>
                <p className="text-xs md:text-sm text-slate-300 leading-relaxed italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
              </div>

              <div className="flex items-center space-x-3 pt-4 border-t border-slate-800">
                {/* Avatar Image */}
                <Image
                  src={t.avatar}
                  alt={t.author}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover border border-drift-cyan/30"
                />
                <div>
                  <h4 className="text-xs font-bold text-white">{t.author}</h4>
                  <p className="text-[11px] text-slate-400">{t.role} • <span className="text-drift-cyan">{t.company}</span></p>
                </div>
              </div>
            </SpotlightCard>
          </FadeIn>
        ))}
      </div>
    </SectionContainer>
  );
}
