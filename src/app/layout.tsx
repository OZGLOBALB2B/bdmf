import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-rubik",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BDMF — Business-Driven Marketing Focus",
  description:
    "From business strategy to marketing focus. A staged process for choosing the marketing initiatives that deserve the year.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={rubik.variable}>
      <body>{children}</body>
    </html>
  );
}
