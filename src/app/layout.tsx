import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LariPulse",
  description: "Explainable crypto signal intelligence for Phase 1 markets"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
