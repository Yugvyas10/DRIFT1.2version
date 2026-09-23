# DRIFT Platform — Live Presentation & Walkthrough Script

> **Document Type:** Live Presentation Script & Speaker Notes  
> **Target Audience:** Hackathon Judges, Enterprise Clients, Investors, Technical Recruiters, Engineering Teams  
> **Presenter Persona:** Senior Full-Stack / Staff Frontend & API Infrastructure Engineer  
> **Estimated Total Duration:** ~15–18 Minutes *(Fast-Track 5-Minute Version Notes Included)*

---

## Presentation Overview & Timings

| Section | Target Duration | Key Demos & Highlights |
| :--- | :--- | :--- |
| [1. Introduction & Hook](#1-introduction--hook) | 1:00 | Mission statement, breaking change problem |
| [2. Home Page](#2-home-page) | 2:30 | 3D inertia globe, Command Palette (`⌘K`), PR simulation card, card hover effects |
| [3. Technology](#3-technology) | 1:30 | 4-layer architecture, Rust diff engine, Live Traffic Replay visualizer |
| [4. Interactive Pipeline](#4-interactive-pipeline) | 2:00 | 6-stage control center, auto-replay, side inspector panel |
| [5. Live Demo Sandbox](#5-live-demo-sandbox) | 2:00 | Live contract diff runner, multi-service workspace IDE, AI drawer |
| [6. Enterprise Dashboard](#6-enterprise-dashboard) | 2:00 | KPI widgets, Recharts telemetry, sentinel runs table, sub-tab views |
| [7. Documentation Platform](#7-documentation-platform) | 1:30 | Sticky TOC, CLI reference, playground, AI assistant |
| [8. Pricing](#8-pricing) | 1:00 | Billing toggle, 3 tiers, feature comparison matrix |
| [9. Enterprise](#9-enterprise) | 1:00 | SOC 2 Type II, SAML/SCIM SSO, air-gapped deployment options |
| [10. Blog & Contact](#10-blog--contact) | 1:00 | Engineering deep dives, contact form, global offices |
| [11. Authentication](#11-authentication) | 0:30 | Split-screen glass layout, NextAuth integration |
| [12. Settings](#12-settings) | 0:45 | API key manager (`drft_live_...`), 2FA, notification toggles |
| [13. Footer](#13-footer) | 0:15 | Operational status, social links |
| [14. Final Closing & Q&A](#14-final-closing--qa) | 0:45 | Summary recap, Q&A invitation |
| **Total Duration** | **~17:15** | **Full Site Coverage** |

---

## 1. Introduction & Hook

- **Estimated Time:** 1:00
- **Purpose:** Frame the root technical problem in modern distributed systems — silent API version drift — and introduce DRIFT as the contract-aware regression sentinel.

### What to Say
> "Good morning, everyone. In modern microservice architectures, API changes are pushed dozens of times a day. But traditional tools treat API changes in one of two flawed ways: either they rely on plain text JSON diffs that trigger constant false-positive alerts, or they rely on manual test scripts that silently rot. 
> 
> A developer converts an `amount` field from an integer to a string. The server compiles cleanly. Unit tests pass. But the moment it hits production, thousands of compiled iOS and Android apps crash during checkout.
> 
> Today, I'm excited to present **DRIFT** — a Contract-Aware API Regression Sentinel. DRIFT parses OpenAPI 3.x, gRPC, and GraphQL ASTs, mirrors shadow production traffic using eBPF, and automatically gates breaking pull requests in CI/CD before a single line of bad code reaches your users."

### Transition
> "Let's start at the main landing page to explore DRIFT's core engine in action."

---

## 2. Home Page

- **Estimated Time:** 2:30
- **URL Path:** `/`
- **Purpose:** Capture immediate viewer attention with 3D graphics, command palette, interactive PR simulation, and universal card physics.

### A. Navigation Bar & Header
- **What to Say:**
  > "Notice our floating glassmorphic navigation header. Inspired by Linear and Vercel, it keeps high-frequency pages directly accessible — Technology, Pipeline, Live Demo, Dashboard, Docs, Pricing, and Blog — while secondary pages are cleanly nested under the **More** dropdown."
- **What to Click / Do:**
  - Hover over the **More** link to trigger the dropdown menu.
  - Point out the icons and short descriptions for Enterprise, Contact, Settings, and About.

### B. 3D Wireframe Globe with Rotational Inertia Physics
- **What to Say:**
  > "Behind the hero headline is our custom React Three Fiber 3D wireframe scene. Notice that as I move my cursor across the section, the icosahedron doesn't rigidly snap to the mouse. Instead, it uses **second-order spring-mass-damper rotational inertia physics** (`mass: 1.4`, `stiffness: 14.0`, `damping: 5.2`). It accelerates with physical weight, exhibits a subtle 2% overshoot, and settles smoothly. The rotation is clamped to ±18° for a cinematic feel, and when my cursor leaves the hero, it eases back to baseline while maintaining a continuous idle spin."
- **What to Click / Do:**
  - Move the cursor smoothly across the hero headline.
  - Stop the cursor abruptly to demonstrate the physical inertia settling.
  - Move the cursor off the hero area to demonstrate smooth return-to-center easing.

### C. Command Palette (`⌘K` / `Win+K`)
- **What to Say:**
  > "DRIFT features a Raycast and Linear-inspired Command Palette. Pressing `⌘K` or clicking the search trigger opens a fuzzy-search modal categorized into Quick Actions, Navigation, Documentation, and Settings."
- **What to Click / Do:**
  - Press `⌘K` (or `Ctrl+K`) on your keyboard.
  - Type `"check"` or `"cli"`.
  - Use `↑` and `↓` arrow keys to navigate highlighted items.
  - Press `Esc` to close.
- **Technical Highlights:**
  - Instant fuzzy search with highlighted text matching (`<mark>`).
  - Recent & suggested commands view when query is empty.
  - Keyboard shortcuts (`↵`, `⌘P`, `⌘C`, `ESC`).

### D. Universal Interactive Card Hover Effects
- **What to Say:**
  > "Every rectangular card across the site utilizes our custom `InteractiveCard` primitive. As I hover over these 6 core feature cards, observe the cursor-following radial spotlight beam, the edge border highlight, the 3D tilt, and the subtle elevation lift."
- **What to Click / Do:**
  - Move mouse slowly across the feature grid (*Semantic contract diffing*, *Pipeline-native*, *Zero false positives*, *Sub-second analysis*).

### E. Interactive PR Inspection Simulation Card
- **What to Say:**
  > "Here in the 'How It Works' section, we have an interactive PR inspection simulator. Right now, it's set to **Breaking PR**. Notice how stages 1 through 3 complete, but Stage 4 flags a breaking change: `Order.amount` changed from `integer` to `string`, causing Stage 5 to block the merge. 
  > 
  > If I click **Compatible PR**, DRIFT re-evaluates an enum expansion on `Order.currency`. All 5 stages turn green and auto-approve."
- **What to Click / Do:**
  - Click the **`[Compatible PR]`** toggle button. Observe all 5 step icons turn cyan with green checkmarks and a success banner appears.
  - Click **`[Breaking PR]`** toggle button to restore the breaking change alert.

### Transition
> "Now let's dive deeper under the hood to see the engineering powering this engine on the Technology page."

---

## 3. Technology

- **Estimated Time:** 1:30
- **URL Path:** `/technology`
- **Purpose:** Demonstrate the 4-layer architecture, Rust diff engine, and live traffic replay visualizer.

### What to Say
> "DRIFT's technology is built around a 4-layer architecture designed for sub-second analysis at scale."

### What to Click / Do & Screen Reactions
1. **4 Architecture Layers:**
   - Scroll down to the 4 layers: *Contract Ingestion (Rust + WASM)*, *Semantic Diff Engine (Rust Core)*, *Consumer Graph (PostgreSQL + pgvector)*, and *Live Drift Monitor (Edge Runtime)*.
   - Mention: *"The diff core is compiled to WebAssembly for browser execution and native binaries for CI runners."*
2. **Live Traffic Replay Visualizer (`TrafficReplayVisualizer`):**
   - Scroll to the **Live Traffic Replay Visualizer** section.
   - Point out the real-time request stream simulator showing incoming HTTP methods (`POST /orders`, `GET /users/{id}`), response status codes (`200 OK`, `422 Unprocessable`), and live diff detections.
3. **End-to-End Sentinel System Architecture Diagram (`ArchitectureDiagram`):**
   - Hover over the interactive nodes in the system diagram to inspect dereferencing specs and eBPF probes.
4. **TypeScript Configuration Snippet:**
   - Show the `drift.config.ts` preview displaying rules: `breaking: 'block'`, `compatible: 'warn'`, `cosmetic: 'ignore'`.

### Transition
> "Let's see these architecture layers running live in the Interactive Pipeline control center."

---

## 4. Interactive Pipeline

- **Estimated Time:** 2:00
- **URL Path:** `/interactive-pipeline` *(or `/pipeline`)*
- **Purpose:** Provide a step-by-step walkthrough of how DRIFT processes a contract through 6 execution stages.

### What to Say & What to Click
1. **Control Toolbar:**
   > "This is our Signature Control Center. I can hit Play to auto-replay the 6-stage sentinel pipeline, or step through each stage manually."
   - Click the **Play / Pause** toggle. Show the stage buttons (`STAGE 01` through `STAGE 06`) highlighting sequentially every 4 seconds.
   - Change speed multiplier to `2x`.
2. **Stage Stepper Inspection:**
   - Click **`STAGE 01 (Spec Ingestion)`**: Explain OpenAPI 3.1 AST parsing & dereferencing circular `$ref` schemas.
   - Click **`STAGE 02 (AST Diff)`**: Explain type-aware field-level structural delta calculations.
   - Click **`STAGE 03 (Shadow Replay)`**: Explain eBPF payload replay against candidate builds.
   - Click **`STAGE 04 (Classification)`**: Explain breaking vs compatible vs cosmetic classification.
   - Click **`STAGE 05 (Reporting)`**: Explain Markdown, JSON, and PR comment formatting.
   - Click **`STAGE 06 (CI/CD Gate)`**: Explain GitHub Actions & GitLab CI status checks.
3. **Side Inspector Panel (`SideInspectorPanel`):**
   > "On the right, the Side Inspector Panel updates dynamically for each stage, displaying raw AST nodes, replayed HTTP payload evidence, and downstream consumer impact graphs."

### Transition
> "Now let's test a real contract diff inside our Live Demo Sandbox."

---

## 5. Live Demo Sandbox

- **Estimated Time:** 2:00
- **URL Path:** `/live-demo` *(or `/demo`)*
- **Purpose:** Allow live hands-on testing of contract diffing and full multi-service IDE workspace.

### What to Say & What to Click
1. **Interactive Quick Diff Runner:**
   - Scroll to the top Quick Diff card featuring `Orders API v1.4.0 → v1.5.0`.
   - Click **`[Analyze Contract]`**.
   - Show the animated loading state (*"computing semantic diff..."*).
   - Point out the generated diff results cards:
     - ❌ `Order.amount`: `integer → string` (**Breaking**)
     - ❌ `Order.status`: `added (required)` (**Breaking**)
     - ⚠️ `Order.currency`: `enum expanded: +JPY` (**Compatible**)
     - ℹ️ `info.version`: `1.4.0 → v1.5.0` (**Cosmetic**)
   - Point out the verdict box: `Verdict: merge blocked — 2 breaking changes require consumer updates.`
2. **Full Multi-Service Workspace IDE (`DemoWorkspace`):**
   - Scroll down to the **Multi-Service Contract & Console Sandbox**.
   - Select different sample contracts from the workspace selector (`orders-service.yaml`, `payments-service.yaml`).
   - Click **Run Diff Check** to view output in the built-in terminal console log window.
   - Click the floating **AI Assistant** drawer trigger to show AI-powered remediation suggestions.

> **Presenter Note (Simulated Features):**  
> *The diff results and workspace terminal logs in this section use pre-configured OpenAPI schemas to demonstrate real-time response times. This is fully interactive in browser.*

### Transition
> "Once contract checks run in CI, all telemetry flows into the Enterprise Dashboard."

---

## 6. Enterprise Dashboard

- **Estimated Time:** 2:00
- **URL Path:** `/dashboard`
- **Purpose:** Show the command center for monitoring microservices, contract health, active sentinel runs, and analytics telemetry.

### What to Say & What to Click
1. **KPI Metric Cards (`MetricCard`):**
   - Point out top metrics:
     - *Active Sentinel Runs*: `24 Runs`
     - *Breaking Changes Blocked*: `14 Regressions`
     - *Monitored Endpoints*: `1,842 Endpoints`
     - *AST Diff Latency*: `118 ms`
2. **Recharts Interactive Telemetry:**
   - **Area Chart (API Traffic Volume vs Drift Events):** Hover over data points to reveal tooltip details showing replayed HTTP requests vs detected schema drift.
   - **Bar Chart (Diff Executions by Service):** Point out breakdown across `orders-svc`, `payments-svc`, `billing-svc`, and `user-svc`.
3. **Recent Sentinel Runs Table:**
   - Point out rows with status badges: `Blocked` (red), `Passed` (green), `Warning` (amber).
   - Show commit SHAs (`c8f42a1`), branch names (`feature/order-amount-string`), and PR links (`#842`).
4. **Sub-Tab Navigation:**
   - Click through sub-tab views: **Overview**, **Projects**, **Reports**, **Explorer**, **Replay**, **Integrations**, **Settings**.

### Transition
> "Developers can reference integration guides and CLI options inside our Documentation platform."

---

## 7. Documentation Platform

- **Estimated Time:** 1:30
- **URL Path:** `/docs`
- **Purpose:** Showcase developer onboarding, sticky navigation, interactive code playground, CLI reference, and AI assistant.

### What to Say & What to Click
1. **Command Search Bar:**
   - Click the search trigger box or press `⌘K` to demonstrate searching docs.
2. **Sticky Section Navigation & Table of Contents:**
   - Scroll down the docs page. Point out how the left `DocsSidebar` stays sticky while the right `DocsToc` highlights the currently visible header.
3. **Quick Start Code Blocks:**
   - Hover over code blocks (`npm install -g @drift/cli`). Click the **Copy** button to copy commands.
4. **Interactive Playground (`DocsPlayground`):**
   - Show the live contract editor playground where developers test custom drift rules.
5. **CLI Reference (`CliReferenceView`):**
   - Click through CLI command tabs: `drift init`, `drift check`, `drift replay`, `drift ci`.
6. **FAQ Accordion & Release Changelog (`ChangelogTimeline`):**
   - Expand FAQ items (*"What counts as a contract?"*, *"How does eBPF replay work?"*).
7. **Floating Docs AI Assistant Drawer (`DocsAiAssistant`):**
   - Click the floating bot icon in the bottom-right corner to open the AI assistant drawer.

### Transition
> "Next, let's look at our transparent pricing plans and enterprise licensing."

---

## 8. Pricing

- **Estimated Time:** 1:00
- **URL Path:** `/pricing`
- **Purpose:** Demonstrate pricing tiers, billing frequency toggle, side-by-side feature comparison, and FAQ.

### What to Say & What to Click
1. **Billing Toggle:**
   - Click between **Monthly** and **Yearly** billing. Point out the `-20%` annual discount animation.
2. **Plan Cards:**
   - **Hobby ($0/mo):** 1 contract, unlimited diff checks, GitHub Actions.
   - **Pro ($39/mo billed annually - Most Popular):** Up to 25 contracts, consumer graph, live drift monitoring, priority support.
   - **Enterprise (Custom):** Unlimited contracts, self-hosted/air-gapped, SSO/SAML, custom SLAs.
3. **Comparison Matrix Table:**
   - Scroll down to the side-by-side comparison table showing feature checkmarks across all tiers.
4. **FAQ Accordion:**
   - Expand FAQ questions.

### Transition
> "For organizations with strict security and air-gapped network requirements, let's explore the Enterprise page."

---

## 9. Enterprise

- **Estimated Time:** 1:00
- **URL Path:** `/enterprise`
- **Purpose:** Highlight enterprise-grade security, SOC 2 compliance, SAML/SCIM SSO, and air-gapped VPC deployment options.

### What to Say & What to Click
1. **Enterprise Metrics Banner:**
   - Point out *99.99% Uptime SLA*, *<15min Critical Response Time*, *0 Data Leaves Your Network*.
2. **Security & Governance Grid:**
   - Point out features: *SOC 2 Type II Audited*, *Okta / Azure AD SAML 2.0 & SCIM*, *Audit Logs & RBAC*.
3. **Deployment Models:**
   - Highlight 3 options: *Managed Cloud*, *Self-Hosted VPC*, and *Air-Gapped Network* (zero internet egress).
4. **Dedicated Support Card:**
   - Highlight named support engineer SLA reviews.

### Transition
> "Let's briefly visit our Blog and Contact pages."

---

## 10. Blog & Contact

- **Estimated Time:** 1:00
- **URL Paths:** `/blog`, `/contact`

### A. Blog (`/blog`)
- **What to Say:**
  > "Our blog features deep engineering articles on contract testing and Rust engine optimization."
- **What to Click / Do:**
  - Point out the **Featured Post** spotlight (*"Why we built a semantic diff engine instead of a text diff"*).
  - Click category pills (**All**, **Engineering**, **Product**, **Security**).
  - Show the email newsletter subscription form.

### B. Contact (`/contact`)
- **What to Say:**
  > "Teams can reach out for architecture reviews, live demos, or custom CI connectors."
- **What to Click / Do:**
  - Show contact channel cards (Email, Live Chat, Phone).
  - Show office locations (San Francisco, London, Singapore).
  - Fill out the interactive consultation form and click **Send message** to show the animated checkmark confirmation.

### Transition
> "Now let's examine the Authentication flows and Account Settings."

---

## 11. Authentication

- **Estimated Time:** 0:30
- **URL Paths:** `/login`, `/register` *(or `/auth/signin`, `/auth/signup`)*
- **Purpose:** Demonstrate authentication pages with split-screen glass design and NextAuth backend integration.

### What to Say & What to Click
- Click **Sign in** or **Get started** in the header.
- Point out the split-screen design: left side contains the form, right side features an animated glass gradient feature showcase.
- Point out NextAuth integration supporting Email/Password, GitHub OAuth, and Google SSO.

---

## 12. Settings

- **Estimated Time:** 0:45
- **URL Path:** `/settings`
- **Purpose:** Show developer account management, API key generation, 2FA, and team member RBAC.

### What to Say & What to Click
1. **Sidebar Navigation:**
   - Click through tabs: **Profile**, **Security**, **Notifications**, **Billing**, **Team**, **Danger Zone**.
2. **Security & API Keys Tab:**
   - Point out the **API key** card (`drft_live_8429aef3b1c7d290`). Click the **Eye icon** to toggle key visibility between masked (`drft_live_••••••••••••••••`) and unmasked.
3. **Notification Switches:**
   - Toggle notification switches (*Breaking changes*, *Live drift alerts*).
4. **Team Management:**
   - Show member roles (*Owner*, *Admin*, *Member*).

---

## 13. Footer

- **Estimated Time:** 0:15
- **Purpose:** Demonstrate operational transparency and quick navigation links.

### What to Say
> "Every page includes our DRIFT footer with category column links, social channels, and a real-time operational status indicator showing *'All systems operational'*."

---

## 14. Final Closing & Q&A

- **Estimated Time:** 0:45
- **Purpose:** Summarize the core value proposition and open the floor for questions.

### What to Say
> "To summarize: DRIFT solves the multi-billion dollar problem of silent API version drift. By combining Rust-powered AST semantic diffing with eBPF shadow traffic replay, DRIFT gives engineering teams 100% confidence to ship APIs faster without breaking downstream consumers.
> 
> Thank you very much for your time. I'd be glad to take any questions or walk through specific technical components in detail."

---

## Fast-Track 5-Minute Presentation Guide

*If your presentation time is limited (e.g. 5-minute hackathon demo), follow this condensed path:*

1. **0:00 – 0:45 | Intro & Hero 3D Scene (`/`)**: State problem, show 3D rotational inertia globe, press `⌘K` for Command Palette.
2. **0:45 – 1:45 | Home PR Demo (`/`)**: Click **`[Breaking PR]`** vs **`[Compatible PR]`** to show 5-stage gating.
3. **1:45 – 2:45 | Live Demo Sandbox (`/live-demo`)**: Click **`[Analyze Contract]`** on Orders API v1.4.0 → v1.5.0. Show breaking change verdict.
4. **2:45 – 3:45 | Interactive Pipeline (`/interactive-pipeline`)**: Hit **Play** on the 6-stage control center toolbar.
5. **3:45 – 4:30 | Dashboard (`/dashboard`)**: Show KPI cards, Recharts telemetry charts, and recent runs table.
6. **4:30 – 5:00 | Conclusion & Q&A**: Wrap up core value proposition.
