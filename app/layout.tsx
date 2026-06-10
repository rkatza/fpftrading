import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { auth } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FPF FX View",
  description: "FX exposure & hedge management — First Principles Fund",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
        <div className="flex min-h-screen">
          {session && <Nav userEmail={session.user?.email ?? ""} />}
          <main className="flex-1 overflow-x-hidden p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
