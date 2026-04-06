import bcrypt from "bcryptjs";

const DEFAULT_SALT_ROUNDS = 10;

export async function hashPassword(plainTextPassword) {
  const value = String(plainTextPassword ?? "");
  if (!value.trim()) {
    throw new Error("Password is required");
  }

  const saltRounds = Number(process.env.USER_MASTER_BCRYPT_ROUNDS || DEFAULT_SALT_ROUNDS);
  return bcrypt.hash(value, Number.isFinite(saltRounds) ? saltRounds : DEFAULT_SALT_ROUNDS);
}

export async function verifyPasswordHash(plainTextPassword, passwordHash) {
  const plain = String(plainTextPassword ?? "");
  const hash = String(passwordHash ?? "").trim();

  if (!plain || !hash) {
    return false;
  }

  // Enforce bcrypt-based password_hash verification for consistency.
  if (!hash.startsWith("$2a$") && !hash.startsWith("$2b$") && !hash.startsWith("$2y$")) {
    return false;
  }

  return bcrypt.compare(plain, hash);
}
