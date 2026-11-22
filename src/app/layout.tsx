import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { Inter, Geist_Mono, Rubik } from "next/font/google";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import { PersistentShell, SidebarRoot } from "@/components/layout/app-shell";
import { I18nProvider } from "@/i18n/client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { StudioProvider } from "@/components/studio-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/query-provider";
import { dirFor, isLocale, defaultLocale } from "@/i18n/routing";
import { PRIVACY_COOKIE } from "@/lib/privacy";
import "./globals.css";
import "@/components/dashboard/studio.css";
import "./a11y.css";
import { A11yProvider } from "@/components/a11y/a11y-menu";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Hebrew UI font; globals.css points the font variables at it under lang="he".
const heebo = Rubik({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Penny",
  description: "Personal finance tracker with AI-powered categorization",
  applicationName: "Penny",
  appleWebApp: { capable: true, title: "Penny", statusBarStyle: "default" },
  // Declaring `icons` replaces the file-based icon.svg link, so name it here too:
  // without it the tab has no icon and every load asks for /favicon.ico (404).
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a1a" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const messages = await getMessages();
  const dir = dirFor(locale);
  // Set by the sidebar's collapse button; collapsed (icons only) until someone opens it.
  const jar = await cookies();
  const sidebarOpen = jar.get("sidebar_state")?.value === "true";
  return (
    <html
      lang={locale}
      dir={dir}
      data-privacy={jar.get(PRIVACY_COOKIE)?.value === "on" ? "on" : "off"}
      className={`${inter.variable} ${heebo.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved studio theme before first paint, so a refresh never flashes another theme. Mirrors StudioProvider. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem("shekel.budget-studio.v1")||"null");if(p){var r=document.documentElement,t=p.theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"midnight":"pearl"):(p.theme==="midnight"?"midnight":"pearl");localStorage.setItem("theme",p.theme==="system"?"system":t==="midnight"?"dark":"light");r.classList.add("app-studio");r.classList.toggle("dark",t==="midnight");r.style.colorScheme=t==="midnight"?"dark":"light";r.dataset.studioTheme=t;r.dataset.studioAccent="violet";r.dataset.studioDensity=p.density;r.dataset.studioMotion=String(p.motion);r.dataset.studioCustom="false"}}catch(e){}`,
          }}
        />
        {/* Accessibility menu choices, before first paint (mirrors A11yProvider). */}
        <script dangerouslySetInnerHTML={{ __html: `try{var c=localStorage.getItem("penny.a11y.classes");if(c)document.documentElement.classList.add.apply(document.documentElement.classList,c.split(" ").filter(Boolean))}catch(e){}` }} />
      </head>
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} messages={messages as Record<string, unknown>}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <StudioProvider>
            <QueryProvider>
              <TooltipProvider>
                <A11yProvider>
                <SidebarRoot defaultOpen={sidebarOpen}><PersistentShell>{children}</PersistentShell></SidebarRoot>
                </A11yProvider>
                <Toaster />
                <ServiceWorkerRegister />
              </TooltipProvider>
            </QueryProvider>
            </StudioProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
