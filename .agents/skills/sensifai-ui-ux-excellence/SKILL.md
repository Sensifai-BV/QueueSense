---
name: sensifai-ui-ux-excellence
description: Advanced UI/UX component patterns, Bento grids, device mockup frames, left-sidebar dashboard layouts, mobile-native bottom tab navigation, and domain-specific interactive visualizations for SENSIFAI Marketplace applications. Use whenever designing or coding frontend pages, landing sections, dashboards, or interactive AI workspaces.
---

# Sensifai UI/UX Excellence — Modern Minimal Landings, Left-Sidebar Dashboards & Native Mobile Shells

## When to Use This Skill

Load this skill whenever you are building or polishing the frontend (`src/app/page.tsx`, `src/components/*`, `src/app/globals.css`) of a SENSIFAI Marketplace application. It provides concrete UI architecture patterns so every app looks like an award-winning modern SaaS product.

---

## 1. Layout Architecture: Marketing Surface + Left-Sidebar AppShell

Structure every application so users experience **both** a high-converting, visually rich landing showcase AND a true SaaS workspace with a **Left Sidebar on Desktop** and a **Bottom Navigation Bar on Mobile**:

- **Top Marketing Surface (`/`)**:
  - Uses `Navbar.tsx` + one of the 4 domain archetypes (`studio`, `bento`, `editorial`, `playful`) from `sensifai-design-system`.
- **Interactive Studio / Dashboard Workspace (`#workspace` or `/workspace`)**:
  - Uses `AppShell` from `@/components/AppShell` (copied from `sensifai-starter-kit/templates/src/components/AppShell.tsx`).
  - Pass `appName`, `appTagline`, `primaryColor` (from `PROJECT.md`), and domain-specific `navItems`.
  - On desktop (`>= 1024px`), `AppShell` renders a collapsible **Left Sidebar Menu** (`260px` expanded / `76px` rail) with active brand-colored pills and a pinned **Prepaid Wallet & Metering Card** at the bottom.
  - On mobile (`< 1024px`), `AppShell` automatically transforms into a native mobile application layout with a compact top header and a fixed frosted-glass **Bottom Tab Bar (`h-16`)**!

---

## 2. Browser Chrome & Device Frame Pattern (Mandatory for `platform-ui.png`)

Never place an unframed screenshot on the landing page. Wrap `public/images/platform-ui.png` inside a sleek macOS/Browser Chrome container:

```tsx
<div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_50px_rgba(5,15,26,0.08)] overflow-hidden">
  <div className="h-10 bg-slate-50 border-b border-slate-200/80 px-4 flex items-center justify-between">
    <div className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full bg-rose-400/80" />
      <span className="h-3 w-3 rounded-full bg-amber-400/80" />
      <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
    </div>
    <div className="px-3 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-mono text-slate-500">
      https://{appId}.sensifai.com/workspace
    </div>
    <div className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Live Engine
    </div>
  </div>
  <div className="relative aspect-video w-full bg-slate-900">
    <Image
      src="/images/platform-ui.png"
      alt={`${appName} Live Workspace Interface`}
      fill
      sizes="(max-width: 768px) 100vw, 1100px"
      className="object-cover object-top"
    />
  </div>
</div>
```

---

## 3. Domain-Specific Dashboard Visualizations (Never Ship Raw Text Dumps)

When the user runs an AI analysis or clicks a sample preset, NEVER render a plain wall of text or raw JSON. Transform the structured AI output (`callSensifaiAIJson`) into **rich visual components**:

1. **Executive KPI & Telemetry Strip**: 3 to 4 top metric cards displaying key scores, confidence percentages, or risk indices in `JetBrains Mono` (`text-2xl font-bold`), paired with semantic status badges (`#05B169` positive, `#F0AD4E` warning, `#DF2935` alert).
2. **Radial Progress Gauges & Segmented Scorecards**: Use SVG circular progress rings (`strokeDasharray` / `strokeDashoffset` colored with `var(--brand-primary)`) for overall scores (0–100) and horizontal segmented bars for sub-criteria breakdowns.
3. **Interactive Tabs & Export Actions**: Organize detailed output into scannable tabs (*Executive Summary*, *Detailed Breakdown*, *Action Plan*, *Export Report*).
4. **Visual Plates for Creative / Multimodal Apps**: Pair every generated story, scene, or inspection result with a generated image, interactive hotspot overlay, or bespoke multi-layered SVG scene illustration.
