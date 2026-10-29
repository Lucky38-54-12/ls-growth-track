"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import ReviewFlow from "./ReviewFlow";

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewPageInner />
    </Suspense>
  );
}

function ReviewPageInner() {
  const { slug } = useParams<{ slug: string }>();
  return <ReviewFlow slug={slug} />;
}
