/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          black: 'var(--black)',
          bordeaux: 'var(--night-bordeaux)',
          smoke: 'var(--white-smoke)',
          taupe: 'var(--dusty-taupe)',
          stone: 'var(--stone-brown)',
        },
        status: {
          pass: '#16A34A',
          warn: '#D97706',
          fail: '#DC2626',
        },
      },
    },
  },
  plugins: [],
};
