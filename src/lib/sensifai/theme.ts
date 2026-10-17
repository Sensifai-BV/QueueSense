/**
 * Sensifai Domain-Adaptive Theme & Palette Engine (`src/lib/sensifai/theme.ts`)
 *
 * Ensures every Sensifai Marketplace application has a bespoke, modern, and
 * harmonious visual identity tailored to its specific industry/domain and
 * `PROJECT.md` `media_brand.primary_color` — never a repetitive clone.
 */

export interface DomainPalette {
  id: string;
  label: string;
  primary: string;
  primaryHover: string;
  primaryLight: string;
  accent: string;
  surfaceBg: string;
  surfaceCard: string;
  sidebarBg: string;
  sidebarText: string;
  heroGradient: string;
}

export const DOMAIN_PALETTES: Record<string, DomainPalette> = {
  fintech: {
    id: "fintech",
    label: "Fintech, Analytics & Crypto",
    primary: "#0052FF",
    primaryHover: "#0040C8",
    primaryLight: "#EFF6FF",
    accent: "#0EA5E9",
    surfaceBg: "#F8FAFC",
    surfaceCard: "#FFFFFF",
    sidebarBg: "#0F172A",
    sidebarText: "#F8FAFC",
    heroGradient: "radial-gradient(circle at 80% 20%, rgba(0, 82, 255, 0.10), transparent 55%)",
  },
  creative: {
    id: "creative",
    label: "Creative Studio, Media & Generative AI",
    primary: "#7C3AED",
    primaryHover: "#6D28D9",
    primaryLight: "#F5F3FF",
    accent: "#EC4899",
    surfaceBg: "#FAF8FF",
    surfaceCard: "#FFFFFF",
    sidebarBg: "#13111C",
    sidebarText: "#F5F3FF",
    heroGradient: "radial-gradient(circle at 80% 20%, rgba(124, 58, 237, 0.12), rgba(236, 72, 153, 0.06) 45%, transparent 70%)",
  },
  health: {
    id: "health",
    label: "Healthcare, Biotech & Climate",
    primary: "#059669",
    primaryHover: "#047857",
    primaryLight: "#ECFDF5",
    accent: "#14B8A6",
    surfaceBg: "#F7FBF9",
    surfaceCard: "#FFFFFF",
    sidebarBg: "#062C22",
    sidebarText: "#ECFDF5",
    heroGradient: "radial-gradient(circle at 80% 20%, rgba(5, 150, 105, 0.11), transparent 60%)",
  },
  edtech: {
    id: "edtech",
    label: "Education, Storytelling & Kids",
    primary: "#E11D48",
    primaryHover: "#BE123C",
    primaryLight: "#FFF1F2",
    accent: "#F59E0B",
    surfaceBg: "#FFFDFB",
    surfaceCard: "#FFFFFF",
    sidebarBg: "#1F1218",
    sidebarText: "#FFF1F2",
    heroGradient: "radial-gradient(circle at 80% 20%, rgba(225, 29, 72, 0.10), rgba(245, 158, 11, 0.06) 50%, transparent 70%)",
  },
  enterprise: {
    id: "enterprise",
    label: "Legal, HR, Compliance & Operations",
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    primaryLight: "#EFF6FF",
    accent: "#4F46E5",
    surfaceBg: "#F8FAFC",
    surfaceCard: "#FFFFFF",
    sidebarBg: "#0B132B",
    sidebarText: "#F1F5F9",
    heroGradient: "radial-gradient(circle at 80% 20%, rgba(37, 99, 235, 0.09), transparent 55%)",
  },
  security: {
    id: "security",
    label: "Cybersecurity, Inspection & Industrial Vision",
    primary: "#0284C7",
    primaryHover: "#0369A1",
    primaryLight: "#F0F9FF",
    accent: "#06B6D4",
    surfaceBg: "#F8FAFC",
    surfaceCard: "#FFFFFF",
    sidebarBg: "#091526",
    sidebarText: "#F0F9FF",
    heroGradient: "radial-gradient(circle at 80% 20%, rgba(2, 132, 199, 0.11), transparent 60%)",
  },
  ecommerce: {
    id: "ecommerce",
    label: "E-Commerce, Retail & Hospitality",
    primary: "#EA580C",
    primaryHover: "#C2410C",
    primaryLight: "#FFF7ED",
    accent: "#F97316",
    surfaceBg: "#FFFCFA",
    surfaceCard: "#FFFFFF",
    sidebarBg: "#1C1410",
    sidebarText: "#FFF7ED",
    heroGradient: "radial-gradient(circle at 80% 20%, rgba(234, 88, 12, 0.10), transparent 60%)",
  },
  audio: {
    id: "audio",
    label: "Audio, Speech & Acoustic Intelligence",
    primary: "#4F46E5",
    primaryHover: "#4338CA",
    primaryLight: "#EEF2FF",
    accent: "#8B5CF6",
    surfaceBg: "#F9FAFF",
    surfaceCard: "#FFFFFF",
    sidebarBg: "#111026",
    sidebarText: "#EEF2FF",
    heroGradient: "radial-gradient(circle at 80% 20%, rgba(79, 70, 229, 0.12), transparent 60%)",
  },
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return null;
  const num = parseInt(cleaned, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function adjustBrightness(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(rgb.r * factor);
  const g = clamp(rgb.g * factor);
  const b = clamp(rgb.b * factor);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function mixWithWhite(hex: string, whiteRatio = 0.92): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#F3F4F6";
  const r = Math.round(rgb.r * (1 - whiteRatio) + 255 * whiteRatio);
  const g = Math.round(rgb.g * (1 - whiteRatio) + 255 * whiteRatio);
  const b = Math.round(rgb.b * (1 - whiteRatio) + 255 * whiteRatio);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function resolveAppPalette(options?: {
  primaryColor?: string;
  domain?: string;
}): DomainPalette {
  const domainKey = (options?.domain || "").toLowerCase();
  let basePalette = DOMAIN_PALETTES.fintech;

  if (domainKey.includes("creat") || domainKey.includes("media") || domainKey.includes("video") || domainKey.includes("design")) {
    basePalette = DOMAIN_PALETTES.creative;
  } else if (domainKey.includes("health") || domainKey.includes("med") || domainKey.includes("bio") || domainKey.includes("eco") || domainKey.includes("agri")) {
    basePalette = DOMAIN_PALETTES.health;
  } else if (domainKey.includes("kid") || domainKey.includes("edu") || domainKey.includes("story") || domainKey.includes("learn")) {
    basePalette = DOMAIN_PALETTES.edtech;
  } else if (domainKey.includes("legal") || domainKey.includes("hr") || domainKey.includes("doc") || domainKey.includes("recruit")) {
    basePalette = DOMAIN_PALETTES.enterprise;
  } else if (domainKey.includes("sec") || domainKey.includes("vision") || domainKey.includes("inspect") || domainKey.includes("safety")) {
    basePalette = DOMAIN_PALETTES.security;
  } else if (domainKey.includes("shop") || domainKey.includes("retail") || domainKey.includes("food") || domainKey.includes("commerce")) {
    basePalette = DOMAIN_PALETTES.ecommerce;
  } else if (domainKey.includes("audio") || domainKey.includes("voice") || domainKey.includes("speech") || domainKey.includes("music")) {
    basePalette = DOMAIN_PALETTES.audio;
  }

  const customHex = options?.primaryColor?.trim();
  if (customHex && /^#[0-9A-Fa-f]{6}$/.test(customHex)) {
    const rgb = hexToRgb(customHex);
    return {
      ...basePalette,
      primary: customHex,
      primaryHover: adjustBrightness(customHex, 0.85),
      primaryLight: mixWithWhite(customHex, 0.92),
      heroGradient: rgb
        ? `radial-gradient(circle at 80% 20%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12), transparent 60%)`
        : basePalette.heroGradient,
    };
  }

  return basePalette;
}

export function getThemeCssVariables(options?: {
  primaryColor?: string;
  domain?: string;
}): Record<string, string> {
  const p = resolveAppPalette(options);
  return {
    "--brand-primary": p.primary,
    "--brand-primary-hover": p.primaryHover,
    "--brand-primary-light": p.primaryLight,
    "--brand-accent": p.accent,
    "--surface-bg": p.surfaceBg,
    "--surface-card": p.surfaceCard,
    "--sidebar-bg": p.sidebarBg,
    "--sidebar-text": p.sidebarText,
    "--hero-gradient": p.heroGradient,
  };
}
