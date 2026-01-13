
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'wave': 'wave 1s ease-in-out infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { height: '20%' },
          '50%': { height: '100%' },
        }
      }
    },
  },
  plugins: [],
}
