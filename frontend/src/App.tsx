import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { getMe, logout } from "./api/auth";
import { clearAuthToken, getAuthToken } from "./api/client";
import { AppLayout } from "./components/AppLayout";
import { AttachmentsPage } from "./pages/AttachmentsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { SearchPage } from "./pages/SearchPage";
import { TicketsPage } from "./pages/TicketsPage";
import { UsersPage } from "./pages/UsersPage";
import type { AppUser } from "./types/auth";
import "./App.css";
import { TicketDetailPage } from "./pages/TicketDetailPage";

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const loadUser = async () => {
    const token = getAuthToken();

    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await getMe();
      setUser(response.user);
    } catch {
      clearAuthToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleLoginSuccess = () => {
    loadUser();
    navigate("/dashboard");
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    navigate("/login");
  };

  if (isLoading) {
    return <div className="loading-screen">Loading Perraro Support Desk...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route
          path="/login"
          element={<LoginPage onLoginSuccess={handleLoginSuccess} />}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout user={user} onLogout={handleLogout} />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/attachments" element={<AttachmentsPage />} />
        {user.role === "admin" && (
          <Route path="/users" element={<UsersPage />} />
        )}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;