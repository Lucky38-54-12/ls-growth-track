export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", color: "#0f172a" }}>
      {children}
    </div>
  );
}
