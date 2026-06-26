export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">
        Dashboard
      </h1>

      <p className="mt-2 text-[var(--muted-foreground)]">
        Welcome back, Abelti.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="card p-6">
          <h3 className="text-sm text-[var(--muted-foreground)]">
            Stations
          </h3>
          <p className="mt-2 text-3xl font-bold">24</p>
        </div>

        <div className="card p-6">
          <h3 className="text-sm text-[var(--muted-foreground)]">
            Employees
          </h3>
          <p className="mt-2 text-3xl font-bold">152</p>
        </div>

        <div className="card p-6">
          <h3 className="text-sm text-[var(--muted-foreground)]">
            POS Machines
          </h3>
          <p className="mt-2 text-3xl font-bold">67</p>
        </div>

        <div className="card p-6">
          <h3 className="text-sm text-[var(--muted-foreground)]">
            Reports
          </h3>
          <p className="mt-2 text-3xl font-bold">342</p>
        </div>
      </div>
    </div>
  );
}