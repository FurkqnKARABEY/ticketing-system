import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase";

type JwtPayload = {
  userId: string;
  email: string;
  role: string;
};

export type AuthenticatedUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
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

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    const { data: user, error } = await supabase
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

    (req as AuthenticatedRequest).user = user;

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;

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