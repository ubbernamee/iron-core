/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      colors: {
        surface: 'var(--ic-surface)',
        card: 'var(--ic-card-bg)',
        well: 'var(--ic-well-bg)',
        ink: 'var(--ic-ink)',
        'ink-muted': 'var(--ic-ink-muted)',
        accent: 'var(--accent-hex)',
      },
    },
  },
  plugins: [],
};
