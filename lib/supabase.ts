import { createClient, PostgrestError } from "@supabase/supabase-js";

export function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      // supabase-js calls PostgREST via fetch, and Next.js on Vercel patches
      // global fetch to cache/dedupe by default — force every Supabase
      // request to actually hit the database, not a stale Next.js Data
      // Cache entry, regardless of what a given route's own config says.
      global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
    }
  );
}

// Supabase caps a plain select at 1000 rows. The leads table now regularly
// exceeds that (auto-prospecting adds hundreds a day), so any unpaginated
// query silently drops rows — pass a query-builder factory (so each page can
// re-apply the same filters/order with a fresh .range()) to fetch everything.
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
