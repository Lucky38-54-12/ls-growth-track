"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import ConnectFlow from "../ConnectFlow";

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectPageInner />
    </Suspense>
  );
}

function ConnectPageInner() {
  const { clientId } = useParams<{ clientId: string }>();
  return <ConnectFlow routeClientId={clientId} />;
}
