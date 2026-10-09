#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { normalizePassCode } from "../src/shared/utils/feedback-pass.mjs";

export function parsePassOptions(args, env = process.env) {
  const options = {};
  const known = new Set(["code", "months", "max-uses", "expires", "note"]);
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === "--dry-run") { options.dryRun = true; continue; }
    const key = flag?.startsWith("--") ? flag.slice(2) : "";
    if (!known.has(key) || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error(`Invalid or missing option: ${flag}`);
    }
    options[key] = args[++i];
  }
  const code = normalizePassCode(options.code);
  if (!code || ["SIGNIN", "REDEEM"].includes(code)) throw new Error("--code must be 1–64 letters, numbers, hyphens or underscores (not SIGNIN or REDEEM)");
  const parseInteger = (value, fallback, max, label) => {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) throw new Error(`${label} must be a positive integer`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new Error(`${label} must be between 1 and ${max}`);
    return number;
  };
  const months = parseInteger(options.months, 3, 120, "--months");
  const maxUses = parseInteger(options["max-uses"], 100, 1_000_000, "--max-uses");
  const expiresAt = options.expires ? new Date(options.expires) : null;
  if (expiresAt && !Number.isFinite(expiresAt.getTime())) throw new Error("--expires must be a valid date");
  const base = new URL(env.NEXT_PUBLIC_APP_URL || env.NEXTAUTH_URL || "http://localhost:3000");
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) throw new Error("App URL must be an HTTP(S) URL without credentials");
  return { dryRun: options.dryRun === true, data: { code, months, maxUses, expiresAt, note: options.note || null }, link: new URL(`/pass/${code}`, base.origin).toString() };
}

export async function createFeedbackPass(args, { db, env = process.env, output = console.log } = {}) {
  const options = parsePassOptions(args, env);
  if (!options.dryRun) {
    if (!db) throw new Error("A database client is required");
    await db.feedbackPass.create({ data: options.data });
  }
  output(options.link);
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let db;
  try {
    const args = process.argv.slice(2);
    const options = parsePassOptions(args);
    if (!options.dryRun) {
      const { PrismaClient } = await import("@prisma/client");
      db = new PrismaClient();
    }
    await createFeedbackPass(args, { db });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db?.$disconnect();
  }
}
