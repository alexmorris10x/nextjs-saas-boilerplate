"use client";

import { useEffect } from "react";
import { initPosthog } from "../../../instrumentation-client";

export default function ErrorTrackingProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => { initPosthog(); }, []);
  return <>{children}</>;
}
