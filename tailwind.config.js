/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './index.html',
    './js/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0891b2',
        'primary-dark': '#0e7490',
        'primary-light': '#06b6d4',
        'primary-container': '#cffafe'
      }
    }
  },
  plugins: []
};
