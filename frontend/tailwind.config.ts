import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
    "./shared/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F0FDFA",
        foreground: "#134E4A",
        mint: {
          50: '#F0FDFA',
        },
        medicalTeal: {
          500: '#0891B2',
          DEFAULT: '#0891B2',
        },
        cyanPulse: {
          400: '#22D3EE',
          DEFAULT: '#22D3EE',
        }
      },
      fontFamily: {
        sans: ['var(--font-figtree)', 'var(--font-noto-sans)', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
export default config;
