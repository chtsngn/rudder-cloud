import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rudder — Server Panel",
  description: "Profesyonel sunucu yönetim ve self-hosting platformu.",
  icons: {
    icon: "/rudder-helm-transparent.png",
    shortcut: "/rudder-helm-transparent.png",
    apple: "/rudder-helm-transparent.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}