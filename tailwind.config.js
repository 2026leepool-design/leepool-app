/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['SpaceGrotesk_400Regular', 'sans-serif'],
      },
      colors: {
        'cyber-bg': '#0A0F1A',
        'cyber-card': '#131B2B',
        'neon-cyan': '#00E5FF',
        'neon-green': '#00FF9D',
        'text-main': '#FFFFFF',
        'text-muted': '#8892B0',
      },
    },
  },
  plugins: [],
};
