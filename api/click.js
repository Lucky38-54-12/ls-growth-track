const { logEvent } = require("./_supabase");

const FALLBACK_URL = "https://lsgrowth.co.nz";

function isSafeUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  const leadId = typeof req.query.id === "string" ? req.query.id : null;
  const target = typeof req.query.url === "string" ? req.query.url : "";
  const destination = isSafeUrl(target) ? target : FALLBACK_URL;

  try {
    await logEvent({ leadId, eventType: "click", url: destination });
  } catch (err) {
    console.error("click tracking failed:", err);
  }

  res.writeHead(302, { Location: destination });
  res.end();
};
