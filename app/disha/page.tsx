import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import DishaClient from "./DishaClient";

export const metadata: Metadata = {
  title: "Disha — What should I learn next?",
  description: "A free, personal learning path for self-directed learners in Bhopal.",
};

// Disha-only type pairing (Claude's warm, editorial look): a serif display
// face for headings, a clean humanist sans for body copy. Scoped via the
// `.disha-page` wrapper below + the CSS vars these `variable` classNames
// define, so app/layout.tsx's Geist fonts (used by every other page) are
// untouched.
const dishaDisplay = Fraunces({
  variable: "--font-disha-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const dishaSans = Inter({
  variable: "--font-disha-sans",
  subsets: ["latin"],
  display: "swap",
});

export default function DishaPage() {
  return (
    <div className={`${dishaDisplay.variable} ${dishaSans.variable} disha-page flex flex-1 flex-col`}>
      <DishaClient />
    </div>
  );
}
