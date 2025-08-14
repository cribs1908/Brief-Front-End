import { getAuth } from "@clerk/react-router/ssr.server";
// Server-side HTTP fetch for Convex actions/queries  
const CONVEX_HTTP_URL = process.env.VITE_CONVEX_HTTP_URL || process.env.VITE_CONVEX_URL;
import { redirect, useLoaderData } from "react-router";
import { AppSidebar } from "~/components/dashboard/app-sidebar";
import { SiteHeader } from "~/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { api } from "../../../convex/_generated/api";
import type { Route } from "./+types/layout";
import { createClerkClient } from "@clerk/react-router/api.server";
import { Outlet } from "react-router";
import { ComparisonProvider } from "~/state/comparison";

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  // Redirect to sign-in if not authenticated
  if (!userId) {
    throw redirect("/sign-in");
  }

  // Temporary: skip server-side Convex calls to avoid deployment errors
  // Will use client-side auth instead
  const user = await createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  }).users.getUser(userId);
  
  // Temporary bypass: skip subscription check for testing
  const subscriptionStatus = { hasActiveSubscription: true };

  return { user };
}

export default function DashboardLayout() {
  const { user } = useLoaderData();

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <ComparisonProvider>
          <Outlet />
        </ComparisonProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
