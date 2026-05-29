import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import ticketsRouter from "./routes/tickets.routes";
import customersRouter from "./routes/customers.routes";
import communicationsRouter from "./routes/communications.routes";
import attachmentsRouter from "./routes/attachments.routes";
import searchRouter from "./routes/search.routes";
import dashboardRouter from "./routes/dashboard.routes";
import authRouter from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";
import actionsRouter from "./routes/actions.routes";
import openphoneRouter from "./routes/openphone.routes";

import { requireAuth, requireAdmin } from "./middleware/auth.middleware";
import recordsRouter from "./routes/records.routes";
import intakeRouter from "./routes/intake.routes";

const app = express();
const PORT = process.env.PORT || 3001;

app.set("trust proxy", 1);

app.use(helmet());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  })
);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "25mb" }));

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Support Desk API is running",
  });
});

// Public auth routes
app.use("/api/auth", authRouter);
app.use("/api/intake", intakeRouter);

// Protected application routes
app.use("/api/records", requireAuth, recordsRouter);
app.use("/api/tickets", requireAuth, ticketsRouter);
app.use("/api/customers", requireAuth, customersRouter);
app.use("/api/communications", requireAuth, communicationsRouter);
app.use("/api/attachments", requireAuth, attachmentsRouter);
app.use("/api/search", requireAuth, searchRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/actions", requireAuth, actionsRouter);
app.use("/api/openphone", requireAuth, openphoneRouter);

// Admin-only routes
app.use("/api/users", requireAuth, requireAdmin, usersRouter);

app.listen(PORT, () => {
  console.log(`Support Desk API is running on port ${PORT}`);
});
