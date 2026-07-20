export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#f4f6f9", minHeight: "100vh", color: "#0f172a" }}>
      {children}
    </div>
  );
}
