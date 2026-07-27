"use client";

import { Suspense } from "react";
import ConnectFlow from "./ConnectFlow";

// Generic landing page — for a client who was told to go paste in their
// link rather than clicking it directly, or who wants to start over with a
// fresh link.
export default function ConnectLandingPage() {
  return (
    <Suspense fallback={null}>
      <ConnectFlow />
    </Suspense>
  );
}
