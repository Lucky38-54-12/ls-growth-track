// Manual follow-through after the "Client signed & closed" button fires
// (lib/handoverDoc.ts, lib/clientLeadsSheet.ts, lib/googleDocs.ts's
// createClientFolder) — those three are automated and already reflected by
// the doc/folder/sheet links, so this checklist only covers what still needs
// a human to do it.
export const HANDOVER_STEPS = [
  { key: "strategy_call_booked", label: "Strategy call booked with Harris (aim: within 2 days)" },
  { key: "strategy_call_done", label: "Strategy call completed" },
  { key: "campaign_live", label: "Campaign live" },
];
