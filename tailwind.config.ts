import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEF6FF",
          100: "#DBEAFE",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          900: "#1E3A5F",
        },
        warm: {
          50: "#FFF7ED",
          100: "#FFEDD5",
          400: "#FB923C",
          500: "#F97316",
        },
        neutral: {
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          400: "#9CA3AF",
          600: "#4B5563",
          800: "#1F2937",
          900: "#111827",
        },
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
      },
      fontFamily: {
        heading: ["var(--font-plus-jakarta-sans)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(17, 24, 39, 0.06)",
        modal: "0 10px 20px -8px rgba(17, 24, 39, 0.12)",
      },
      animation: {
        pulseDots: "pulseDots 1.2s ease-in-out infinite",
      },
      keyframes: {
        pulseDots: {
          "0%, 80%, 100%": { opacity: "0.35", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-2px)" },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
