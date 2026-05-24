import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LariPulse",
  description: "Explainable market intelligence for investors and traders"
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
