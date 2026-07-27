"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UsePortalLeadsOptions<T> {
  intervalMs?: number;
  // Applied to every fetch result before it lands in state — lets a page
  // (e.g. the pipeline board) protect an optimistic local edit from being
  // clobbered by a poll that raced ahead of its own PATCH.
  transform?: (leads: T[]) => T[];
  // Endpoint to poll and the response key holding the array, e.g.
  // "/api/portal/nurture" + "enrollments" for the email sequence page.
  url?: string;
  key?: string;
}

export function usePortalLeads<T = any>({ intervalMs = 15000, transform, url = "/api/portal/leads", key = "leads" }: UsePortalLeadsOptions<T> = {}) {
  const [leads, setLeads] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const fetchLeads = useCallback(async () => {
    try {
      const r = await fetch(url);
      const body = await r.json();
      if (body.error) {
        setError(body.error);
        return;
      }
      setError(null);
      const fetched: T[] = body[key] || [];
      setLeads(transformRef.current ? transformRef.current(fetched) : fetched);
    } catch {
      setError("Something went wrong loading your data.");
    } finally {
      setLoading(false);
    }
  }, [url, key]);

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchLeads();
    };
    window.addEventListener("focus", fetchLeads);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", fetchLeads);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchLeads, intervalMs]);

  return { leads, setLeads, loading, error, refetch: fetchLeads };
}
