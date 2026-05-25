import { useState } from "react";
import type { FormEvent } from "react";
import { login } from "../api/auth";

type LoginPageProps = {
  onLoginSuccess: () => void;
};

export const LoginPage = ({ onLoginSuccess }: LoginPageProps) => {
  const [email, setEmail] = useState("admin@perraroelectricbike.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(email, password);
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-logo">P</div>
          <div>
            <h1>Perraro Support Desk</h1>
            <p>Secure team access for customer support operations.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && <div className="error-box">{error}</div>}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
};