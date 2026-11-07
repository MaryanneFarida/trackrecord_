import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { ConnectivityBanner } from "@/components/connectivity";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "TrackRecord", template: "%s · TrackRecord" },
  description: "Tamper-evident performance records for Kenyan para-athletes.",
  applicationName: "TrackRecord",
  appleWebApp: { capable: true, title: "TrackRecord", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0b5d3b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConnectivityBanner />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}