"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import AppShell, { AuthGateCard } from "@/components/AppShell";
import {
  SAMPLE_PRESETS,
  QueueSenseReport,
} from "@/lib/ai/queuesense-engine";
import {
  Sparkles,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Upload,
  Camera,
  Mic,
  RefreshCw,
  Sliders,
  ShieldCheck,
  TrendingUp,
  FileText,
  BarChart3,
  Layers,
  ChevronRight,
  Copy,
  Check,
  Zap,
  Store,
  Compass,
  Download,
  Share2,
} from "lucide-react";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("workspace");
  const [selectedPresetId, setSelectedPresetId] = useState("supermarket-rush");
  const [report, setReport] = useState<QueueSenseReport>(SAMPLE_PRESETS[0].data);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [customAudioText, setCustomAudioText] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [copiedJson, setCopiedJson] = useState(false);
  const [workspaceSubTab, setWorkspaceSubTab] = useState<
    "summary" | "lanes" | "actions" | "json"
  >("summary");
  const [session, setSession] = useState<{
    authenticated: boolean;
    user: any;
    wallet?: { balance: number; currency: string } | null;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const brandPrimary = "#EA580C";

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
        } else {
          setSession({ authenticated: false, user: null, wallet: null });
        }
      })
      .catch(() => {
        setSession({ authenticated: false, user: null, wallet: null });
      });
  }, []);

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setCustomImage(null);
    setCustomAudioText("");
    setErrorMessage(null);
    const found = SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setReport(found.data);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("File exceeds maximum 10MB size limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCustomImage(reader.result as string);
      setSelectedPresetId("custom");
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRunCustomAnalysis = async () => {
    if (!session?.authenticated) {
      setErrorMessage("Please sign in with your Sensifai account to run custom AI analysis.");
      return;
    }
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: customImage,
          audioText: customAudioText,
          notes: customNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          setErrorMessage("Wallet balance insufficient. Please top up your Sensifai balance.");
        } else {
          setErrorMessage(data.error || "Analysis failed. Please try again.");
        }
        setIsAnalyzing(false);
        return;
      }

      if (data.report) {
        setReport(data.report);
      }

      if (data.wallet) {
        window.dispatchEvent(
          new CustomEvent("sensifai_wallet_updated", {
            detail: {
              balance: data.wallet.balance,
              currency: data.wallet.currency,
            },
          })
        );
      }
    } catch (err: any) {
      setErrorMessage("Connection error. Could not complete AI request.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
        return "bg-rose-100 text-rose-800 border-rose-300";
      case "high":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFCFA] text-[#0F172A]">
      {/* Top Marketing Navigation */}
      <Navbar
        appName="QueueSense"
        logoSrc="/logo.png"
        primaryColor={brandPrimary}
        ctaLabel="Launch Workspace"
        ctaHref="#workspace"
        navLinks={[
          { label: "Workspace", href: "#workspace" },
          { label: "Features", href: "#features" },
          { label: "Telemetry", href: "#telemetry" },
          { label: "Pricing", href: "#pricing" },
        ]}
      />

      {/* Hero Section — Interactive Studio Split-Hero */}
      <section className="relative pt-12 pb-20 px-4 sm:px-6 lg:px-8 max-w-[1280px] mx-auto w-full overflow-hidden">
        {/* Ambient Gradient Glow */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="absolute top-40 left-10 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column (7 cols) */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-800 mb-6 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              <span>Sensifai Vision Core · Retail & Operations</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#0F172A] leading-[1.12]">
              Real-Time Retail Queue & Footfall Intelligence{" "}
              <span className="text-[#EA580C]">in 3 Seconds</span>
            </h1>

            <p className="mt-5 text-lg sm:text-xl text-[#475569] max-w-2xl leading-relaxed">
              Eliminate checkout bottlenecks, predict customer wait times, and
              automatically recommend register lane deployments from store cameras,
              audio reports, and POS feeds.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#workspace"
                className="px-6 py-3.5 rounded-xl font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] shadow-md hover:shadow-lg transition-all flex items-center gap-2"
              >
                <Sparkles className="h-5 w-5" />
                <span>Launch Studio Workspace</span>
                <ArrowRight className="h-4 w-4" />
              </a>

              <button
                onClick={() => {
                  const el = document.getElementById("workspace");
                  el?.scrollIntoView({ behavior: "smooth" });
                  handleSelectPreset("supermarket-rush");
                }}
                className="px-6 py-3.5 rounded-xl font-semibold text-[#0F172A] bg-white border border-[#CBD5E1] hover:bg-orange-50/50 shadow-xs transition-all flex items-center gap-2"
              >
                <span>Try Supermarket Preset</span>
              </button>
            </div>

            {/* Proof Metric Chips */}
            <div className="mt-10 grid grid-cols-3 gap-6 pt-6 border-t border-[#E2E8F0] w-full">
              <div>
                <div className="text-2xl sm:text-3xl font-mono font-bold text-[#0F172A]">
                  &lt; 3.2s
                </div>
                <div className="text-xs text-[#64748B] mt-0.5 font-medium">
                  Analysis Latency
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-mono font-bold text-[#0F172A]">
                  94.2%
                </div>
                <div className="text-xs text-[#64748B] mt-0.5 font-medium">
                  Queue Accuracy
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-mono font-bold text-[#0F172A]">
                  -40%
                </div>
                <div className="text-xs text-[#64748B] mt-0.5 font-medium">
                  Cart Abandonment
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Image with Glassmorphic Overlay (5 cols) */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden border border-orange-200/80 shadow-[0_20px_50px_rgba(234,88,12,0.12)] aspect-[4/3] bg-orange-950/10">
              <Image
                src="/images/hero.jpg"
                alt="QueueSense Retail Queue Detection in Action"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 550px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Floating Live Telemetry Badge */}
              <div className="absolute top-4 left-4 right-4 bg-white/95 backdrop-blur-md rounded-xl p-3 border border-white/40 shadow-lg flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center text-[#EA580C]">
                    <Store className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Lane 1 & 2 Live Monitor
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Active count: 15 customers
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-rose-100 text-rose-800">
                  Bottleneck
                </span>
              </div>

              {/* Bottom Quick Metric Card */}
              <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md rounded-xl p-3.5 border border-white/10 text-white flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    Recommended Immediate Action
                  </div>
                  <div className="text-xs font-semibold text-white mt-0.5 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    Open Register Lane 3 & 4
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
                  +40% Flow
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Framed Platform UI Showcase (Mandatory Chrome Device Frame) */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-[1280px] mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A]">
            Engineered for Retail Floor Operations
          </h2>
          <p className="mt-2 text-[#475569] text-sm sm:text-base">
            An intuitive command center designed for store managers, cashiers, and operations leads.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_50px_rgba(5,15,26,0.08)] overflow-hidden">
          <div className="h-10 bg-slate-50 border-b border-slate-200/90 px-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-400/80" />
              <span className="h-3 w-3 rounded-full bg-amber-400/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
            </div>
            <div className="px-3 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-mono text-slate-500">
              https://queuesense.sensifai.com/workspace
            </div>
            <div className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry Core
            </div>
          </div>
          <div className="relative aspect-video w-full bg-slate-900">
            <Image
              src="/images/platform-ui.png"
              alt="QueueSense Live Workspace Interface"
              fill
              sizes="(max-width: 768px) 100vw, 1100px"
              className="object-cover object-top"
            />
          </div>
        </div>
      </section>

      {/* Feature Visual Cards Grid */}
      <section id="features" className="py-16 px-4 sm:px-6 lg:px-8 max-w-[1280px] mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-xs font-semibold text-orange-800 mb-3">
            <Zap className="h-3.5 w-3.5" />
            <span>End-to-End Retail Intelligence</span>
          </div>
          <h2 className="text-3xl font-bold text-[#0F172A]">
            Turn Footfall Friction into Revenue
          </h2>
          <p className="mt-3 text-[#475569] text-base">
            Every second customers wait in line directly impacts checkout satisfaction and basket size.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col">
            <div className="relative aspect-[16/10] w-full bg-slate-100">
              <Image
                src="/images/feature-1.jpg"
                alt="Queue Length & Bottleneck Detection"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 380px"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <div className="h-8 w-8 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center font-bold text-sm mb-3">
                01
              </div>
              <h3 className="text-lg font-bold text-[#0F172A]">
                Queue Stanchion & Headcount Detection
              </h3>
              <p className="mt-2 text-sm text-[#475569] leading-relaxed flex-1">
                Pinpoints exact customer density, queue trajectory, and line spillover across every active checkout lane.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col">
            <div className="relative aspect-[16/10] w-full bg-slate-100">
              <Image
                src="/images/feature-2.jpg"
                alt="Cashier & Register Lane Optimization"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 380px"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <div className="h-8 w-8 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center font-bold text-sm mb-3">
                02
              </div>
              <h3 className="text-lg font-bold text-[#0F172A]">
                Dynamic Cashier Deployment
              </h3>
              <p className="mt-2 text-sm text-[#475569] leading-relaxed flex-1">
                Predicts exactly when to open additional registers before wait times surpass the critical 5-minute abandonment barrier.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col">
            <div className="relative aspect-[16/10] w-full bg-slate-100">
              <Image
                src="/images/feature-3.jpg"
                alt="Footfall & Abandonment Telemetry"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 380px"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <div className="h-8 w-8 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center font-bold text-sm mb-3">
                03
              </div>
              <h3 className="text-lg font-bold text-[#0F172A]">
                Footfall & Abandonment Telemetry
              </h3>
              <p className="mt-2 text-sm text-[#475569] leading-relaxed flex-1">
                Monitors customer arrival pacing, throughput service rates, and floor efficiency scores in real time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive SaaS Workspace Anchor */}
      <section id="workspace" className="py-8 scroll-mt-6">
        <div className="max-w-[1360px] mx-auto px-2 sm:px-4">
          <AppShell
            appName="QueueSense"
            appTagline="Retail Operations Command Center"
            logoSrc="/logo.png"
            primaryColor={brandPrimary}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            pricePerActionEur={0.05}
            navItems={[
              {
                id: "workspace",
                label: "Queue Studio",
                icon: <Store className="h-4 w-4" />,
              },
              {
                id: "telemetry",
                label: "Footfall Telemetry",
                icon: <BarChart3 className="h-4 w-4" />,
              },
              {
                id: "presets",
                label: "Preset Library",
                icon: <Layers className="h-4 w-4" />,
              },
              {
                id: "api",
                label: "API Reference",
                icon: <FileText className="h-4 w-4" />,
              },
            ]}
          >
            {/* View 1: Main Queue Studio */}
            {activeTab === "workspace" && (
              <div className="space-y-6">
                {/* Header Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] flex items-center gap-2">
                      <Store className="h-6 w-6 text-[#EA580C]" />
                      <span>Live Queue Intelligence Studio</span>
                    </h2>
                    <p className="text-sm text-[#64748B] mt-0.5">
                      Select realistic store presets or upload store footage for real-time analysis.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      Pricing: €0.05 / request
                    </span>
                    <button
                      onClick={() => handleSelectPreset(selectedPresetId)}
                      disabled={isAnalyzing}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${isAnalyzing ? "animate-spin text-orange-500" : ""}`}
                      />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                {/* Preset Chips */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-2.5">
                    Pre-loaded Store Scenarios (Free Instant Testing)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {SAMPLE_PRESETS.map((preset) => {
                      const isSelected = selectedPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => handleSelectPreset(preset.id)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? "border-[#EA580C] bg-orange-50/70 shadow-xs ring-1 ring-[#EA580C]"
                              : "border-[#E2E8F0] bg-white hover:border-orange-200 hover:bg-orange-50/30"
                          }`}
                        >
                          <div className="text-xs font-semibold text-[#0F172A] truncate">
                            {preset.name}
                          </div>
                          <div className="text-[11px] text-[#64748B] mt-0.5 truncate">
                            {preset.category}
                          </div>
                          <div className="mt-2 inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 text-slate-700">
                            {preset.badge}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Upload & Input Box */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Camera className="h-5 w-5 text-[#EA580C]" />
                      <h3 className="text-sm sm:text-base font-bold text-[#0F172A]">
                        Custom Camera Upload & Observations
                      </h3>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-orange-50 text-[#EA580C] border border-orange-200 hover:bg-orange-100 flex items-center gap-1.5 transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Upload Store Image</span>
                      </button>
                    </div>
                  </div>

                  {customImage && (
                    <div className="mb-4 relative w-full h-48 rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={customImage}
                        alt="Custom Store Camera"
                        className="w-full h-full object-contain"
                      />
                      <button
                        onClick={() => setCustomImage(null)}
                        className="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-[11px] font-medium"
                      >
                        Clear Image
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#475569] mb-1">
                        Verbal Store Observation or Audio Transcription
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={customAudioText}
                          onChange={(e) => setCustomAudioText(e.target.value)}
                          placeholder="e.g. Floor manager report: 10 people at register 1, lane 2 card reader frozen..."
                          className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-slate-50"
                        />
                        <Mic className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#475569] mb-1">
                        Operational Context & Store Section Notes
                      </label>
                      <input
                        type="text"
                        value={customNotes}
                        onChange={(e) => setCustomNotes(e.target.value)}
                        placeholder="e.g. Express counter 1-10 items, shift change in 15 mins"
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* Auth Gate for Custom Input Execution */}
                  <AuthGateCard
                    authenticated={Boolean(session?.authenticated)}
                    primaryColor={brandPrimary}
                    priceEur={0.05}
                    featureTitle="Analyze Custom Store Feeds"
                  />

                  {session?.authenticated && (
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs text-[#64748B]">
                        Ready to process. Verified balance: €
                        {session.wallet?.balance?.toFixed(2) ?? "0.00"}
                      </div>
                      <button
                        onClick={handleRunCustomAnalysis}
                        disabled={isAnalyzing}
                        className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>
                          {isAnalyzing ? "Analyzing Store Feeds..." : "Run AI Analysis (€0.05)"}
                        </span>
                      </button>
                    </div>
                  )}

                  {errorMessage && (
                    <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>

                {/* Live Analysis Output Dashboard */}
                <div className="space-y-6">
                  {/* Top KPI Telemetry Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {/* KPI 1 */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                      <div className="flex items-center justify-between text-xs text-[#64748B] font-medium">
                        <span>Total Customers in Queue</span>
                        <Users className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="mt-2 text-2xl sm:text-3xl font-mono font-bold text-[#0F172A]">
                        {report.result.total_people_detected}
                      </div>
                      <div className="mt-1 text-[11px] text-[#64748B] flex items-center gap-1">
                        <span>Pacing:</span>
                        <span className="font-mono font-semibold text-[#0F172A]">
                          {report.footfall_metrics.arrival_rate_per_min}/min
                        </span>
                      </div>
                    </div>

                    {/* KPI 2 */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                      <div className="flex items-center justify-between text-xs text-[#64748B] font-medium">
                        <span>Estimated Wait Time</span>
                        <Clock className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="mt-2 text-2xl sm:text-3xl font-mono font-bold text-[#0F172A]">
                        {report.result.estimated_wait_time_minutes.toFixed(1)}m
                      </div>
                      <div className="mt-1 text-[11px] text-[#64748B] font-mono">
                        Range: {report.result.wait_time_range.min.toFixed(1)}m –{" "}
                        {report.result.wait_time_range.max.toFixed(1)}m
                      </div>
                    </div>

                    {/* KPI 3 */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                      <div className="flex items-center justify-between text-xs text-[#64748B] font-medium">
                        <span>Register Lanes</span>
                        <Store className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="mt-2 text-2xl sm:text-3xl font-mono font-bold text-[#0F172A]">
                        {report.result.active_lanes}{" "}
                        <span className="text-sm font-normal text-[#64748B]">
                          / {report.result.recommended_lanes} rec.
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-orange-600">
                        {report.result.recommended_lanes > report.result.active_lanes
                          ? `Deploy +${report.result.recommended_lanes - report.result.active_lanes} lane(s)`
                          : "Lane capacity balanced"}
                      </div>
                    </div>

                    {/* KPI 4 */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                      <div className="flex items-center justify-between text-xs text-[#64748B] font-medium">
                        <span>Abandonment Risk</span>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="mt-2 text-2xl sm:text-3xl font-mono font-bold text-[#0F172A]">
                        {report.footfall_metrics.abandonment_risk_percent}%
                      </div>
                      <div className="mt-1 text-[11px] text-[#64748B] flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${getSeverityBadgeClass(
                            report.result.severity
                          )}`}
                        >
                          {report.result.queue_status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Scorecard & Circular Efficiency Gauge */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Left: Efficiency Radial Gauge (4 cols) */}
                    <div className="lg:col-span-4 p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col items-center justify-center text-center">
                      <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-3">
                        Operational Efficiency Score
                      </div>
                      <div className="relative w-36 h-36 flex items-center justify-center my-2">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            className="text-slate-100"
                            strokeWidth="8"
                            stroke="currentColor"
                            fill="transparent"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            strokeWidth="8"
                            strokeDasharray={251.2}
                            strokeDashoffset={
                              251.2 - (251.2 * report.footfall_metrics.efficiency_score) / 100
                            }
                            strokeLinecap="round"
                            stroke={brandPrimary}
                            fill="transparent"
                            className="transition-all duration-700 ease-out"
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                          <span className="text-3xl font-mono font-bold text-[#0F172A]">
                            {report.footfall_metrics.efficiency_score}
                          </span>
                          <span className="text-[10px] text-[#64748B] uppercase font-semibold">
                            out of 100
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-[#64748B] mt-2">
                        Throughput service rate:{" "}
                        <span className="font-mono font-semibold text-[#0F172A]">
                          {report.result.service_rate_per_min} customers/min
                        </span>
                      </p>
                    </div>

                    {/* Right: Operational Summary & Re-check Notice (8 cols) */}
                    <div className="lg:col-span-8 p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                            Real-Time Assessment
                          </span>
                          <span className="text-xs font-mono text-[#64748B]">
                            Confidence: {report.confidence}%
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-[#0F172A]">
                          {report.result.queue_status} Queue Density Detected
                        </h4>
                        <p className="mt-2 text-sm text-[#475569] leading-relaxed">
                          {report.result.description}
                        </p>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-600 flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-orange-500" />
                          <span>
                            Next Check:{" "}
                            <span className="font-semibold text-slate-900">
                              {report.next_check}
                            </span>
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Engine: {report.meta.engine} ({report.meta.latency_ms}ms)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Tab Detailed Inspection View */}
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                    <div className="flex border-b border-slate-200 bg-slate-50/70 px-4 pt-2 gap-2 overflow-x-auto">
                      <button
                        onClick={() => setWorkspaceSubTab("summary")}
                        className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                          workspaceSubTab === "summary"
                            ? "bg-white text-[#EA580C] border-t-2 border-[#EA580C] shadow-xs"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Executive Summary</span>
                      </button>
                      <button
                        onClick={() => setWorkspaceSubTab("lanes")}
                        className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                          workspaceSubTab === "lanes"
                            ? "bg-white text-[#EA580C] border-t-2 border-[#EA580C] shadow-xs"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}
                      >
                        <Store className="h-3.5 w-3.5" />
                        <span>Lane Telemetry ({report.lane_breakdown.length})</span>
                      </button>
                      <button
                        onClick={() => setWorkspaceSubTab("actions")}
                        className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                          workspaceSubTab === "actions"
                            ? "bg-white text-[#EA580C] border-t-2 border-[#EA580C] shadow-xs"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Action Plan ({report.actions.length})</span>
                      </button>
                      <button
                        onClick={() => setWorkspaceSubTab("json")}
                        className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                          workspaceSubTab === "json"
                            ? "bg-white text-[#EA580C] border-t-2 border-[#EA580C] shadow-xs"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        <span>Raw JSON & API</span>
                      </button>
                    </div>

                    <div className="p-5">
                      {/* Sub-tab 1: Executive Summary */}
                      {workspaceSubTab === "summary" && (
                        <div className="space-y-4">
                          <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-100">
                            <h4 className="text-xs font-semibold uppercase text-orange-900 tracking-wider mb-2">
                              Operational Context & Impact
                            </h4>
                            <p className="text-sm text-slate-800 leading-relaxed">
                              {report.result.description}
                            </p>
                          </div>

                          {report.warnings.length > 0 && (
                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                              <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs mb-1.5">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                <span>Threshold Warnings</span>
                              </div>
                              <ul className="list-disc list-inside space-y-1 text-xs text-amber-950">
                                {report.warnings.map((w, idx) => (
                                  <li key={idx}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2">
                            <span className="text-xs text-slate-500 font-mono">
                              Report ID: {report.id}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleCopyJson}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5"
                              >
                                {copiedJson ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                                <span>{copiedJson ? "Copied" : "Copy Report"}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sub-tab 2: Lane Telemetry */}
                      {workspaceSubTab === "lanes" && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {report.lane_breakdown.map((lane, idx) => (
                              <div
                                key={idx}
                                className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-bold text-[#0F172A]">
                                    {lane.lane_id}
                                  </span>
                                  <span
                                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                      lane.status === "Bottleneck"
                                        ? "bg-rose-100 text-rose-800"
                                        : lane.status === "Busy"
                                        ? "bg-amber-100 text-amber-800"
                                        : lane.status === "Optimal"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {lane.status}
                                  </span>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-slate-500 block">Queue Length:</span>
                                    <span className="text-base font-mono font-bold text-[#0F172A]">
                                      {lane.queue_length} people
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">Estimated Wait:</span>
                                    <span className="text-base font-mono font-bold text-[#0F172A]">
                                      {lane.estimated_wait_min.toFixed(1)} mins
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                                  <span>Cashier Terminal:</span>
                                  <span
                                    className={`font-semibold ${
                                      lane.cashier_active ? "text-emerald-600" : "text-slate-400"
                                    }`}
                                  >
                                    {lane.cashier_active ? "● Staffed" : "○ Offline"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Sub-tab 3: Action Plan */}
                      {workspaceSubTab === "actions" && (
                        <div className="space-y-3">
                          <p className="text-xs text-[#64748B] mb-2">
                            Prioritized operational interventions generated by Sensifai Vision Core:
                          </p>
                          <div className="space-y-2">
                            {report.actions.map((act, idx) => (
                              <div
                                key={idx}
                                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start gap-3"
                              >
                                <span className="h-6 w-6 rounded-lg bg-orange-100 text-[#EA580C] font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <div className="text-sm font-medium text-[#0F172A] leading-relaxed">
                                  {act}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Sub-tab 4: Raw JSON */}
                      {workspaceSubTab === "json" && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-[#64748B] font-mono">
                              HTTP 200 · application/json
                            </span>
                            <button
                              onClick={handleCopyJson}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1"
                            >
                              {copiedJson ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              <span>{copiedJson ? "Copied" : "Copy JSON"}</span>
                            </button>
                          </div>
                          <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto max-h-96">
                            {JSON.stringify(report, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* View 2: Footfall Telemetry */}
            {activeTab === "telemetry" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-[#0F172A]">
                    Footfall Pacing & Abandonment Curves
                  </h3>
                  <p className="text-sm text-[#64748B] mt-0.5">
                    Aggregated queue telemetry metrics modeled against the 5-minute retail checkout threshold.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Mean Service Pacing
                    </div>
                    <div className="text-3xl font-mono font-bold text-slate-900 mt-2">
                      {report.result.service_rate_per_min} / min
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Average customers checked out per minute across open terminals.
                    </p>
                  </div>

                  <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Arrival Velocity
                    </div>
                    <div className="text-3xl font-mono font-bold text-slate-900 mt-2">
                      {report.footfall_metrics.arrival_rate_per_min} / min
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Real-time customer inflow arriving at the register staging area.
                    </p>
                  </div>

                  <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Net Flow Equilibrium
                    </div>
                    <div
                      className={`text-3xl font-mono font-bold mt-2 ${
                        report.result.service_rate_per_min >=
                        report.footfall_metrics.arrival_rate_per_min
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {(
                        report.result.service_rate_per_min -
                        report.footfall_metrics.arrival_rate_per_min
                      ).toFixed(2)}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Positive indicates line clearance; negative indicates queue buildup.
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs">
                  <h4 className="text-sm font-bold text-[#0F172A] mb-3">
                    Retail Abandonment Benchmark
                  </h4>
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: "25%" }}
                      className="bg-emerald-500"
                      title="< 2 mins: 2% abandonment"
                    />
                    <div
                      style={{ width: "25%" }}
                      className="bg-amber-400"
                      title="2-4 mins: 12% abandonment"
                    />
                    <div
                      style={{ width: "25%" }}
                      className="bg-orange-500"
                      title="4-5 mins: 24% abandonment"
                    />
                    <div
                      style={{ width: "25%" }}
                      className="bg-rose-500"
                      title="> 5 mins: 40%+ abandonment"
                    />
                  </div>
                  <div className="grid grid-cols-4 text-[11px] font-mono text-slate-500 mt-2 text-center">
                    <span>&lt; 2m (Optimal)</span>
                    <span>2–4m (Moderate)</span>
                    <span>4–5m (Elevated)</span>
                    <span className="text-rose-600 font-bold">&gt; 5m (Critical Risk)</span>
                  </div>
                </div>
              </div>
            )}

            {/* View 3: Preset Library */}
            {activeTab === "presets" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-[#0F172A]">Preset Library</h3>
                  <p className="text-sm text-[#64748B] mt-0.5">
                    Explore pre-calibrated retail environments ready for instant evaluation.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {SAMPLE_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                            {preset.category}
                          </span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {preset.badge}
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-[#0F172A]">{preset.name}</h4>
                        <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-500">
                          {preset.data.result.total_people_detected} customers ·{" "}
                          {preset.data.result.estimated_wait_time_minutes.toFixed(1)}m wait
                        </span>
                        <button
                          onClick={() => {
                            handleSelectPreset(preset.id);
                            setActiveTab("workspace");
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] transition-colors"
                        >
                          Load Preset
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View 4: API Reference */}
            {activeTab === "api" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-[#0F172A]">
                    Developer API Integration
                  </h3>
                  <p className="text-sm text-[#64748B] mt-0.5">
                    Integrate QueueSense into POS systems, security cameras, or digital signage.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                  <h4 className="text-sm font-bold text-[#0F172A]">Sample cURL Request</h4>
                  <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
{`curl -X POST https://queuesense.sensifai.com/v1/queuesense/analyze \\
  -H "X-API-Key: $SENSIFAI_API_KEY" \\
  -F "file=@store_checkout.jpg" \\
  -F "notes=Register 1-4 standard peak"`}
                  </pre>

                  <h4 className="text-sm font-bold text-[#0F172A]">Endpoints</h4>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <span>POST /v1/queuesense/analyze</span>
                      <span className="text-slate-500">multipart/form-data</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <span>POST /v1/queuesense/analyze-url</span>
                      <span className="text-slate-500">&#123; image_url &#125;</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <span>POST /v1/queuesense/batch</span>
                      <span className="text-slate-500">&#123; urls: [...] &#125;</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <span>POST /v1/queuesense/feedback</span>
                      <span className="text-slate-500">&#123; correction: ... &#125;</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </AppShell>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 max-w-[1280px] mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-xs font-semibold text-orange-800 mb-3">
            <span>Transparent Unit Economics</span>
          </div>
          <h2 className="text-3xl font-bold text-[#0F172A]">
            Simple Metered Pricing for Retailers
          </h2>
          <p className="mt-3 text-[#475569] text-base">
            Pay only for what you analyze. Zero long-term contracts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Plan 1 */}
          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Pay-As-You-Go
              </div>
              <div className="text-3xl font-mono font-bold text-slate-900 mt-2">
                €0.05{" "}
                <span className="text-sm font-normal text-slate-500">/ request</span>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Ideal for ad-hoc queue checks, trial deployments, and low-frequency stores.
              </p>
              <ul className="mt-6 space-y-2.5 text-xs text-slate-700">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Full multimodal queue detection</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Immediate cashier recommendations</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Deducted directly from Sensifai Wallet</span>
                </li>
              </ul>
            </div>
            <a
              href="/api/auth/login"
              className="mt-8 py-2.5 px-4 rounded-xl text-center text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] transition-colors"
            >
              Get Started with Wallet
            </a>
          </div>

          {/* Plan 2: Pro */}
          <div className="p-6 rounded-2xl border-2 border-orange-500 bg-white shadow-md relative flex flex-col justify-between">
            <span className="absolute -top-3 right-6 px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-mono text-[11px] font-semibold">
              Popular for SMBs
            </span>
            <div>
              <div className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                Store Operator Pro
              </div>
              <div className="text-3xl font-mono font-bold text-slate-900 mt-2">
                €29{" "}
                <span className="text-sm font-normal text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Continuous 15-minute polling for supermarket and grocery store branches.
              </p>
              <ul className="mt-6 space-y-2.5 text-xs text-slate-700">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>1,000 monthly automated analyses</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Automated Cashier PA alert broadcasts</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Full API & webhook integration</span>
                </li>
              </ul>
            </div>
            <a
              href="https://sensifai.com/marketplace/spi-queuesense"
              className="mt-8 py-2.5 px-4 rounded-xl text-center text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors"
            >
              Subscribe on Marketplace
            </a>
          </div>

          {/* Plan 3: Enterprise */}
          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Multi-Store Enterprise
              </div>
              <div className="text-3xl font-mono font-bold text-slate-900 mt-2">
                €99{" "}
                <span className="text-sm font-normal text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Multi-location chain operations with customized footfall thresholds and SLAs.
              </p>
              <ul className="mt-6 space-y-2.5 text-xs text-slate-700">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>5,000 monthly analyses + high-priority queue</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Multi-camera RTSP video stream ingest</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Dedicated Slack & Webhook dispatch</span>
                </li>
              </ul>
            </div>
            <a
              href="https://sensifai.com/marketplace/spi-queuesense"
              className="mt-8 py-2.5 px-4 rounded-xl text-center text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Compliance & Standard Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="relative h-7 w-7">
              <Image src="/logo.png" alt="QueueSense Logo" fill className="object-contain" />
            </div>
            <span className="font-bold text-sm text-[#0F172A]">QueueSense</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">
              Retail Queue & Footfall Intelligence
            </span>
          </div>

          <p className="text-[11px] text-slate-500 text-center md:text-left max-w-xl">
            Non-diagnostic retail operational tool. No biometric or facial recognition
            identities are recorded or persisted. Images processed ephemerally. Compliant
            with Sensifai Marketplace Standards.
          </p>

          <div className="text-xs text-slate-400 font-mono">
            © 2026 Sensifai BV · queuesense
          </div>
        </div>
      </footer>
    </div>
  );
}
