import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
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
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem('rudder:theme');
                if (savedTheme === 'dark') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.setAttribute('data-theme', 'dark');
                  document.documentElement.style.colorScheme = 'dark';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.setAttribute('data-theme', 'light');
                  document.documentElement.style.colorScheme = 'light';
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans transition-colors duration-200">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}