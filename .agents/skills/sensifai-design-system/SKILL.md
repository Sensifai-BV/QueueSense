---
name: sensifai-design-system
description: The Adaptive Modern Minimal Design System for SENSIFAI Marketplace applications — dynamic domain-specific color palettes, typography (DM Sans / JetBrains Mono), type scale, spacing, elevation, border radius, Landing Page Archetypes, Desktop Left-Sidebar Workspace Shell, and Mobile Native Bottom-Tab Navigation. Use whenever building, styling, or reviewing any UI for a SENSIFAI Marketplace application.
---

# Sensifai Adaptive Design System (Modern Minimal & Domain-Tailored)

## 1. Core Philosophy: Zero Clone Apps

Every SENSIFAI Marketplace application must look like a **bespoke, modern, commercial product** crafted specifically for its industry and workflow — never a cookie-cutter clone of another app.

1. **Dynamic Domain Color Identity (`src/lib/sensifai/theme.ts`)**:
   - Read `media_brand.primary_color` and `category` from `PROJECT.md`.
   - Use `resolveAppPalette()` and `getThemeCssVariables()` from `src/lib/sensifai/theme.ts` to inject `--brand-primary`, `--brand-primary-hover`, `--brand-primary-light`, `--brand-accent`, and `--hero-gradient` into root CSS variables.
   - **Never hardcode `#0052FF` when the app belongs to another domain:**
     - **Creative, Video, Image & Generative Studio**: Electric Violet (`#7C3AED`) + Rose Accent (`#EC4899`) on `#FAF8FF` surface.
     - **Healthcare, Biotech, Wellness & Climate**: Emerald (`#059669`) + Teal (`#14B8A6`) on `#F7FBF9` surface.
     - **Education, Kids, Storytelling & Language**: Vibrant Rose (`#E11D48`) + Warm Amber (`#F59E0B`) on `#FFFDFB` surface.
     - **Cybersecurity, Industrial Vision & Quality Inspection**: Deep Sky (`#0284C7`) + Cyan (`#06B6D4`) on `#F8FAFC` surface.
     - **E-Commerce, Retail, Culinary & Hospitality**: Terracotta Orange (`#EA580C`) + Warm Coral (`#F97316`) on `#FFFCFA` surface.
     - **Audio, Voice, Music & Acoustic Intelligence**: Indigo (`#4F46E5`) + Violet (`#8B5CF6`) on `#F9FAFF` surface.
     - **Legal, HR, Compliance & Enterprise Operations**: Royal Cobalt (`#2563EB`) + Slate (`#0F172A`) on `#F8FAFC` surface.
     - **Fintech, Crypto & Quantitative Analytics**: Coinbase Blue (`#0052FF`) + Sky (`#0EA5E9`) on `#F8FAFC` surface.

2. **Dual Navigation Architecture (`Navbar.tsx` + `AppShell.tsx`)**:
   - **Marketing Landing Page**: Clean 60px top `Navbar` with transparent logo + wordmark, max 4–5 nav links, live Gatekeeper Wallet Chip (`€0.00` guest / live balance logged-in), Sign In button (`/api/auth/login`), and Primary CTA in `--brand-primary`.
   - **Application Workspace / Dashboard (Desktop `>= 1024px`)**: Must use a **Collapsible Left Sidebar Navigation (`AppShell.tsx`)** (`260px` expanded / `76px` compact icon rail) with grouped workspace views, active brand-colored pill indicators, and a pinned **Prepaid Wallet & Metering Card** at the bottom of the left sidebar.
   - **Mobile Experience (`< 1024px`)**: Must look and feel like a **Native iOS/Android Mobile Application** with a fixed frosted-glass **Bottom Tab Navigation Bar (`h-16`, `backdrop-blur-xl`)**, 48px touch targets, thumb-friendly action cards, and bottom-sheet drawers.

3. **Direct Authentication & Zero Free Custom Usage**:
   - Clicking "Sign In" MUST immediately navigate to `/api/auth/login` (Logto OIDC PKCE flow).
   - Unauthenticated guests can explore pre-loaded sample presets, but custom uploads, recordings, or custom AI prompts MUST show the `AuthGateCard` and require signing in (`Sign In to Run (€0.05)`).

---

## 2. Typography & Docker-Resilient Font Loading

- **Display & UI Font**: `DM Sans` (weights 400, 500, 600, 700; tracking `-0.02em` on headings)
- **Numeric, Wallet & Telemetry Font**: `JetBrains Mono` (weights 400, 500, 700; `font-variant-numeric: tabular-nums`)

### CRITICAL DOCKER RULE: NEVER use `next/font/google`
In isolated Docker/Coolify builds, `next/font/google` frequently fails with network timeouts. Always load fonts via `<link>` tags in `src/app/layout.tsx`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link
  href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
  rel="stylesheet"
