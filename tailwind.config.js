/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heebo: ["Heebo", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
