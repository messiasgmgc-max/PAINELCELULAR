"use client";

import { useZoerIframe } from "@/hooks/useZoerlframe";
import { AppUpdateNotifier } from "@/components/AppUpdateNotifier";

export default function GlobalClientEffects() {
  useZoerIframe();
  return <AppUpdateNotifier />;
}

