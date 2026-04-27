/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Code', 'monospace'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: 'var(--c-accent)',
        panel: 'var(--c-panel)',
        surface: 'var(--c-surface)',
        base: 'var(--c-bg)',
      },
    },
  },
  plugins: [],
}
