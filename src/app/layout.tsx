import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "LIPB VFR windows · Bolzano / Bozen",
  description:
    "Hangar board for Bolzano (LIPB): scheduled IFR holes, Valle Adige sector, decoded METAR/TAF, and a subscribeable VFR calendar.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-full flex-col">
        <div className="hangar-grain" aria-hidden />
        {children}
      </body>
    </html>
  );
}
