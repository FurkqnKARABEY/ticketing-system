import "dotenv/config";
import bcrypt from "bcryptjs";
import { supabase } from "../config/supabase";

const resetAdminPassword = async () => {
  const email = process.env.RESET_ADMIN_EMAIL;
  const newPassword = process.env.RESET_ADMIN_PASSWORD;

  if (!email || !newPassword) {
    throw new Error("Missing RESET_ADMIN_EMAIL or RESET_ADMIN_PASSWORD in .env");
  }

  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters long");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const { data: user, error } = await supabase
    .from("app_users")
    .update({
      password_hash: passwordHash,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("email", normalizedEmail)
    .select("id, full_name, email, role, is_active, updated_at")
    .single();

  if (error || !user) {
    throw new Error(error?.message || "Admin user not found");
  }

  console.log("Admin password reset successfully:");
  console.log(user);
};

resetAdminPassword()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to reset admin password:");
    console.error(error.message);
    process.exit(1);
  });