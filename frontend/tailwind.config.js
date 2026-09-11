/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gem: {
          black: "#0b0b0d",
          charcoal: "#17171a",
          gold: "#c6a15b",
          "gold-light": "#e2c98a",
          cream: "#f6f1e7",
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
