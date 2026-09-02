import type { Metadata } from "next";
import "./globals.css";

// NOTE: This sandboxed build environment cannot reach fonts.googleapis.com
// (proxy returns 403), so next/font/google would hard-fail `next build` here.
// Falling back to system font stacks per the plan's explicit allowance.
// To restore real Google Fonts once you have normal internet access, swap
// this back to:
//
//   import { Manrope, Public_Sans, JetBrains_Mono } from "next/font/google";
//
//   const fontHeading = Manrope({ variable: "--font-heading", subsets: ["latin"], display: "swap" });
//   const fontSans = Public_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
//   const fontMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });
//
// ...and spread `${fontHeading.variable} ${fontSans.variable} ${fontMono.variable}`
// into the <html> className below. The --font-sans / --font-heading / --font-mono
// mappings in globals.css already read from those exact variable names, so no
// other change is needed.

export const metadata: Metadata = {
  title: "Rudder Cloud — Sunucu Yönetim Paneli",
  description: "Modern, güçlü ve kendi sunucunuzda barındırılan sunucu yönetim paneli.",
  icons: {
    icon: "/rudder-icon.png",
    shortcut: "/rudder-icon.png",
    apple: "/rudder-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
