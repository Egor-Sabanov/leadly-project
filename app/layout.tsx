import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEADLY — Возможности для заработка",
  description:
    "Рабочее пространство digital-специалиста: подходящие возможности, отклики, клиенты и финансы.",
  applicationName: "LEADLY",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f6f6f4",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#main-content">
          К содержимому
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
