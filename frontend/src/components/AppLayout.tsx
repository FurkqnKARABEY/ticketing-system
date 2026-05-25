import { NavLink, Outlet } from "react-router-dom";
import type { AppUser } from "../types/auth";

type AppLayoutProps = {
  user: AppUser;
  onLogout: () => void;
};

export const AppLayout = ({ user, onLogout }: AppLayoutProps) => {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">P</div>
          <div>
            <strong>Perraro</strong>
            <span>Support Desk</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/tickets">Tickets</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/attachments">Attachments</NavLink>
          {user.role === "admin" && <NavLink to="/users">Users</NavLink>}
        </nav>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <h1>Perraro Support Desk</h1>
            <p>Customer support operations dashboard</p>
          </div>

          <div className="user-box">
            <span>{user.role}</span>
            <button onClick={onLogout}>Logout</button>
          </div>
        </header>

        <Outlet />
      </section>
    </main>
  );
};