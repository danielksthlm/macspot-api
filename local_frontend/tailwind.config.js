/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Roboto Condensed"', 'sans-serif'],
        body: ['"Roboto Slab"', 'serif'],
      },
      colors: {
        KLR_Orange: '#e9a56f',
        KLR_Dark_Blue: '#0e1a2f',
        Transparent_White: 'rgba(255, 255, 255, 0.1)',
        KLR_Whitesmoke: '#f5f5f5',
        KLR_Grey: '#999999',
      },
    },
  },
  plugins: [],
}