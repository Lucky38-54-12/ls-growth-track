export const dynamic = "force-static";

export default function QueenstownResults() {
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
    </div>
  );
}
