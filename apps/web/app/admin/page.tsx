import type { Metadata } from "next";

import { AdminPage } from "./admin-page";

export const metadata: Metadata = {
  title: "Moodle Admin",
  description: "Manage Moodle Codex storage quotas.",
};

export default function Page() {
  return <AdminPage />;
}
