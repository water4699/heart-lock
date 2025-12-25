import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { Navigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: "CipherScore | Encrypted Peer Review",
  description:
    "Anonymous performance loops powered by FHE. Collect encrypted peer scores, decrypt insights only when authorised.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-slate-900 antialiased">
        <Providers>
          <div className="relative min-h-screen overflow-hidden">
            <div className="pointer-events-none absolute inset-0 -z-10">
              <div className="bg-radial opacity-80" />
            </div>
            <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-16 pt-8 md:px-8">
              <SiteHeader />
              <div className="mt-6">
                <Navigation />
              </div>
              <div className="mt-6 flex-1">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