/>
```

And define CSS variables in `src/app/globals.css`:
```css
:root {
  --font-dm-sans: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-jetbrains-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
```

### Type Scale
- **Hero Display**: `clamp(2.25rem, 4vw, 3.25rem)` / `700` / line-height `1.12`
- **H1 (Page Title)**: `28px–32px` / `700` / line-height `1.2`
- **H2 (Section Header)**: `22px–24px` / `700` / line-height `1.25`
- **H3 (Card / Panel Title)**: `17px–18px` / `600` / line-height `1.35`
- **Body**: `16px` / `400` / line-height `1.55`
- **Body Small / UI Control**: `14px` / `500`
- **Caption / Badge**: `12px` / `600` (minimum allowed font size across the entire app)

---

## 3. Four Landing Page Archetypes (Pick the One Matching the App's Domain)

Never build the exact same landing page twice. Select the archetype that fits the product's core workflow:

### Archetype A: Interactive Studio Split-Hero (For Vision, Video, Audio & Creative AI)
- **Hero**: Left column (50%) has domain badge, bold headline, subcopy, primary CTA (`Launch Studio`) + secondary CTA (`Try Sample Preset`), and trust metrics. Right column (50%) showcases `public/images/hero.jpg` layered with a floating interactive preview badge and glassmorphic telemetry overlay.
- **Live Interactive Workspace Section**: Embedded directly below the hero inside the `AppShell` (left sidebar on desktop, bottom bar on mobile) so users can test sample presets immediately.
- **Framed Platform Showcase**: Browser-chrome frame displaying `public/images/platform-ui.png`.
- **3-Column Visual Feature Cards**: Each card includes `public/images/feature-1..3.jpg` in a 16:9 top plate + icon badge + concise benefit copy.

### Archetype B: Asymmetric Bento Grid & Telemetry Showcase (For Fintech, Analytics, Security & DevOps)
- **Hero**: Centered high-impact header with pill badge, headline, dual CTAs, followed immediately by a wide **MacBook / Browser Device Frame** displaying `public/images/platform-ui.png` flanked by floating KPI cards (`JetBrains Mono` metrics).
- **Bento Grid Features (4-Card Asymmetric Grid)**: 1 large 2-column card with `public/images/hero.jpg` + 3 structured feature cards with `feature-1..3.jpg` and live sparkline/gauge visuals.
- **Full Left-Sidebar Command Center Workspace**: Below or on the workspace tab, using `AppShell.tsx`.

### Archetype C: Editorial Minimalist & Before/After Proof (For Healthcare, Legal, HR, Docs & E-Commerce)
- **Hero**: Clean editorial split layout with warm/emerald domain tint (`var(--hero-gradient)`), high-trust compliance badges, and a dual-frame visual comparing raw input (`public/images/hero.jpg`) with structured AI output (`public/images/platform-ui.png`).
- **Step-by-Step Workflow Ribbon**: 3 horizontal connected cards showing Input → Sensifai AI Engine Analysis → Verified Actionable Report.
- **Left-Sidebar Document/Analysis Workspace**: Clean, distraction-free workspace with structured scorecards, export buttons, and transparent wallet metering.

### Archetype D: Tactile Storyboard & Visual Canvas (For EdTech, Kids, Language & Consumer Lifestyle)
- **Hero**: Vibrant, welcoming hero with `rounded-2xl` floating visual plates (`public/images/hero.jpg` + `feature-1..3.jpg`), friendly badge pills, and instant 1-click sample story/activity launchers.
- **Visual Gallery & Output Plates**: Every generated item renders with a rich full-color SVG illustration or AI-generated scene plate alongside structured text.

---

## 4. Mandatory Visual & Media Rules

1. **Dual Visual Requirement**: Every app MUST include BOTH:
   - **Photorealistic domain scene images** (`media/cover.png`, `public/images/hero.jpg`, `public/images/feature-1.jpg`, `feature-2.jpg`, `feature-3.jpg`) with ZERO baked-in text.
   - **Real Platform UI Screenshots** (`media/platform-mockup.png`, `public/images/platform-ui.png`) captured from the running app at `1280px` desktop width and embedded inside a sleek browser-chrome or laptop device frame on the landing page.
2. **Transparent Logo**: `media/logo.png` (and `public/logo.png`) must have a verified **100% transparent alpha background** — never a white box inside the header.
3. **Zero Model Names in UI**: Never display internal AI model names (`Gemini`, `2.5`, `3.8`, `OpenAI`, `GPT`, `Whisper`) in user-facing UI copy. Use branded terms like **"Sensifai AI Engine"**, **"Sensifai Vision Core"**, or **"Neural Analysis Engine"**.

---

## 5. Responsive & Mobile-Native Quality Gates (375px / 768px / 1280px)

- **375px (Mobile Native Mode)**:
  - Fixed bottom navigation bar (`h-16`) visible and accessible; main container has `pb-20` so content is never hidden behind the bottom bar.
  - Top header stays strictly 1 row (`60px` height): Logo + compact Wallet Chip (`€XX.XX`) + menu/login icon. Wordmark never wraps to 2 lines.
  - Zero horizontal scroll (`overflow-x-hidden` on page wrapper; data tables scroll horizontally inside their own card).
  - All buttons and interactive tabs have minimum `44px` height.
- **768px (Tablet Mode)**:
  - 2-column feature grids, collapsible drawer or bottom tab navigation, balanced whitespace.
- **1280px (Desktop Mode)**:
  - Left sidebar (`260px`) in workspace/dashboard view + main multi-column workspace canvas (`max-w-[1280px]`).
