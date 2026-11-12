/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        // Tarja do grupo de WhatsApp (WhatsAppGroupMarquee): o conteúdo é
        // duplicado uma vez (ver componente) e a trilha anda metade da sua
        // própria largura — como as duas cópias são idênticas, o fim do
        // loop encaixa exatamente no início da segunda cópia, sem salto.
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        marquee: "marquee 18s linear infinite",
      },
    },
  },
  plugins: [],
};
