import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * The glass surfaces are tuned in one-percent steps (`text-white/62`,
 * `border-white/12`). Tailwind's stock opacity scale only goes in fives, so
 * every off-scale utility silently generated nothing: text fell back to the
 * inherited colour, borders to the near-white default, and — worst — form
 * fields lost their background and rendered the user agent's white behind
 * `text-white`. Every whole percent is a real step instead.
 */
const opacity = Object.fromEntries(
  Array.from({ length: 101 }, (_, value) => [String(value), String(value / 100)])
);

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      opacity,
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        }
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "1.9rem",
        "4xl": "2.4rem"
      },
      boxShadow: {
        glass:
          "0 24px 70px rgba(2, 8, 23, 0.42), inset 0 1px 1px rgba(255, 255, 255, 0.18)",
        glow: "0 0 0 1px rgba(145, 169, 255, 0.26), 0 0 28px rgba(110, 133, 255, 0.42)"
      },
      fontFamily: {
        sans: [
          "var(--font-ui)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ]
      }
    }
  },
  plugins: [animate]
};

export default config;
