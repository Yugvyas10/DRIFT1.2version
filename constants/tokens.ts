export const DESIGN_TOKENS = {
  colors: {
    dark: "#06080C",
    graphite: "#0D1117",
    slate: "#161B22",
    surface: "#0D131F",
    card: "#121824",
    border: "#1E293B",
    cyan: "#00F0FF",
    blue: "#0052FF",
    purple: "#7000FF",
  },
  animation: {
    duration: {
      fast: 0.15,
      normal: 0.3,
      slow: 0.6,
      stagger: 0.08,
    },
    ease: {
      standard: [0.25, 0.1, 0.25, 1.0],
      outSmooth: [0.0, 0.0, 0.2, 1.0],
      inOutExpo: [0.87, 0, 0.13, 1],
    },
  },
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    "2xl": 1536,
  },
  containerWidths: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1400px",
  },
} as const;
