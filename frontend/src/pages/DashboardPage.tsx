import { useEffect, useState } from "react";
import { getDashboardStats } from "../api/dashboard";
import type { DashboardStats } from "../types/dashboard";

export const DashboardPage = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState("");

  const loadStats = async () => {
    setIsLoadingStats(true);
    setStatsError("");

    try {
      const response = await getDashboardStats();
      setStats(response.data);
    } catch (error) {
      setStatsError(
        error instanceof Error ? error.message : "Failed to load dashboard stats"
      );
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const displayValue = (value?: number) => {
    if (isLoadingStats) return "Loading...";
    if (typeof value !== "number") return "—";
    return value.toLocaleString();
  };

  return (
    <>
      <section className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Live overview of Perraro support operations.</p>
        </div>
      </section>

      {statsError && (
        <div className="error-box dashboard-error">
          {statsError}
          <button onClick={loadStats}>Retry</button>
        </div>
      )}

      <section className="dashboard-grid">
        <div className="stat-card">
          <span>Total Tickets</span>
          <strong>{displayValue(stats?.tickets.total)}</strong>
        </div>

        <div className="stat-card">
          <span>New Tickets</span>
          <strong>{displayValue(stats?.tickets.new)}</strong>
        </div>

        <div className="stat-card">
          <span>Open Tickets</span>
          <strong>{displayValue(stats?.tickets.open)}</strong>
        </div>

        <div className="stat-card">
          <span>High Priority</span>
          <strong>{displayValue(stats?.priority.high)}</strong>
        </div>

        <div className="stat-card">
          <span>Urgent</span>
          <strong>{displayValue(stats?.priority.urgent)}</strong>
        </div>

        <div className="stat-card">
          <span>Customers</span>
          <strong>{displayValue(stats?.customers.total)}</strong>
        </div>

        <div className="stat-card">
          <span>Communications</span>
          <strong>{displayValue(stats?.communications.total)}</strong>
        </div>

        <div className="stat-card">
          <span>Attachments</span>
          <strong>{displayValue(stats?.attachments.total)}</strong>
        </div>
      </section>
    </>
  );
};