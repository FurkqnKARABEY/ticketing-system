"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase_1 = require("../config/supabase");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || typeof email !== "string") {
            return res.status(400).json({
                success: false,
                message: "Email is required",
            });
        }
        if (!password || typeof password !== "string") {
            return res.status(400).json({
                success: false,
                message: "Password is required",
            });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const { data: user, error } = await supabase_1.supabase
            .from("app_users")
            .select(`
        id,
        full_name,
        email,
        password_hash,
        role,
        is_active
      `)
            .eq("email", normalizedEmail)
            .single();
        if (error || !user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "User account is inactive",
            });
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({
                success: false,
                message: "JWT secret is not configured",
            });
        }
        const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ||
            "8h");
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            email: user.email,
            role: user.role,
        }, jwtSecret, {
            expiresIn: jwtExpiresIn,
        });
        await supabase_1.supabase
            .from("app_users")
            .update({
            last_login_at: new Date().toISOString(),
        })
            .eq("id", user.id);
        return res.json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                is_active: user.is_active,
            },
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
        });
    }
});
router.get("/me", auth_middleware_1.requireAuth, (req, res) => {
    const authReq = req;
    return res.json({
        success: true,
        user: authReq.user,
    });
});
exports.default = router;
