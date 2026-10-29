"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  UserRound,
  Wallet,
} from "lucide-react";
import type { Shop } from "../lib/types";
import { createBrowserSupabase } from "../lib/supabase/client";
import { ActionMenu, Brand, Button, IconButton, Modal, Notice } from "./ui";
import { SaleDialog } from "./sale-dialog";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/sales", label: "Sales", icon: ShoppingBag },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined },
  { href: "/cashbook", label: "Cashbook", icon: Wallet },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  shop,
  userEmail,
  lowStockCount,
  children,
}: {
  shop: Shop;
  userEmail: string;
  lowStockCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const currentTitle = navigation.find((item) => item.href === pathname)?.label ?? "Workspace";
  const router = useRouter();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    setMobileMenu(false);
  }, [pathname]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.altKey &&
        event.key.toLowerCase() === "n" &&
        !document.querySelector('[role="dialog"]')
      ) {
        event.preventDefault();
        setSaleOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const { error: authError } = await createBrowserSupabase().auth.signOut();
      if (authError) throw authError;
      router.replace("/login");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t sign out. Try again.");
      setSigningOut(false);
    }
  }
  const nav = (
    <nav className="main-nav" aria-label="Main navigation">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href ||
          (href === "/" && pathname === "/") ||
          pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`nav-link${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => setMobileMenu(false)}
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
            {href === "/inventory" && lowStockCount > 0 && (
              <span className="nav-count" aria-label={`${lowStockCount} low-stock products`}>
                {lowStockCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand-link" aria-label="Verdant POS dashboard">
          <Brand />
        </Link>
        <div className="shop-switcher">
          <span className="shop-monogram" aria-hidden="true">
            {shop.name.trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{shop.name}</strong>
            <span>Shop workspace</span>
          </div>
        </div>
        <div className="nav-eyebrow">WORKSPACE</div>
        {nav}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <BookOpen size={16} aria-hidden="true" />
            <span>A clear view of your business.</span>
          </div>
          <Link href="/settings#data" className="help-link">
            <CircleHelp size={16} />
            Data & support
          </Link>
          <span className="sidebar-version">Verdant POS · Retail essentials</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton
              label="Open navigation"
              className="mobile-menu-button"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={21} />
            </IconButton>
            <span className="topbar-title">{currentTitle}</span>
            <form action="/inventory" method="get" className="global-search" role="search">
              <Search size={17} aria-hidden="true" />
              <label className="sr-only" htmlFor="workspace-search">
                Search inventory
              </label>
              <input
                id="workspace-search"
                type="search"
                name="q"
                placeholder="Search your inventory…"
                autoComplete="off"
              />
              <kbd aria-hidden="true">↵</kbd>
            </form>
          </div>
          <div className="topbar-actions">
            <span className="currency-tag">{shop.currency}</span>
            <Link
              href="/inventory?stock=alerts&sort=stock&active=active"
              className="icon-button notification-button"
              aria-label={
                lowStockCount
                  ? `${lowStockCount} low-stock products. View inventory alerts`
                  : "View inventory alerts"
              }
              title="Low-stock alerts"
            >
              <Bell size={19} />
              {lowStockCount > 0 && <span className="notification-dot" />}
            </Link>
            <span className="topbar-divider" />
            <ActionMenu
              label={`Account menu for ${userEmail}`}
              items={[
                { label: "Shop settings", icon: Settings, href: "/settings" },
                {
                  label: signingOut ? "Signing out…" : "Sign out",
                  icon: LogOut,
                  onSelect: signOut,
                  disabled: signingOut,
                },
              ]}
            >
              <span className="avatar" aria-hidden="true">
                <UserRound size={15} />
              </span>
              <span className="account-name">{userEmail}</span>
            </ActionMenu>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}
          {success && (
            <Notice tone="success" onDismiss={() => setSuccess(null)}>
              {success}
            </Notice>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          <span>{shop.name}</span>
          <span>
            {shop.currency} <span aria-hidden="true">·</span> {shop.time_zone.replaceAll("_", " ")}
          </span>
        </footer>
      </div>
      {mobileMenu && (
        <Modal
          title="Your workspace"
          onClose={() => setMobileMenu(false)}
          className="mobile-nav-dialog"
        >
          <Link href="/" className="brand-link" onClick={() => setMobileMenu(false)}>
            <Brand />
          </Link>
          <p className="mobile-shop-name">{shop.name}</p>
          {nav}
          <Button
            className="full-width"
            onClick={() => {
              setMobileMenu(false);
              setSaleOpen(true);
            }}
          >
            <Plus size={17} />
            New sale
          </Button>
          <p className="muted small-text">Signed in as {userEmail}</p>
        </Modal>
      )}
      <button
        type="button"
        className="quick-sale-fab"
        onClick={() => setSaleOpen(true)}
        title="New sale (Alt+N)"
      >
        <Plus size={17} />
        <span>New sale</span>
        <kbd>Alt N</kbd>
      </button>
      {saleOpen && (
        <SaleDialog
          shop={shop}
          onClose={() => setSaleOpen(false)}
          onSuccess={(message) => {
            setSaleOpen(false);
            setSuccess(message);
          }}
        />
      )}
    </div>
  );
}
