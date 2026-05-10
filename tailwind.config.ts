import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "progress-bar": {
          "0%":   { width: "0%",   marginLeft: "0%" },
          "50%":  { width: "40%",  marginLeft: "30%" },
          "100%": { width: "0%",   marginLeft: "100%" },
        },
      },
      animation: {
        "progress-bar": "progress-bar 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
