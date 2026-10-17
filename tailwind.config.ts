import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#EA580C",
          hover: "#C2410C",
          light: "#FFF7ED",
          dark: "#9A3412",
        },
        brand: {
          orange: "#EA580C",
          amber: "#FF9800",
          warm: "#F97316",
          dark: "#1C1410",
          light: "#FFF7ED",
          surface: "#FFFCFA",
        },
        surface: "#FFFFFF",
        page: "#FFFCFA",
        border: "#E2E8F0",
        txt: {
          primary: "#0F172A",
          secondary: "#475569",
          neutral: "#94A3B8",
        },
        success: {
          DEFAULT: "#059669",
          light: "#ECFDF5",
        },
        warning: {
          DEFAULT: "#F59E0B",
          light: "#FFFBEB",
        },
        error: {
          DEFAULT: "#E11D48",
          light: "#FFF1F2",
        },
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.06)",
        dropdown: "0 4px 12px rgba(15,23,42,0.08)",
        modal: "0 12px 24px rgba(15,23,42,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
