import { IconDashboard, IconSettings, IconReportAnalytics, IconCalendarTime, IconUsersGroup, IconLink } from "@tabler/icons-react";
import { Wand2 } from "lucide-react";
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
  useSidebar,
} from "~/components/ui/sidebar";

const data = {
  navMain: [
    {
      title: "Overview",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
      title: "Create Report",
      url: "/dashboard/create-report",
      icon: Wand2,
    },
    {
      title: "Reports",
      url: "/dashboard/reports",
      icon: IconReportAnalytics,
    },
    {
      title: "Clients",
      url: "/dashboard/clients",
      icon: IconUsersGroup,
    },
    {
      title: "Integrations",
      url: "/dashboard/integrations",
      icon: IconLink,
    },
    {
      title: "Scheduling",
      url: "/dashboard/scheduling",
      icon: IconCalendarTime,
    },
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
  const { state } = useSidebar();

  return (
    <Sidebar collapsible="icon" variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="mb-2">
            <Link to="/" prefetch="viewport" className="block">
              {state === "collapsed" ? (
                <img
                  src="/logobriefsecondo.png"
                  alt="Brief mark"
                  className="h-6 w-6 object-contain mx-auto"
                />
              ) : (
                <img
                  src="/brief_logoo.png"
                  alt="Brief logo"
                  className="h-8 w-auto object-contain"
                />
              )}
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>{user && <NavUser user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
