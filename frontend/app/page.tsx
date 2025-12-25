"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { DashboardPage } from "@/components/pages/DashboardPage";

export default function Home() {
  const pathname = usePathname();

  return (
    <PageTransition pathname={pathname || "/"}>
      <DashboardPage />
    </PageTransition>
  );
}
