import type { Metadata } from "next";
import DishaClient from "./DishaClient";

export const metadata: Metadata = {
  title: "Disha — What should I learn next?",
  description: "A free, personal learning path for self-directed learners in Bhopal.",
};

export default function DishaPage() {
  return <DishaClient />;
}
