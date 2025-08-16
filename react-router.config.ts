import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  // Server-side rendering abilitato
  ssr: true,
  // Preset Vercel per generare l'output atteso per deploy Vercel
  presets: [vercelPreset()],
} satisfies Config;
