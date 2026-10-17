"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Wallet,
  LogIn,
  LogOut,
  User as UserIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  LayoutDashboard,
  History,
  Settings,
  ArrowUpRight,
  Lock,
  CheckCircle2,
} from "lucide-react";

export interface SidebarNavItem {
  id: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface AppShellProps {
  appName: string;
  appTagline?: string;
  logoSrc?: string;
  primaryColor?: string;
  navItems?: SidebarNavItem[];
  activeTab?: string;
  onSelectTab?: (id: string) => void;
  pricePerActionEur?: number;
  children: React.ReactNode;
}

export default function AppShell({
  appName = "Sensifai Studio",
  appTagline = "AI Intelligence Workspace",
  logoSrc = "/logo.png",
  primaryColor,
  navItems = [
    { id: "workspace", label: "Studio Workspace", icon: <Sparkles className="h-4 w-4" /> },
    { id: "dashboard", label: "Analytics & Insights", icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: "history", label: "Activity History", icon: <History className="h-4 w-4" /> },
    { id: "settings", label: "Configuration", icon: <Settings className="h-4 w-4" /> },
  ],
  activeTab: controlledActiveTab,
  onSelectTab,
  pricePerActionEur = 0.05,
  children,
}: AppShellProps) {
  const [internalTab, setInternalTab] = useState(navItems[0]?.id || "workspace");
  const [collapsed, setCollapsed] = useState(false);
  const [walletPulse, setWalletPulse] = useState(false);
  const [session, setSession] = useState<{
    authenticated: boolean;
    user: any;
    wallet?: { balance: number; currency: string } | null;
  } | null>(null);

  const activeTab = controlledActiveTab ?? internalTab;
  const brandColor = primaryColor || "var(--brand-primary, #0052FF)";

  const handleTabClick = (item: SidebarNavItem) => {
    setInternalTab(item.id);
    if (onSelectTab) onSelectTab(item.id);
  };

  const fetchLiveWallet = useCallback(async () => {
    try {
      const r = await fetch(`/api/wallet?_t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const w = await r.json();
      if (w && typeof w.balance === "number") {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                wallet: { balance: w.balance, currency: w.currency || "EUR" },
              }
            : prev
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetch(`/api/auth/me?_t=${Date.now()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          setSession({
            authenticated: true,
            user: data.user,
            wallet: data.wallet || null,
          });
          fetchLiveWallet();
        } else {
          setSession({ authenticated: false, user: null, wallet: null });
        }
      })
      .catch(() => setSession({ authenticated: false, user: null, wallet: null }));

    const handleWalletUpdated = (e?: Event) => {
      const customDetail = (e as CustomEvent)?.detail;
      const directBalance =
        typeof customDetail?.balance === "number" ? customDetail.balance : null;

      setWalletPulse(true);
      setTimeout(() => setWalletPulse(false), 1200);

      if (directBalance !== null) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                wallet: {
                  balance: directBalance,
                  currency: customDetail?.currency || prev.wallet?.currency || "EUR",
                },
              }
            : prev
        );
      }

      fetchLiveWallet();
      const t1 = setTimeout(fetchLiveWallet, 750);
      const t2 = setTimeout(fetchLiveWallet, 2000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    };

    window.addEventListener("sensifai_wallet_updated", handleWalletUpdated);
    return () => {
      window.removeEventListener("sensifai_wallet_updated", handleWalletUpdated);
    };
  }, [fetchLiveWallet]);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setSession({ authenticated: false, user: null, wallet: null });
    window.location.href = "/";
  };

  const formattedBalance =
    session?.authenticated &&
    session.wallet &&
    typeof session.wallet.balance === "number"
      ? session.wallet.balance.toFixed(2)
      : "0.00";

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#050F1A] pb-16 lg:pb-0">
      {/* Desktop Left Sidebar Navigation (>= 1024px) */}
      <aside
        className={`hidden lg:flex flex-col sticky top-0 h-screen border-r border-[#E2E8F0] bg-white transition-all duration-200 z-40 ${
          collapsed ? "w-[76px]" : "w-[260px]"
        }`}
      >
        <div className="h-[60px] px-4 flex items-center justify-between border-b border-[#E2E8F0]">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            <div className="relative h-9 w-9 flex-shrink-0 rounded-xl border border-slate-100 bg-white flex items-center justify-center shadow-2xs">
              <Image
                src={logoSrc}
                alt={`${appName} Logo`}
                width={32}
                height={32}
                className="object-contain"
                priority
              />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[15px] text-[#050F1A] truncate leading-tight">
                  {appName}
                </span>
                <span className="text-[11px] text-[#5B616E] truncate">
                  {appTagline}
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-[#5B616E] hover:bg-slate-100 hover:text-[#050F1A] transition-colors flex-shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {!collapsed && (
            <div className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8A919E]">
              Workspace Menu
            </div>
          )}
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                  isActive
                    ? "text-white shadow-xs"
                    : "text-[#5B616E] hover:bg-slate-100 hover:text-[#050F1A]"
                } ${collapsed ? "justify-center" : "justify-between"}`}
                style={isActive ? { backgroundColor: brandColor } : undefined}
                title={collapsed ? item.label : undefined}
              >
                <span className="flex items-center gap-3 truncate">
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!collapsed && item.badge && (
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-[#5B616E]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-[#E2E8F0] space-y-2.5 bg-[#F8FAFC]">
          {!collapsed ? (
            <div
              className={`rounded-xl border p-3 transition-all ${
                walletPulse
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-[#E2E8F0] bg-white"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-[#5B616E] mb-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <Wallet className="h-3.5 w-3.5" style={{ color: brandColor }} />
                  Prepaid Wallet
                </span>
                <span className="font-mono text-[11px] text-[#8A919E]">
                  €{pricePerActionEur.toFixed(2)}/run
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[20px] font-bold text-[#050F1A]">
                  €{formattedBalance}
                </span>
                <a
                  href="https://sensifai.com/marketplace"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-semibold inline-flex items-center gap-0.5 hover:underline"
                  style={{ color: brandColor }}
                >
                  Top up <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col items-center py-2 rounded-xl border border-[#E2E8F0] bg-white text-[11px] font-mono font-bold"
              title={`Wallet Balance: €${formattedBalance}`}
            >
              <Wallet className="h-4 w-4 mb-1" style={{ color: brandColor }} />
              <span>€{formattedBalance}</span>
            </div>
          )}

          {session?.authenticated ? (
            <div className="flex items-center justify-between gap-2 px-1">
              {!collapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: brandColor }}
                  >
                    {(session.user?.name || "M").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold text-[#050F1A] truncate">
                      {session.user?.name || "Member"}
                    </span>
                    <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Active Session
                    </span>
                  </div>
                </div>
              )}
              <a
                href="/api/auth/logout"
                onClick={handleLogout}
                className="h-8 w-8 rounded-lg border border-[#D1D5DB] bg-white flex items-center justify-center text-[#5B616E] hover:text-red-600 hover:border-red-300 transition-colors flex-shrink-0"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <a
              href="/api/auth/login"
              className="w-full h-9 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
              style={{ backgroundColor: brandColor }}
              title="Sign In with Sensifai"
            >
              <LogIn className="h-4 w-4" />
              {!collapsed && <span>Sign In</span>}
            </a>
          )}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-[60px] bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex lg:hidden items-center gap-2">
              <Image
                src={logoSrc}
                alt={`${appName} Logo`}
                width={30}
                height={30}
                className="rounded-lg object-contain"
              />
              <span className="font-bold text-[16px] text-[#050F1A] whitespace-nowrap">
                {appName}
              </span>
            </Link>
            <div className="hidden lg:flex items-center gap-2 text-[14px]">
              <span className="text-[#5B616E] font-medium">{appName}</span>
              <span className="text-[#D1D5DB]">/</span>
              <span className="font-semibold text-[#050F1A]">
                {navItems.find((i) => i.id === activeTab)?.label || "Workspace"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-mono font-medium transition-all ${
                walletPulse
                  ? "border-emerald-400 bg-emerald-50 text-emerald-950 scale-105"
                  : "border-[#D1D5DB] bg-[#F9FAFB] text-[#050F1A]"
              }`}
            >
              <Wallet className="h-3.5 w-3.5" style={{ color: brandColor }} />
              <span>€{formattedBalance}</span>
            </div>

            {session?.authenticated ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-[#F3F4F6] border border-[#D1D5DB] text-[13px] font-medium text-[#050F1A]">
                  <UserIcon className="h-3.5 w-3.5" style={{ color: brandColor }} />
                  <span className="max-w-[120px] truncate">
                    {session.user?.name || "Member"}
                  </span>
                </span>
                <a
                  href="/api/auth/logout"
                  onClick={handleLogout}
                  className="flex lg:hidden items-center justify-center h-9 w-9 rounded-lg border border-[#D1D5DB] text-[#5B616E]"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </a>
              </div>
            ) : (
              <a
                href="/api/auth/login"
                className="flex items-center justify-center h-9 px-3.5 rounded-lg bg-white border border-[#D1D5DB] text-[13px] font-semibold text-[#050F1A] hover:bg-[#F3F4F6] transition-colors gap-1.5"
              >
                <LogIn className="h-4 w-4" style={{ color: brandColor }} />
                <span>Sign In</span>
              </a>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1280px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Native-App Bottom Tab Bar (< 1024px) */}
      <nav
        aria-label="Mobile App Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-white/95 backdrop-blur-xl border-t border-[#E2E8F0] px-2 flex items-center justify-around shadow-[0_-4px_20px_rgba(5,15,26,0.06)]"
      >
        {navItems.slice(0, 4).map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item)}
              className={`flex flex-col items-center justify-center flex-1 h-12 rounded-xl transition-all gap-0.5 ${
                isActive ? "font-semibold" : "text-[#5B616E]"
              }`}
              style={isActive ? { color: brandColor } : undefined}
            >
              {item.icon || <Sparkles className="h-5 w-5" />}
              <span className="text-[11px] truncate max-w-[76px]">
                {item.label.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function AuthGateCard({
  authenticated,
  primaryColor,
  priceEur = 0.05,
  featureTitle = "Run Custom AI Analysis",
}: {
  authenticated: boolean;
  primaryColor?: string;
  priceEur?: number;
  featureTitle?: string;
}) {
  if (authenticated) return null;
  const brandColor = primaryColor || "var(--brand-primary, #0052FF)";

  return (
    <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 mt-0.5"
          style={{ backgroundColor: brandColor }}
        >
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-[15px] font-bold text-[#050F1A]">
            Sensifai Account Required for Custom Inputs
          </h4>
          <p className="text-[13px] text-[#5B616E] mt-0.5">
            Explore sample presets for free, or sign in with your Sensifai wallet to{" "}
            {featureTitle.toLowerCase()} (€{priceEur.toFixed(2)} per request).
          </p>
        </div>
      </div>
      <a
        href="/api/auth/login"
        className="h-10 px-4 rounded-lg text-[14px] font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap shadow-xs hover:opacity-90 transition-opacity w-full sm:w-auto"
        style={{ backgroundColor: brandColor }}
      >
        <LogIn className="h-4 w-4" />
        <span>Sign In (€{priceEur.toFixed(2)})</span>
      </a>
    </div>
  );
}
