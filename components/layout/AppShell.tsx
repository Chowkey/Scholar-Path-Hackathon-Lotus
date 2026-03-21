"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Sidebar } from "@/components/layout/Sidebar";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <div className="flex h-screen">
      {isAdminRoute ? <AdminSidebar /> : <Sidebar />}
      <main className={isAdminRoute ? "flex-1 overflow-y-auto bg-stone-100" : "flex-1 overflow-y-auto bg-neutral-50"}>
        {children}
      </main>
    </div>
  );
}
