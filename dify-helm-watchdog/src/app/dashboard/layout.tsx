// The root layout locks `body { overflow: hidden }` and wraps every page in a
// fixed `h-screen` div for the app-like home page. The dashboard is a long
// document, so it needs its own scroll container to avoid being clipped.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}
