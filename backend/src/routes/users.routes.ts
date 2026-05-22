import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../config/supabase";
import { isValidUuid } from "../utils/validation";

const router = Router();

const allowedUserRoles = ["admin", "agent"];

router.get("/", async (_req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("app_users")
      .select(`
        id,
        full_name,
        email,
        role,
        is_active,
        created_at,
        updated_at,
        last_login_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch users",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      count: users?.length || 0,
      data: users || [],
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;

    if (!full_name || typeof full_name !== "string") {
      return res.status(400).json({
        success: false,
        message: "Full name is required",
      });
    }

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

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const normalizedRole =
      typeof role === "string" && role.trim().length > 0
        ? role.trim()
        : "agent";

    if (!allowedUserRoles.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role",
        allowedRoles: allowedUserRoles,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: existingUser, error: existingUserError } = await supabase
      .from("app_users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUserError) {
      return res.status(500).json({
        success: false,
        message: "Failed to check existing user",
        error: existingUserError.message,
      });
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: newUser, error } = await supabase
      .from("app_users")
      .insert({
        full_name: full_name.trim(),
        email: normalizedEmail,
        password_hash: passwordHash,
        role: normalizedRole,
        is_active: true,
      })
      .select(`
        id,
        full_name,
        email,
        role,
        is_active,
        created_at,
        updated_at
      `)
      .single();

    if (error || !newUser) {
      return res.status(500).json({
        success: false,
        message: "Failed to create user",
        error: error?.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: newUser,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, role, password } = req.body;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const updatePayload: {
      full_name?: string;
      role?: string;
      password_hash?: string;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (full_name !== undefined) {
      if (typeof full_name !== "string" || full_name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Full name must be a non-empty string",
        });
      }

      updatePayload.full_name = full_name.trim();
    }

    if (role !== undefined) {
      if (typeof role !== "string" || !allowedUserRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user role",
          allowedRoles: allowedUserRoles,
        });
      }

      updatePayload.role = role;
    }

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters long",
        });
      }

      updatePayload.password_hash = await bcrypt.hash(password, 10);
    }

    const fieldsToUpdate = Object.keys(updatePayload).filter(
      (key) => key !== "updated_at"
    );

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one field must be provided to update",
      });
    }

    const { data: updatedUser, error } = await supabase
      .from("app_users")
      .update(updatePayload)
      .eq("id", id)
      .select(`
        id,
        full_name,
        email,
        role,
        is_active,
        created_at,
        updated_at,
        last_login_at
      `)
      .single();

    if (error || !updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found or failed to update",
        error: error?.message,
      });
    }

    return res.json({
      success: true,
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.patch("/:id/activate", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const { data: user, error } = await supabase
      .from("app_users")
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, full_name, email, role, is_active, updated_at")
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: "User not found or failed to activate",
        error: error?.message,
      });
    }

    return res.json({
      success: true,
      message: "User activated successfully",
      data: user,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.patch("/:id/deactivate", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const { data: user, error } = await supabase
      .from("app_users")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, full_name, email, role, is_active, updated_at")
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: "User not found or failed to deactivate",
        error: error?.message,
      });
    }

    return res.json({
      success: true,
      message: "User deactivated successfully",
      data: user,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;