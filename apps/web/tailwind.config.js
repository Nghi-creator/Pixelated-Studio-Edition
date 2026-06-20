/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          champagne: "#FFC2D1",
          "light-pink": "#FF8FAB",
          blush: "#FFE5EC",
          "rose-ink": "#3A1824",
        },
        neutral: {
          paper: "#0B090A",
          canvas: "#100B0E",
          surface: "#4A2835",
          elevated: "#5A3140",
          border: "#7E465B",
          text: "#FFF7FA",
          muted: "#CFA4B2",
        },
        status: {
          success: "#2F7D5B",
          warning: "#B86F88",
          danger: "#B64242",
        },
        console: {
          black: "#080708",
        },
        synth: {
          bg: "#050505",
          surface: "#4A2835",
          elevated: "#5A3140",
          border: "#7E465B",
          primary: "#B86F88",
          "primary-hover": "#C97893",
          action: "#9B0048",
          "action-hover": "#B00052",
          secondary: "#D8A4B5",
          "secondary-hover": "#E8B8C6",
          ink: "#FFFFFF",
        },
      },
      boxShadow: {
        panel: "0 18px 48px rgba(0, 0, 0, 0.42)",
        card: "0 12px 30px rgba(0, 0, 0, 0.34)",
        pressed: "inset 0 1px 2px rgba(0, 0, 0, 0.34)",
      },
    },
  },
  plugins: [],
};
