import { IconDashboard, IconSettings, IconArchive, IconChartBar, IconFileUpload, IconSun, IconMoonStars } from "@tabler/icons-react";
import { Button } from "~/components/ui/button";
import { Link } from "react-router";
import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

const data = {
  navMain: [
    {
      title: "Overview",
      url: "/dashboard",
      icon: IconDashboard,
    },
    { title: "Nuovo Confronto", url: "/dashboard/new-comparison", icon: IconFileUpload },
    { title: "Archivio", url: "/dashboard/archive", icon: IconArchive },
    { title: "Statistiche", url: "/dashboard/stats", icon: IconChartBar },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: IconSettings,
    },
  ],
};

export function AppSidebar({
  variant,
  user,
}: {
  variant: "sidebar" | "floating" | "inset";
  user: any;
}) {
  // Theme toggle: salva preferenza e applica data-theme su html
  const isBrowser = typeof document !== "undefined";
  const getTheme = () => (isBrowser ? document.documentElement.getAttribute("data-theme") : null);
  const setTheme = (v: "light" | null) => {
    if (!isBrowser) return;
    if (v) document.documentElement.setAttribute("data-theme", v);
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("brief:theme", v ?? ""); } catch {}
  };
  if (isBrowser) {
    const saved = localStorage.getItem("brief:theme") || "light";
    if (saved && document.documentElement.getAttribute("data-theme") !== saved) {
      document.documentElement.setAttribute("data-theme", saved as any);
    }
  }
  const toggleTheme = () => {
    const cur = getTheme();
    setTheme(cur === "light" ? null : "light");
  };

  return (
    <Sidebar collapsible="offcanvas" variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="mb-2">
            <Link to="/" prefetch="viewport" className="block">
              <img
                src="/brief_logoo.png"
                alt="Brief logo"
                className="h-8 w-auto object-contain"
              />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col gap-3 w-full">
          {/* Premium light/dark toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="group relative inline-flex items-center justify-between w-full rounded-md border px-3 py-2 text-sm transition-all focus-visible:ring-[3px] focus-visible:ring-[--ring] hover:translate-y-[-1px]"
            style={{
              background: "var(--card)",
              color: "var(--foreground)",
              borderColor: "var(--border)",
            }}
            aria-label="Toggle light mode"
            data-slot="input"
          >
            <span className="flex items-center gap-2">
              <IconSun className="group-[data-theme=light]:opacity-100 opacity-80" size={16} />
              <span>Light mode</span>
            </span>
            <span className="relative h-5 w-10 rounded-full border" style={{ borderColor: "var(--border)" }}>
              <span className="absolute top-1/2 -translate-y-1/2 left-1 h-3.5 w-3.5 rounded-full transition-all"
                style={{
                  background: "var(--primary)",
                  transform: getTheme() === "light" ? "translate(18px, -50%)" : "translate(0, -50%)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
                }}
              />
            </span>
          </button>

          <Link to="/dashboard/new-comparison" prefetch="intent" className="w-full">
            <Button data-slot="button" className="w-full" size="sm">
              <IconFileUpload className="mr-2" size={16} /> Carica PDF
            </Button>
          </Link>
          {user && <NavUser user={user} />}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
