"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { DecryptPage } from "@/components/pages/DecryptPage";

export default function DecryptPageRoute() {
  const pathname = usePathname();

  return (
    <PageTransition pathname={pathname || "/decrypt"}>
      <DecryptPage />
    </PageTransition>
  );
}

