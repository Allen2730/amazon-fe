"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren } from "react";
import { clearSession, itemLabel, SessionState } from "../lib/api";

type NavItem = {
  href: string;
  label: string;
};

type AppShellProps = PropsWithChildren<{
  session: SessionState;
  title: string;
  subtitle: string;
  navItems?: NavItem[];
  logoutTo?: string;
}>;

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/pricing", label: "订阅套餐" },
  { href: "/chat", label: "对话" },
];

export function AppShell({ session, title, subtitle, navItems = NAV_ITEMS, logoutTo = "/login", children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const userName = itemLabel(session.user, "nickname", "name", "email");
  const orgName = itemLabel(session.organization, "name");
  const roleName = itemLabel(session.member, "role");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">Amazon Expert</span>
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="topbar-side">
          <nav className="nav-row" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname === item.href ? "nav-link nav-link-active" : "nav-link"}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="session-card">
            <div>
              <strong>{userName || "已登录用户"}</strong>
              <p>{orgName || "默认组织"}{roleName ? ` · ${roleName}` : ""}</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                clearSession(session.scope);
                router.push(logoutTo);
              }}
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="env-chip">API: {session.baseUrl}</div>

      {children}
    </main>
  );
}
