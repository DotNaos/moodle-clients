import { notFound } from "next/navigation";

import { MockDashboardPage } from "@/components/mock-dashboard-page";

export default function DevMockPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <MockDashboardPage />;
}
