import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4e7',
          100: '#fae3c0',
          500: '#e8820c',
          600: '#c96d08',
          700: '#a55906',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
