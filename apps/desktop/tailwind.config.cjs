/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./renderer.ts", "./renderer/**/*.ts"],
  theme: {
    extend: {
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
          surface: "#2B1720",
          elevated: "#351B27",
          border: "#5D263A",
          text: "#FFF7FA",
          muted: "#CFA4B2",
        },
        status: {
          success: "#2F7D5B",
          warning: "#91516A",
          danger: "#B64242",
        },
        console: { black: "#080708" },
        synth: {
          bg: "#050505",
          surface: "#2B1720",
          elevated: "#351B27",
          primary: "#91516A",
          "primary-hover": "#A15E78",
          action: "#9B0048",
          "action-hover": "#B00052",
          secondary: "#F38BB4",
          border: "#5D263A",
          ink: "#FFFFFF",
        },
      },
      boxShadow: {
        panel: "0 18px 48px rgba(0,0,0,0.42)",
        card: "0 12px 30px rgba(0,0,0,0.34)",
      },
    },
  },
  plugins: [],
};
