import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in/*", "routes/sign-in.tsx"),
  route("sign-up/*", "routes/sign-up.tsx"),
  route("pricing", "routes/pricing.tsx"),
  route("success", "routes/success.tsx"),
  route("subscription-required", "routes/subscription-required.tsx"),
  layout("routes/dashboard/layout.tsx", [
    route("dashboard", "routes/dashboard/index.tsx"),
    route("dashboard/chat", "routes/dashboard/chat.tsx"),
    route("dashboard/settings", "routes/dashboard/settings.tsx"),
    // Vecchi percorsi mantenuti per compatibilità (reindirizzano)
    route("dashboard/accounts", "routes/dashboard/accounts.tsx"),
    route("dashboard/generator", "routes/dashboard/generator.tsx"),
    route("dashboard/automation", "routes/dashboard/automation.tsx"),
    route("dashboard/clients", "routes/dashboard/clients.tsx"),
    route("dashboard/history", "routes/dashboard/history.tsx"),
    // Nuovi percorsi
    route("dashboard/create-report", "routes/dashboard/create-report.tsx"),
    route("dashboard/reports", "routes/dashboard/reports.tsx"),
    route("dashboard/integrations", "routes/dashboard/integrations.tsx"),
    route("dashboard/scheduling", "routes/dashboard/scheduling.tsx"),
  ]),
] satisfies RouteConfig;
