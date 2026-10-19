import { BrandAtmosphere } from "@/components/brand/BrandAtmosphere";
import { CookieNotice } from "@/components/privacy/CookieNotice";
import { TelegramEnvironment } from "@/components/telegram/TelegramEnvironment";
import type { Metadata, Viewport } from "next";
import "@fontsource-variable/golos-text";
import "./globals.css";
import "./design-system.css";
import "./telegram.css";

export const metadata: Metadata = {
  title: "LEADLY — Возможности для заработка",
  description:
    "Рабочее пространство digital-специалиста: подходящие возможности, отклики, клиенты и финансы.",
  applicationName: "LEADLY",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#101010",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <TelegramEnvironment />
        <BrandAtmosphere />
        <a className="skip-link" href="#main-content">
          К содержимому
        </a>
        <div id="main-content">{children}</div>
        <CookieNotice />
      </body>
    </html>
  );
}
