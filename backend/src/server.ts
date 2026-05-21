import "dotenv/config";
import express from "express";
import cors from "cors";
import ticketsRouter from "./routes/tickets.routes";
import customersRouter from "./routes/customers.routes";
import communicationsRouter from "./routes/communications.routes";
import attachmentsRouter from "./routes/attachments.routes";
import searchRouter from "./routes/search.routes";
import dashboardRouter from "./routes/dashboard.routes";
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

app.use("/api/tickets", ticketsRouter);

app.use("/api/customers", customersRouter);
app.use("/api/communications", communicationsRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/search", searchRouter);
app.use("/api/dashboard", dashboardRouter);

app.listen(PORT, () => {
  console.log(`Perraro Ticketing API is running on port ${PORT}`);
});