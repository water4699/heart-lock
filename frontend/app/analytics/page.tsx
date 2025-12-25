"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { AnalyticsPage } from "@/components/pages/AnalyticsPage";

export default function AnalyticsPageRoute() {
  const pathname = usePathname();

  return (
    <PageTransition pathname={pathname || "/analytics"}>
      <AnalyticsPage />
    </PageTransition>
  );
}

