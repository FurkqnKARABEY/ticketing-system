"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const tickets_routes_1 = __importDefault(require("./routes/tickets.routes"));
const customers_routes_1 = __importDefault(require("./routes/customers.routes"));
const communications_routes_1 = __importDefault(require("./routes/communications.routes"));
const attachments_routes_1 = __importDefault(require("./routes/attachments.routes"));
const search_routes_1 = __importDefault(require("./routes/search.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const users_routes_1 = __importDefault(require("./routes/users.routes"));
const actions_routes_1 = __importDefault(require("./routes/actions.routes"));
const openphone_routes_1 = __importDefault(require("./routes/openphone.routes"));
const auth_middleware_1 = require("./middleware/auth.middleware");
const records_routes_1 = __importDefault(require("./routes/records.routes"));
const intake_routes_1 = __importDefault(require("./routes/intake.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, helmet_1.default)());
app.use((0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please try again later.",
    },
}));
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : ["http://localhost:5173", "http://localhost:3000"];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: "25mb" }));
app.get("/", (_req, res) => {
    res.json({
        success: true,
        message: "Support Desk API is running",
    });
});
// Public auth routes
app.use("/api/auth", auth_routes_1.default);
app.use("/api/intake", intake_routes_1.default);
// Protected application routes
app.use("/api/records", auth_middleware_1.requireAuth, records_routes_1.default);
app.use("/api/tickets", auth_middleware_1.requireAuth, tickets_routes_1.default);
app.use("/api/customers", auth_middleware_1.requireAuth, customers_routes_1.default);
app.use("/api/communications", auth_middleware_1.requireAuth, communications_routes_1.default);
app.use("/api/attachments", auth_middleware_1.requireAuth, attachments_routes_1.default);
app.use("/api/search", auth_middleware_1.requireAuth, search_routes_1.default);
app.use("/api/dashboard", auth_middleware_1.requireAuth, dashboard_routes_1.default);
app.use("/api/actions", auth_middleware_1.requireAuth, actions_routes_1.default);
app.use("/api/openphone", auth_middleware_1.requireAuth, openphone_routes_1.default);
// Admin-only routes
app.use("/api/users", auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, users_routes_1.default);
app.listen(PORT, () => {
    console.log(`Support Desk API is running on port ${PORT}`);
});
