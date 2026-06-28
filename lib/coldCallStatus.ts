export const COLD_CALL_STATUS_LABELS: Record<string, string> = {
  not_contacted: "Not yet called",
  called: "Called, not yet emailed",
  emailed: "Follow-up emailed",
  meeting_booked: "Meeting booked",
  contacted: "Email sent",
  followup_1_sent: "Follow-up 1 sent",
  followup_2_sent: "Follow-up 2 sent",
  followup_3_sent: "Follow-up 3 sent",
  followup_4_sent: "Follow-up 4 sent",
  replied: "Replied",
  booked: "Booked",
  no_show: "No Show",
  proposal_sent: "Proposal Sent",
  not_interested: "Not interested",
  bounced: "Bounced",
  sequence_complete: "Sequence complete",
};

export const COLD_CALL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  meeting_booked: { bg: "#dcfce7", text: "#166534" },
  booked: { bg: "#dcfce7", text: "#166534" },
  emailed: { bg: "#dbeafe", text: "#1e40af" },
  replied: { bg: "#dbeafe", text: "#1e40af" },
  no_show: { bg: "#fef3c7", text: "#92400e" },
  proposal_sent: { bg: "#ede9fe", text: "#5b21b6" },
  not_interested: { bg: "#fee2e2", text: "#991b1b" },
  bounced: { bg: "#fee2e2", text: "#991b1b" },
};
