/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
      },
      colors: {
        synth: {
          bg: "#141022",
          surface: "#1c1430",
          elevated: "#2a2145",
          border: "#3d2f5c",
          primary: "#FF4D8F",
          "primary-hover": "#FF6BA8",
          secondary: "#FF9F43",
          "secondary-hover": "#FFB56B",
          ink: "#120a1a",
        },
      },
      boxShadow: {
        "glow-primary":
          "0 0 28px rgba(255, 77, 143, 0.38), 0 0 2px rgba(255, 77, 143, 0.45)",
        "glow-primary-sm": "0 0 16px rgba(255, 77, 143, 0.32)",
        "glow-secondary": "0 0 20px rgba(255, 159, 67, 0.28)",
      },
    },
  },
  plugins: [],
};
