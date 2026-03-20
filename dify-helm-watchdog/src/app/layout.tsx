import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Dify Helm Watchdog",
    template: "%s | Dify Helm Watchdog",
  },
  description:
    "Monitor Dify Helm chart versions — daily snapshots of values.yaml, container images, and image validation results.",
  metadataBase: new URL("https://helm-watchdog.dify.ai"),
  openGraph: {
    title: "Dify Helm Watchdog",
    description:
      "Monitor Dify Helm chart versions — daily snapshots of values.yaml, container images, and image validation results.",
    siteName: "Dify Helm Watchdog",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Dify Helm Watchdog",
    description:
      "Monitor Dify Helm chart versions — daily snapshots of values.yaml, container images, and image validation results.",
  },
  icons: {
    icon: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* 主容器 - 统一控制边距和最大宽度 */}
          <div className="mx-auto h-screen w-full px-4 py-6 md:px-6 lg:px-8">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
