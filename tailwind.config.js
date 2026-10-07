/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,ts,tsx}',
    './app/**/*.{js,ts,tsx}',
    './components/**/*.{js,ts,tsx}',
    './modules/**/*.{js,ts,tsx}'
  ],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        espresso: '#1C120C',
        cognac: '#8C4522',
        taupe: '#8C7C70',
        gold: '#D99C2B',
        champagne: '#FBF8F4',
      },
    },
  },
  plugins: [],
};
