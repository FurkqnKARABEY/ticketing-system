"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase_1 = require("../config/supabase");
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({
                success: false,
                message: "Authorization token is required",
            });
            return;
        }
        const token = authHeader.split(" ")[1];
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            res.status(500).json({
                success: false,
                message: "JWT secret is not configured",
            });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        const { data: user, error } = await supabase_1.supabase
            .from("app_users")
            .select("id, full_name, email, role, is_active")
            .eq("id", decoded.userId)
            .single();
        if (error || !user || !user.is_active) {
            res.status(401).json({
                success: false,
                message: "Invalid or inactive user",
            });
            return;
        }
        req.user = user;
        next();
    }
    catch {
        res.status(401).json({
            success: false,
            message: "Invalid or expired token",
        });
    }
};
exports.requireAuth = requireAuth;
const requireAdmin = (req, res, next) => {
    const authReq = req;
    if (!authReq.user) {
        res.status(401).json({
            success: false,
            message: "Authentication is required",
        });
        return;
    }
    if (authReq.user.role !== "admin") {
        res.status(403).json({
            success: false,
            message: "Admin access is required",
        });
        return;
    }
    next();
};
exports.requireAdmin = requireAdmin;
