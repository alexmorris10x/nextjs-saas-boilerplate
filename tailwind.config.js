// tailwind.config.js
module.exports = {
  // Ensure Tailwind's `dark:` variant follows our app's data-theme
  // so dark mode is controlled by `[data-theme="dark"]` rather than system preference.
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/shared/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/core/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    extend: {
      container: {
        center: true,
        padding: "1rem",
        screens: {
          sm: "640px",
          md: "768px",
          lg: "1024px",
          xl: "1280px",
          "2xl": "1440px",
        },
      },

      // Colors are likely fine IF using a Tailwind v4 compatible DaisyUI version
      colors: {
        "base-100": "hsl(var(--b1) / <alpha-value>)",
        "base-200": "hsl(var(--b2) / <alpha-value>)",
        "base-300": "hsl(var(--b3) / <alpha-value>)",
        "base-content": "hsl(var(--bc) / <alpha-value>)",
        primary: "hsl(var(--p) / <alpha-value>)",
        "primary-focus": "hsl(var(--pf) / <alpha-value>)",
        "primary-content": "hsl(var(--pc) / <alpha-value>)",
        secondary: "hsl(var(--s) / <alpha-value>)",
        "secondary-focus": "hsl(var(--sf) / <alpha-value>)",
        "secondary-content": "hsl(var(--sc) / <alpha-value>)",
        accent: "hsl(var(--a) / <alpha-value>)",
        "accent-focus": "hsl(var(--af) / <alpha-value>)",
        "accent-content": "hsl(var(--ac) / <alpha-value>)",
        neutral: "hsl(var(--n) / <alpha-value>)",
        "neutral-focus": "hsl(var(--nf) / <alpha-value>)",
        "neutral-content": "hsl(var(--nc) / <alpha-value>)",
      },
      // REVIEW: Consider moving other custom animations to CSS like 'shimmer'
      // if you encounter issues using them with @apply in v4.
      animation: {
        opacity: "opacity 0.25s ease-in-out",
        appearFromRight: "appearFromRight 300ms ease-in-out",
        wiggle: "wiggle 1.5s ease-in-out infinite",
        popup: "popup 0.25s ease-in-out",
        // 'shimmer' removed as it's now defined directly in CSS
      },
      // REVIEW: Consider moving other custom keyframes to CSS if moving animations
      keyframes: {
        opacity: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        appearFromRight: {
          "0%": { opacity: 0.3, transform: "translate(15%, 0px);" },
          "100%": { opacity: 1, transform: "translate(0);" },
        },
        wiggle: {
          "0%, 20%, 80%, 100%": { transform: "rotate(0deg)" },
          "30%, 60%": { transform: "rotate(-2deg)" },
          "40%, 70%": { transform: "rotate(2deg)" },
          "45%": { transform: "rotate(-4deg)" },
          "55%": { transform: "rotate(4deg)" },
        },
        popup: {
          "0%": { transform: "scale(0.8)", opacity: 0.8 },
          "50%": { transform: "scale(1.1)", opacity: 1 },
          "100%": { transform: "scale(1)", opacity: 1 },
        },
        // 'shimmer' removed as it's now defined directly in CSS
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        serif: ["Georgia", "serif"],
        mono: [
          "Menlo",
          "Monaco",
          "Consolas",
          "'Liberation Mono'",
          "'Courier New'",
          "monospace",
        ],
      },
      // REVIEW: Check if @tailwindcss/typography plugin version is compatible with v4
      // and if this configuration structure is still current for that plugin version.
      typography: {
        DEFAULT: {
          css: {
            lineHeight: "1.8",
            fontSize: "1.25rem",
            letterSpacing: "0.025em",
          },
        },
      },
      spacing: {
        reading: "68ch",
      },
    },
  },
  plugins: [],
  // DaisyUI now loaded via @plugin in globals.css
};
