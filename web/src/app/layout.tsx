import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { FloatingPlayer } from "./_components/floating-player";
import { SiteHeader } from "./_components/site-header";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Talk with Lex · Lex Fridman Podcast search",
  description: "Find any moment of the Lex Fridman Podcast and chat with every transcript, powered by Meilisearch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          <SiteHeader />
          {children}
          <FloatingPlayer />
        </Providers>
      </body>
    </html>
  );
}
