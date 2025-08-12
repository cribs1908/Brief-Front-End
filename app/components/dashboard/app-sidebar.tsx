import { IconDashboard, IconSettings, IconArchive, IconChartBar, IconFileUpload } from "@tabler/icons-react";
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
