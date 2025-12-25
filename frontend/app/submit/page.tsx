"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { SubmitPage } from "@/components/pages/SubmitPage";

export default function SubmitPageRoute() {
  const pathname = usePathname();

  return (
    <PageTransition pathname={pathname || "/submit"}>
      <SubmitPage />
    </PageTransition>
  );
}

