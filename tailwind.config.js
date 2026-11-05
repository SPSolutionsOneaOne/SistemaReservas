/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        institucional: {
          primary: '#1e3a5f',
          secondary: '#2563eb',
          accent: '#f59e0b',
          success: '#10b981',
          danger: '#ef4444',
          warning: '#f97316',
        },
      },
    },
  },
  plugins: [],
};
