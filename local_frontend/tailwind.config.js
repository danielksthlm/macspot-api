/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin'

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
  plugins: [
    plugin(function({ addComponents, theme }) {
      addComponents({
        '.h1': {
          fontFamily: theme('fontFamily.heading').join(', '),
          fontWeight: '700',
          fontSize: '24px',
          lineHeight: '40px',
          marginTop: '32px',
          marginBottom: '16px',
        },
        '.h2': {
          fontFamily: theme('fontFamily.heading').join(', '),
          fontWeight: '700',
          fontSize: '20px',
          lineHeight: '36px',
          marginTop: '32px',
          marginBottom: '16px',
        },
        '.h3': {
          fontFamily: theme('fontFamily.heading').join(', '),
          fontWeight: '700',
          fontSize: '18px',
          lineHeight: '20px',
          marginTop: '0px',
          marginBottom: '0px',
        },
        '.h4': {
          fontFamily: theme('fontFamily.heading').join(', '),
          fontWeight: '700',
          fontSize: '16px',
          lineHeight: '20px',
          marginTop: '0px',
          marginBottom: '0px',
        },
        '.p': {
          fontFamily: theme('fontFamily.body').join(', '),
          fontWeight: '400',
          fontSize: '16px',
          lineHeight: '24px',
          marginTop: '8px',
          marginBottom: '16px',
        },
      })
    }),
  ],
}