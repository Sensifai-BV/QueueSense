import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QueueSense — AI Retail Queue & Footfall Intelligence in 3 Seconds",
  description:
    "Real-time AI queue detection, wait-time prediction, cashier lane optimization, and footfall analytics from store cameras, audio reports, and retail feeds.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-page text-txt-primary overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
