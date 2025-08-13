import type { Config } from "@react-router/dev/config";

export default {
  // Server-side rendering abilitato
  ssr: true,
  // Nessun preset specifico (node runtime standard) per generare build/server/index.js
} satisfies Config;
