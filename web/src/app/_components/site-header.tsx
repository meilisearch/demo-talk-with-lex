"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, MessagesSquare, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Find a moment", icon: Search },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2">
          <AudioLines className="size-5 text-[var(--brand)]" />
          <span className="font-serif text-lg font-semibold tracking-tight">Talk with Lex</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Lex Fridman Podcast transcripts · powered by Meilisearch
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                pathname === href && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
