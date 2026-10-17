"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Wallet,
  Menu,
  X,
  LogIn,
  LogOut,
  User as UserIcon,
  Sparkles,
  LayoutDashboard,
  Layers,
  CreditCard,
  ArrowRight,
} from "lucide-react";

export interface NavLinkItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface NavbarProps {
  appName?: string;
  logoSrc?: string;
  primaryColor?: string;
  navLinks?: NavLinkItem[];
  ctaLabel?: string;
  ctaHref?: string;
  showMobileBottomBar?: boolean;
  activeHref?: string;
}

export default function Navbar({
  appName = "Sensifai App",
  logoSrc = "/logo.png",
  primaryColor,
  navLinks = [
    { label: "Workspace", href: "#workspace" },
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
  ],
  ctaLabel = "Open Workspace",
  ctaHref = "#workspace",
  showMobileBottomBar = true,
  activeHref,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletPulse, setWalletPulse] = useState(false);
  const [session, setSession] = useState<{
    authenticated: boolean;
    user: any;
    wallet?: { balance: number; currency: string } | null;
  } | null>(null);

  const brandColor = primaryColor || "var(--brand-primary, #0052FF)";

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
    const fetchSession = () => {
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
            setSession({
              authenticated: false,
              user: null,
              wallet: null,
            });
          }
        })
        .catch(() => {
          setSession({
            authenticated: false,
            user: null,
            wallet: null,
          });
        });
    };

    fetchSession();

    // Listen to wallet updates dispatched across the app on billable actions.
    // Displays the verified Gatekeeper balance from the server response immediately,
    // and schedules follow-up live checks at 750ms and 2000ms so async NATS ledger commits
    // are always reflected accurately without ever reverting.
    const handleWalletUpdated = (e?: Event) => {
      const customDetail = (e as CustomEvent)?.detail;
      const directBalance =
        typeof customDetail?.balance === "number" ? customDetail.balance : null;

      setWalletPulse(true);
      setTimeout(() => setWalletPulse(false), 1200);

      if (directBalance !== null) {
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            wallet: {
              balance: directBalance,
              currency: customDetail?.currency || prev.wallet?.currency || "EUR",
            },
          };
        });
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
    setSession({
      authenticated: false,
      user: null,
      wallet: null,
    });
    window.location.href = "/";
  };

  const formattedBalance =
    session?.authenticated &&
    session.wallet &&
    typeof session.wallet.balance === "number"
      ? session.wallet.balance.toFixed(2)
      : "0.00";

  return (
    <>
      <header className="sticky top-0 z-50 h-[60px] w-full border-b border-[#E5E7EB] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between px-4 sm:px-6">
          {/* Brand Lockup */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            <div className="relative h-9 w-9 overflow-hidden rounded-xl bg-white border border-slate-100 shadow-2xs flex items-center justify-center">
              <Image
                src={logoSrc}
                alt={`${appName} Logo`}
                width={34}
                height={34}
                className="object-contain transition-transform duration-200 group-hover:scale-105"
                priority
              />
            </div>
            <span className="whitespace-nowrap font-bold text-[18px] text-[#050F1A] tracking-tight">
              {appName}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.slice(0, 5).map((link) => {
              const isActive = activeHref === link.href;
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className={`text-[14px] font-medium transition-colors py-1 ${
                    isActive
                      ? "text-[#050F1A] font-semibold"
                      : "text-[#5B616E] hover:text-[#050F1A]"
                  }`}
                  style={
                    isActive
                      ? { borderBottom: `2px solid ${brandColor}` }
                      : undefined
                  }
                >
                  {link.label}
                </a>
              );
            })}
          </nav>

          {/* Desktop Action Cluster */}
          <div className="hidden sm:flex items-center gap-2.5">
            {/* Wallet Chip: Always displayed, €0.00 for guest, real Gatekeeper balance for logged-in */}
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-mono font-medium transition-all duration-300 ${
                walletPulse
                  ? "border-emerald-400 bg-emerald-50 text-emerald-950 scale-105"
                  : "border-[#D1D5DB] bg-[#F9FAFB] text-[#050F1A]"
              }`}
              title="Sensifai Prepaid Wallet Balance"
            >
              <Wallet
                className="h-3.5 w-3.5 flex-shrink-0"
                style={{ color: brandColor }}
              />
              <span>€{formattedBalance}</span>
            </div>

            {session?.authenticated ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[#050F1A] flex items-center gap-1.5 px-2.5 h-[36px] rounded-lg bg-[#F3F4F6] border border-[#D1D5DB]">
                  <UserIcon
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: brandColor }}
                  />
                  <span className="max-w-[120px] truncate">
                    {session.user?.name || "Member"}
                  </span>
                </span>
                {ctaHref && (
                  <a
                    href={ctaHref}
                    className="hidden lg:flex items-center justify-center h-[36px] px-3.5 rounded-lg text-[13px] font-semibold text-white shadow-xs transition-opacity hover:opacity-90 gap-1.5"
                    style={{ backgroundColor: brandColor }}
                  >
                    <span>{ctaLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                )}
                <a
                  href="/api/auth/logout"
                  onClick={handleLogout}
                  className="flex items-center justify-center h-[36px] w-[36px] rounded-lg border border-[#D1D5DB] text-[#5B616E] hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Sign Out"
                  aria-label="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <a
                  href="/api/auth/login"
                  className="flex items-center justify-center h-[36px] px-3.5 rounded-lg bg-white border border-[#D1D5DB] text-[14px] font-semibold text-[#050F1A] hover:bg-[#F3F4F6] transition-colors gap-1.5"
                >
                  <LogIn className="h-4 w-4" style={{ color: brandColor }} />
                  <span>Sign In</span>
                </a>
                {ctaHref && (
                  <a
                    href={ctaHref}
                    className="flex items-center justify-center h-[36px] px-4 rounded-lg text-[14px] font-semibold text-white shadow-xs transition-opacity hover:opacity-90 gap-1.5"
                    style={{ backgroundColor: brandColor }}
                  >
                    <span>{ctaLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Mobile Compact Action Cluster */}
          <div className="flex sm:hidden items-center gap-2">
            <div
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-mono font-medium transition-all ${
                walletPulse
                  ? "border-emerald-400 bg-emerald-50 text-emerald-950"
                  : "border-[#D1D5DB] bg-[#F9FAFB] text-[#050F1A]"
              }`}
            >
              <Wallet className="h-3 w-3" style={{ color: brandColor }} />
              <span>€{formattedBalance}</span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-[#050F1A] hover:bg-[#F3F4F6] focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-[#D1D5DB] bg-white px-4 pt-3 pb-6 shadow-lg">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-11 items-center px-3 rounded-lg text-[15px] font-medium text-[#050F1A] hover:bg-[#F3F4F6]"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 pt-3 border-t border-[#E5E7EB] flex flex-col gap-2.5">
                {session?.authenticated ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-[13px] font-medium text-[#050F1A] flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
                      <span className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4" style={{ color: brandColor }} />
                        <span>{session.user?.name || "Member"}</span>
                      </span>
                      <span className="font-mono text-xs font-semibold">
                        €{formattedBalance}
                      </span>
                    </div>
                    <a
                      href="/api/auth/logout"
                      onClick={handleLogout}
                      className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[#D1D5DB] text-[14px] font-semibold text-[#5B616E] hover:text-red-600"
                    >
                      <LogOut className="h-4 w-4" /> Sign Out
                    </a>
                  </div>
                ) : (
                  <a
                    href="/api/auth/login"
                    className="flex h-11 items-center justify-center rounded-lg text-[15px] font-semibold text-white shadow-xs gap-2"
                    style={{ backgroundColor: brandColor }}
                  >
                    <LogIn className="h-4 w-4" /> Sign In with Sensifai
                  </a>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Mobile Native-App Bottom Tab Navigation Bar (< 768px) */}
      {showMobileBottomBar && (
        <nav
          aria-label="Mobile Bottom Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-white/95 backdrop-blur-xl border-t border-[#E5E7EB] px-2 flex items-center justify-around shadow-[0_-4px_16px_rgba(5,15,26,0.06)]"
        >
          {navLinks.slice(0, 3).map((link, idx) => {
            const defaultIcons = [
              <LayoutDashboard key="d" className="h-5 w-5" />,
              <Sparkles key="s" className="h-5 w-5" />,
              <Layers key="l" className="h-5 w-5" />,
            ];
            return (
              <a
                key={link.label}
                href={link.href}
                className="flex flex-col items-center justify-center flex-1 h-12 rounded-xl text-[#5B616E] hover:text-[#050F1A] active:scale-95 transition-all gap-0.5"
              >
                <span style={idx === 0 ? { color: brandColor } : undefined}>
                  {link.icon || defaultIcons[idx % defaultIcons.length]}
                </span>
                <span className="text-[11px] font-medium truncate max-w-[72px]">
                  {link.label}
                </span>
              </a>
            );
          })}
          {session?.authenticated ? (
            <a
              href="#workspace"
              className="flex flex-col items-center justify-center flex-1 h-12 rounded-xl text-[#050F1A] gap-0.5"
            >
              <CreditCard className="h-5 w-5" style={{ color: brandColor }} />
              <span className="text-[11px] font-mono font-semibold">
                €{formattedBalance}
              </span>
            </a>
          ) : (
            <a
              href="/api/auth/login"
              className="flex flex-col items-center justify-center flex-1 h-12 rounded-xl font-semibold gap-0.5"
              style={{ color: brandColor }}
            >
              <LogIn className="h-5 w-5" />
              <span className="text-[11px] font-semibold">Sign In</span>
            </a>
          )}
        </nav>
      )}
    </>
  );
}
