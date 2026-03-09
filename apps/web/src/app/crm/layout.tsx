"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Kanban, Users, Search, Radar, Mail } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";
import { Input } from "@/components/ui/input";

const nav = [
  { href: "/crm/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/crm/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/crm/entities", label: "Entities", icon: Users },
  { href: "/crm/outreach", label: "Outreach", icon: Mail },
  { href: "/crm/discovery", label: "Discovery", icon: Radar },
] as const;

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Sign in to access the CRM</p>
          <Link href="/login" className="text-sm underline underline-offset-4">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-svh overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r bg-sidebar">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <span className="text-base font-semibold tracking-tight">Norrjord</span>
          <span className="text-xs text-muted-foreground">CRM</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
              {session.user.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-9 h-9 bg-muted/50 border-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <UserMenu />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
