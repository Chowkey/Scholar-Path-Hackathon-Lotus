"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Sidebar } from "@/components/layout/Sidebar";

type AppShellProps = {
  children: React.ReactNode;
  userSlot?: React.ReactNode;
};

export function AppShell({ children, userSlot }: AppShellProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const isLandingPage = pathname === "/";
  const isAuthRoute =
    pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth/");

  return (
    <div className="flex h-screen">
      {isAdminRoute ? <AdminSidebar /> : isLandingPage || isAuthRoute ? null : <Sidebar userSlot={userSlot} />}
      <main
        className={
          isAdminRoute
            ? "flex-1 overflow-y-auto bg-stone-100"
            : isLandingPage
              ? "flex-1 overflow-y-auto bg-neutral-50"
              : "flex-1 overflow-y-auto bg-neutral-50"
        }
      >
        {children}
      </main>
    </div>
  );
}
