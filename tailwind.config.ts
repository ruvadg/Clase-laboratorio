import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        masterlab: {
          blue: "#1E1EFF",
          ink: "#0A0A23",
          mist: "#F4F4FF",
          line: "#E5E5F2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(10, 10, 35, 0.04), 0 8px 24px rgba(10, 10, 35, 0.06)",
        ring: "0 0 0 4px rgba(30, 30, 255, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
