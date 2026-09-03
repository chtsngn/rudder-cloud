import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import { ThemeProvider, Theme } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import { Language } from "@/i18n";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("rudder_theme")?.value;
  const initialTheme: Theme = themeCookie === "light" ? "light" : "dark";

  const langCookie = cookieStore.get("rudder_lang")?.value;
  const initialLang: Language = langCookie === "en" || langCookie === "tr" ? langCookie : "tr";

  return (
    <html
      lang={initialLang}
      className={`h-full antialiased ${initialTheme === "dark" ? "dark" : ""} palette-default`}
      data-theme={initialTheme}
      data-palette="default"
      style={{ colorScheme: initialTheme }}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans transition-colors duration-200">
        <Script
          id="rudder-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{var p=localStorage.getItem('app_color_theme')||'default';document.documentElement.setAttribute('data-palette',p);document.documentElement.classList.remove('palette-default');document.documentElement.classList.add('palette-'+p);var t=localStorage.getItem('rudder:theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');document.documentElement.setAttribute('data-theme','light');document.documentElement.style.colorScheme='light'}else{document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');document.documentElement.setAttribute('data-theme','dark');document.documentElement.style.colorScheme='dark'}}catch(e){}`,
          }}
        />
        <ThemeProvider initialTheme={initialTheme}>
          <LanguageProvider initialLang={initialLang}>
            {children}
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}