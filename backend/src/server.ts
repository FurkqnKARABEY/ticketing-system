import "dotenv/config";
import express from "express";
import cors from "cors";

import ticketsRouter from "./routes/tickets.routes";
import customersRouter from "./routes/customers.routes";
import communicationsRouter from "./routes/communications.routes";
import attachmentsRouter from "./routes/attachments.routes";
import searchRouter from "./routes/search.routes";
import dashboardRouter from "./routes/dashboard.routes";
import authRouter from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";

import { requireAuth, requireAdmin } from "./middleware/auth.middleware";
import actionsRouter from "./routes/actions.routes";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Perraro Ticketing API is running",
  });
});

// Public auth routes
// Login burada açık kalmalı çünkü kullanıcı henüz token almamış olur.
app.use("/api/auth", authRouter);

// Protected application routes
// Bu API'lere erişmek için JWT token zorunlu.
app.use("/api/tickets", requireAuth, ticketsRouter);
app.use("/api/customers", requireAuth, customersRouter);
app.use("/api/communications", requireAuth, communicationsRouter);
app.use("/api/attachments", requireAuth, attachmentsRouter);
app.use("/api/search", requireAuth, searchRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/actions", requireAuth, actionsRouter);

// Admin-only routes
// Bu API'lere sadece role = admin olan kullanıcılar erişebilir.
app.use("/api/users", requireAuth, requireAdmin, usersRouter);

app.listen(PORT, () => {
  console.log(`Perraro Ticketing API is running on port ${PORT}`);
});