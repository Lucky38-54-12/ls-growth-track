// Reads Anthropic's official Usage & Cost Admin API to answer "which API key
// is spending what" inside the dashboard, instead of Lucky having to go dig
// through platform.claude.com/cost by hand.
//
// The Cost API (/cost_report) gives exact $ amounts but can only group by
// workspace or description — there is no per-API-key grouping. The Usage API
// (/usage_report/messages) gives exact token counts grouped by api_key_id,
// but no dollar amounts. Neither endpoint alone answers "$ per key", so this
// reconciles them: for each (day, model, token_type) bucket, take the real
// dollar amount from the Cost API and split it across keys in proportion to
// each key's share of that bucket's tokens from the Usage API. Web search
// cost (not tied to a model) is split the same way using each key's share of
// that day's web_search_requests. This tracks Anthropic's actual billing
// exactly in total, with no pricing table of our own to keep in sync.
const ADMIN_BASE = "https://api.anthropic.com/v1/organizations";
const ANTHROPIC_VERSION = "2023-06-01";

function adminKey(): string {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) throw new Error("ANTHROPIC_ADMIN_KEY env var is not set");
  return key;
}

async function adminGet<T>(path: string, params: Record<string, string | string[]>): Promise<T> {
  const url = new URL(`${ADMIN_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(`${key}[]`, v);
    } else {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { "anthropic-version": ANTHROPIC_VERSION, "x-api-key": adminKey() },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic admin API ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

export interface ApiKeyInfo {
  id: string;
  name: string;
}

export async function listApiKeys(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  let page: string | undefined;
  for (let i = 0; i < 10; i++) {
    const data = await adminGet<{ data: { id: string; name: string }[]; has_more: boolean; next_page: string | null }>(
      "/api_keys",
      page ? { page } : {}
    );
    for (const k of data.data) names.set(k.id, k.name);
    if (!data.has_more || !data.next_page) break;
    page = data.next_page;
  }
  return names;
}

interface CostResultRow {
  amount: string;
  cost_type: "code_execution" | "session_usage" | "tokens" | "web_search" | null;
  model: string | null;
  token_type: string | null;
}
interface CostBucket {
  starting_at: string;
  results: CostResultRow[];
}

async function getCostReport(startingAt: string, endingAt: string): Promise<CostBucket[]> {
  const buckets: CostBucket[] = [];
  let page: string | undefined;
  for (let i = 0; i < 10; i++) {
    const data = await adminGet<{ data: CostBucket[]; has_more: boolean; next_page: string | null }>("/cost_report", {
      starting_at: startingAt,
      ending_at: endingAt,
      bucket_width: "1d",
      "group_by": ["description"],
      ...(page ? { page } : {}),
    });
    buckets.push(...data.data);
    if (!data.has_more || !data.next_page) break;
    page = data.next_page;
  }
  return buckets;
}

interface UsageResultRow {
  api_key_id: string | null;
  model: string | null;
  uncached_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation: { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number };
  output_tokens: number;
  server_tool_use: { web_search_requests: number };
}
interface UsageBucket {
  starting_at: string;
  results: UsageResultRow[];
}

async function getUsageByKey(startingAt: string, endingAt: string): Promise<UsageBucket[]> {
  const buckets: UsageBucket[] = [];
  let page: string | undefined;
  for (let i = 0; i < 20; i++) {
    const data = await adminGet<{ data: UsageBucket[]; has_more: boolean; next_page: string | null }>("/usage_report/messages", {
      starting_at: startingAt,
      ending_at: endingAt,
      bucket_width: "1d",
      limit: "31",
      "group_by": ["api_key_id", "model"],
      ...(page ? { page } : {}),
    });
    buckets.push(...data.data);
    if (!data.has_more || !data.next_page) break;
    page = data.next_page;
  }
  return buckets;
}

export interface DailyKeyCost {
  date: string; // YYYY-MM-DD
  byKey: Record<string, number>; // keyLabel -> $ for that day
  total: number;
}

export interface KeyUsageReport {
  days: DailyKeyCost[];
  totalsByKey: { label: string; total: number }[];
  grandTotal: number;
  unattributedTotal: number; // Console/Workbench usage with no api_key_id, or costs we couldn't match to a usage bucket
}

// A cost row's token_type value uses dotted paths for cache creation
// ("cache_creation.ephemeral_5m_input_tokens") — this pulls the matching
// count out of a usage row's nested shape for that exact token_type string.
function tokensForType(usage: UsageResultRow, tokenType: string): number {
  switch (tokenType) {
    case "uncached_input_tokens": return usage.uncached_input_tokens;
    case "cache_read_input_tokens": return usage.cache_read_input_tokens;
    case "cache_creation.ephemeral_1h_input_tokens": return usage.cache_creation?.ephemeral_1h_input_tokens || 0;
    case "cache_creation.ephemeral_5m_input_tokens": return usage.cache_creation?.ephemeral_5m_input_tokens || 0;
    case "output_tokens": return usage.output_tokens;
    default: return 0;
  }
}

export async function buildKeyUsageReport(daysBack: number): Promise<KeyUsageReport> {
  const endingAt = new Date();
  endingAt.setUTCHours(0, 0, 0, 0);
  const startingAt = new Date(endingAt.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const [costBuckets, usageBuckets, keyNames] = await Promise.all([
    getCostReport(startingAt.toISOString(), endingAt.toISOString()),
    getUsageByKey(startingAt.toISOString(), endingAt.toISOString()),
    listApiKeys().catch(() => new Map<string, string>()),
  ]);

  const usageByDate = new Map<string, UsageResultRow[]>();
  for (const bucket of usageBuckets) {
    const date = bucket.starting_at.slice(0, 10);
    usageByDate.set(date, bucket.results);
  }

  const labelFor = (apiKeyId: string | null): string => {
    if (!apiKeyId) return "Console / Workbench";
    return keyNames.get(apiKeyId) || apiKeyId;
  };

  const days: DailyKeyCost[] = [];
  let unattributedTotal = 0;

  for (const bucket of costBuckets) {
    const date = bucket.starting_at.slice(0, 10);
    const usageRows = usageByDate.get(date) || [];
    const byKey: Record<string, number> = {};
    let dayTotal = 0;

    for (const row of bucket.results) {
      const amount = parseFloat(row.amount) / 100; // amount is in cents
      dayTotal += amount;

      if (row.cost_type === "tokens" && row.model && row.token_type) {
        const matching = usageRows.filter((u) => u.model === row.model);
        const totalTokens = matching.reduce((sum, u) => sum + tokensForType(u, row.token_type!), 0);
        if (totalTokens > 0) {
          for (const u of matching) {
            const share = tokensForType(u, row.token_type!) / totalTokens;
            if (share <= 0) continue;
            const label = labelFor(u.api_key_id);
            byKey[label] = (byKey[label] || 0) + amount * share;
          }
          continue;
        }
      }

      if (row.cost_type === "web_search") {
        const totalSearches = usageRows.reduce((sum, u) => sum + (u.server_tool_use?.web_search_requests || 0), 0);
        if (totalSearches > 0) {
          for (const u of usageRows) {
            const requests = u.server_tool_use?.web_search_requests || 0;
            if (requests <= 0) continue;
            const label = labelFor(u.api_key_id);
            byKey[label] = (byKey[label] || 0) + amount * (requests / totalSearches);
          }
          continue;
        }
      }

      // Couldn't attribute this slice to any key (no matching usage rows,
      // e.g. code execution/session costs we don't split, or a rounding
      // edge case) — keep it out of any key's total but still counted in
      // the grand total, surfaced separately so the numbers still add up.
      unattributedTotal += amount;
    }

    days.push({ date, byKey, total: dayTotal });
  }

  const totalsMap = new Map<string, number>();
  let grandTotal = 0;
  for (const day of days) {
    grandTotal += day.total;
    for (const [label, amount] of Object.entries(day.byKey)) {
      totalsMap.set(label, (totalsMap.get(label) || 0) + amount);
    }
  }
  const totalsByKey = Array.from(totalsMap.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);

  return { days, totalsByKey, grandTotal, unattributedTotal };
}
