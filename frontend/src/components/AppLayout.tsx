import { NavLink, Outlet } from "react-router-dom";
import type { AppUser } from "../types/auth";
import sidebarLogo from "../assets/supportdesk-logo.jpg";

type AppLayoutProps = {
  user: AppUser;
  onLogout: () => void;
};

export const AppLayout = ({ user, onLogout }: AppLayoutProps) => {
  return (
    <main className="app-shell">
      <aside className="sidebar">
          <div className="sidebar-brand">
            <img className="sidebar-logo" src={sidebarLogo} alt="Support Desk" />
            <div>
            <strong>Support Desk</strong>
            <span>Workspace</span>
            </div>
          </div>

        <nav className="sidebar-nav">
         <NavLink to="/dashboard">Dashboard</NavLink>
         <NavLink to="/tickets">Tickets</NavLink>
         <NavLink to="/openphone-records">OpenPhone Records</NavLink>
         <NavLink to="/email-records">Email Records</NavLink>
         <NavLink to="/customers">Customers</NavLink>
         <NavLink to="/search">Search</NavLink>
         <NavLink to="/attachments">Attachments</NavLink>
         {user.role === "admin" && <NavLink to="/users">Users</NavLink>}
        </nav>
      </aside>

      <section className="main-panel">
        <header className="topbar">
        <div>
          <h1>Support Desk</h1>
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
