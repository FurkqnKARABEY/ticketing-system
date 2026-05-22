import "dotenv/config";
import bcrypt from "bcryptjs";
import { supabase } from "../config/supabase";

const createAdminUser = async () => {
  const fullName = process.env.ADMIN_FULL_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!fullName || !email || !password) {
    throw new Error(
      "Missing ADMIN_FULL_NAME, ADMIN_EMAIL, or ADMIN_PASSWORD in .env"
    );
  }

  if (password.length < 8) {
    throw new Error("Admin password must be at least 8 characters long");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data: existingUser, error: existingUserError } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingUserError) {
    throw new Error(existingUserError.message);
  }

  if (existingUser) {
    console.log(`Admin user already exists: ${existingUser.email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from("app_users")
    .insert({
      full_name: fullName.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      role: "admin",
      is_active: true,
    })
    .select("id, full_name, email, role, is_active, created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log("Admin user created successfully:");
  console.log(user);
};

createAdminUser()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to create admin user:");
    console.error(error.message);
    process.exit(1);
  });