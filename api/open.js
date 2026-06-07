const { logEvent } = require("./_supabase");

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64"
);

module.exports = async (req, res) => {
  const leadId = typeof req.query.id === "string" ? req.query.id : null;

  try {
    await logEvent({ leadId, eventType: "open" });
  } catch (err) {
    console.error("open tracking failed:", err);
  }

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.status(200).send(PIXEL);
};
