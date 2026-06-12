export const dynamic = "force-static";

export default function CleaningResults() {
  return (
    <div
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        maxWidth: 900,
        margin: "40px auto",
        padding: "0 16px",
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Queenstown Cleaning, last 30 days</h1>
      <p style={{ color: "#64748b", fontSize: 14, marginTop: 0, marginBottom: 24 }}>
        57 new window cleaning and house cleaning leads, 30 of which turned into booked jobs.
      </p>
      <img
        src="/results/queenstown-ads.png"
        alt="Queenstown Cleaning ad results, last 30 days"
        style={{ maxWidth: "100%", border: "1px solid #e2e8f0", borderRadius: 6 }}
      />

      <div style={{ marginTop: 40, paddingTop: 32, borderTop: "1px solid #e2e8f0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Trusted beyond one business</h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 640 }}>
          Queenstown Cleaning's owner liked the results enough that he brought us
          on for two more of his cleaning businesses, Jim's Cleaning and Fantastic
          Services. For both, we built everything from scratch, the website,
          social media, ad campaigns and email systems, the same setup shown
          above.
        </p>
      </div>

      <div style={{ marginTop: 32 }}>
        <a
          href="https://lsgrowth.agency/book"
          style={{
            display: "inline-block",
            background: "#0f172a",
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Book a quick 15 min chat
        </a>
      </div>
    </div>
  );
}
