import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import { ThemeProvider, Theme } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import { Language } from "@/i18n";
import "./google-fonts.css";
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

  const fontCookie = cookieStore.get("rudder_font")?.value;
  const initialFont = fontCookie || "grenze";

  return (
    <html
      lang={initialLang}
      className={`h-full antialiased ${initialTheme === "dark" ? "dark" : ""} palette-default`}
      data-theme={initialTheme}
      data-palette="default"
      data-font={initialFont}
      style={{ colorScheme: initialTheme }}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Grenze:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600;1,700&family=Jim+Nightshade&family=Cormorant+Upright:wght@300;400;500;600;700&family=Joan&family=Twinkle+Star&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans transition-colors duration-200">
        <Script
          id="rudder-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{var p=localStorage.getItem('app_color_theme')||'default';document.documentElement.setAttribute('data-palette',p);document.documentElement.classList.remove('palette-default');document.documentElement.classList.add('palette-'+p);var f=localStorage.getItem('app_font_family')||'grenze';document.documentElement.setAttribute('data-font',f);var fontMap={'grenze':"'Grenze', serif",'jim-nightshade':"'Jim Nightshade', cursive",'cormorant-upright':"'Cormorant Upright', serif",'joan':"'Joan', serif",'twinkle-star':"'Twinkle Star', cursive"};if(fontMap[f]){document.documentElement.style.setProperty('--app-font',fontMap[f]);}var t=localStorage.getItem('rudder:theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');document.documentElement.setAttribute('data-theme','light');document.documentElement.style.colorScheme='light'}else{document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');document.documentElement.setAttribute('data-theme','dark');document.documentElement.style.colorScheme='dark'}var l=localStorage.getItem('rudder:lang');if(l==='en'||l==='tr'){document.documentElement.lang=l;document.cookie='rudder_lang='+l+'; path=/; max-age=31536000; SameSite=Lax';}}catch(e){}`,
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