import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

if (process.argv.includes("--help")) {
  console.log(`Usage: npm run smoke:hosted-auth

Required:
  HOSTED_AUTH_SMOKE_EMAIL
  HOSTED_SUPABASE_URL
  HOSTED_SUPABASE_SERVICE_ROLE_KEY

Optional:
  HOSTED_WEB_URL
  HOSTED_AUTH_SMOKE_ARTIFACT_DIR`);
  process.exit(0);
}

const rootDir = path.resolve(import.meta.dirname, "..");
const webUrl = normalizeUrl(
  process.env.HOSTED_WEB_URL || "https://pixelated-studio-edition.vercel.app",
);
const supabaseUrl = normalizeUrl(process.env.HOSTED_SUPABASE_URL || "");
const serviceRoleKey = process.env.HOSTED_SUPABASE_SERVICE_ROLE_KEY || "";
const email = process.env.HOSTED_AUTH_SMOKE_EMAIL || "";
const runId = `hosted-auth-${new Date().toISOString().replaceAll(":", "-")}`;
const runDir = path.resolve(
  process.env.HOSTED_AUTH_SMOKE_ARTIFACT_DIR ||
    path.join(rootDir, ".context", "hosted-auth-smoke", runId),
);
const reportPath = path.join(runDir, "hosted-auth-report.json");
const summaryPath = path.join(runDir, "failure-summary.md");
const steps = [];
const users = new Map();
let browser;
let page;

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

function required(value, name) {
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function record(name, status, detail = "") {
  steps.push({ detail, name, status, timestamp: new Date().toISOString() });
  console.log(`[${status}] ${name}${detail ? `: ${detail}` : ""}`);
}

async function step(name, action) {
  try {
    const result = await action();
    record(name, "pass");
    return result;
  } catch (error) {
    record(name, "fail", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function smokeEmail(label) {
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at).split("+", 1)[0];
  const domain = email.slice(at + 1);
  return `${local}+pixelated-auth-${label}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@${domain}`;
}

function smokePassword(label) {
  return `Pixelated-${label}-${crypto.randomBytes(8).toString("hex")}9`;
}

async function adminRequest(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin${pathname}`, {
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${options.method || "GET"} admin${pathname} returned ${response.status}: ${text}`,
    );
  }
  return payload;
}

async function generateLink({ email, password, redirectTo, type }) {
  const payload = await adminRequest(
    `/generate_link?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      body: {
        email,
        ...(password ? { password } : {}),
        type,
      },
      method: "POST",
    },
  );
  assert.equal(typeof payload?.action_link, "string");
  const returnedRedirect =
    payload.redirect_to ||
    new URL(payload.action_link).searchParams.get("redirect_to");
  assert.equal(normalizeUrl(returnedRedirect || ""), normalizeUrl(redirectTo));
  users.set(email, payload.user?.id || payload.id || users.get(email) || "");
  return payload.action_link;
}

async function findUserId(email) {
  const normalizedEmail = email.toLowerCase();
  for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
    const payload = await adminRequest(
      `/users?page=${pageNumber}&per_page=1000`,
    );
    const user = payload.users?.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail,
    );
    if (user?.id) return user.id;
    if (!payload.users || payload.users.length < 1000) return "";
  }
  return "";
}

async function deleteSmokeUsers() {
  for (const [email, knownId] of users) {
    const userId = knownId || (await findUserId(email).catch(() => ""));
    if (userId) {
      await adminRequest(`/users/${userId}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    }
  }
}

async function newPage() {
  const context = await browser.newContext();
  page = await context.newPage();
  return page;
}

async function assertHostedAuthContract() {
  const config = fs.readFileSync(
    path.join(rootDir, "supabase", "config.toml"),
    "utf8",
  );
  const authSource = fs.readFileSync(
    path.join(rootDir, "apps", "web", "src", "pages", "user", "Auth.tsx"),
    "utf8",
  );
  const resetSource = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "web",
      "src",
      "pages",
      "user",
      "ResetPassword.tsx",
    ),
    "utf8",
  );
  const confirmationTemplate = fs.readFileSync(
    path.join(rootDir, "supabase", "templates", "confirmation.html"),
    "utf8",
  );
  const recoveryTemplate = fs.readFileSync(
    path.join(rootDir, "supabase", "templates", "recovery.html"),
    "utf8",
  );

  assert.match(config, /enable_confirmations = true/);
  assert.match(config, /max_frequency = "60s"/);
  assert.match(config, /otp_expiry = 300/);
  assert.match(authSource, /emailRedirectTo: getPublicAppUrl\(\)/);
  assert.match(
    authSource,
    /redirectTo: `\$\{getPublicAppUrl\(\)\}\/reset-password`/,
  );
  assert.match(resetSource, /supabase\.auth\.updateUser/);
  assert.match(confirmationTemplate, /within 5 minutes/);
  assert.match(recoveryTemplate, /within 5 minutes/);
}

async function proveSignupVerificationAndResendCooldown(email, password) {
  users.set(email, "");
  const signupPage = await newPage();
  await signupPage.goto(`${webUrl}/login`, { waitUntil: "domcontentloaded" });
  await signupPage
    .getByRole("button", { name: "Don't have an account? Sign up" })
    .click();
  await signupPage.getByPlaceholder("Email address", { exact: true }).fill(email);
  await signupPage.getByPlaceholder("Password", { exact: true }).fill(password);
  await signupPage
    .getByPlaceholder("Confirm password", { exact: true })
    .fill(password);
  await signupPage.getByRole("button", { name: "Sign Up", exact: true }).click();
  await signupPage
    .getByText("Account created. Check your email within 5 minutes to verify it.")
    .waitFor({ timeout: 30_000 });

  const initialCooldown = signupPage.getByRole("button", {
    name: /Resend available in \d+s/,
  });
  await initialCooldown.waitFor();
  assert.equal(await initialCooldown.isDisabled(), true);
  await signupPage.screenshot({
    fullPage: true,
    path: path.join(runDir, "01-signup-verification-pending.png"),
  });

  const resend = signupPage.getByRole("button", {
    name: "Resend verification email",
  });
  await resend.waitFor({ timeout: 70_000 });
  assert.equal(await resend.isEnabled(), true);
  await signupPage.screenshot({
    fullPage: true,
    path: path.join(runDir, "02-resend-cooldown-complete.png"),
  });
}

async function redeemConfirmation(email, password) {
  const confirmationLink = await generateLink({
    email,
    password,
    redirectTo: webUrl,
    type: "signup",
  });
  const confirmationPage = await newPage();
  await confirmationPage.goto(confirmationLink, {
    waitUntil: "domcontentloaded",
  });
  await confirmationPage.waitForURL(
    (url) => url.origin === new URL(webUrl).origin && url.pathname === "/",
    { timeout: 30_000 },
  );
  await confirmationPage.waitForFunction(
    () =>
      Object.entries(window.localStorage).some(
        ([key, value]) =>
          key.startsWith("sb-") &&
          key.endsWith("-auth-token") &&
          value.includes("access_token"),
      ),
    null,
    { timeout: 30_000 },
  );
  await confirmationPage.screenshot({
    fullPage: true,
    path: path.join(runDir, "03-signup-confirmed.png"),
  });
}

async function redeemRecovery(email, newPassword) {
  const recoveryLink = await generateLink({
    email,
    redirectTo: `${webUrl}/reset-password`,
    type: "recovery",
  });
  const recoveryPage = await newPage();
  await recoveryPage.goto(recoveryLink, { waitUntil: "domcontentloaded" });
  await recoveryPage.waitForURL(
    (url) =>
      url.origin === new URL(webUrl).origin &&
      url.pathname === "/reset-password",
    { timeout: 30_000 },
  );
  await recoveryPage
    .getByRole("heading", { name: "Create New Password", exact: true })
    .waitFor();
  await recoveryPage
    .getByPlaceholder("New Password", { exact: true })
    .fill(newPassword);
  await recoveryPage
    .getByPlaceholder("Confirm New Password", { exact: true })
    .fill(newPassword);
  await recoveryPage
    .getByRole("button", { name: "Update Password", exact: true })
    .click();
  await recoveryPage
    .getByRole("heading", { name: "Password Updated", exact: true })
    .waitFor();
  await recoveryPage.screenshot({
    fullPage: true,
    path: path.join(runDir, "04-password-updated.png"),
  });

  const loginPage = await newPage();
  await loginPage.goto(`${webUrl}/login`, { waitUntil: "domcontentloaded" });
  await loginPage.getByPlaceholder("Email address", { exact: true }).fill(email);
  await loginPage
    .getByPlaceholder("Password", { exact: true })
    .fill(newPassword);
  await loginPage.getByRole("button", { name: "Sign In", exact: true }).click();
  await loginPage.waitForURL(
    (url) => url.origin === new URL(webUrl).origin && url.pathname === "/",
    { timeout: 30_000 },
  );
}

async function main() {
  fs.mkdirSync(runDir, { recursive: true });
  required(email, "HOSTED_AUTH_SMOKE_EMAIL");
  assert.match(email, /^[^@\s]+@[^@\s]+$/, "Invalid hosted auth smoke email.");
  required(supabaseUrl, "HOSTED_SUPABASE_URL");
  required(serviceRoleKey, "HOSTED_SUPABASE_SERVICE_ROLE_KEY");

  await step("verify June 11 auth contract in repository", assertHostedAuthContract);
  browser = await chromium.launch({ headless: true });

  const pendingEmail = smokeEmail("pending");
  const verifiedEmail = smokeEmail("verified");
  const initialPassword = smokePassword("initial");
  const newPassword = smokePassword("updated");

  await step("prove hosted signup verification and resend cooldown", () =>
    proveSignupVerificationAndResendCooldown(pendingEmail, initialPassword),
  );
  await step("redeem hosted signup verification redirect", () =>
    redeemConfirmation(verifiedEmail, initialPassword),
  );
  await step("redeem hosted password recovery redirect and update password", () =>
    redeemRecovery(verifiedEmail, newPassword),
  );
  return {};
}

let failure = null;
let result = {};
try {
  result = await main();
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  console.error(`Hosted auth smoke failed: ${failure.message}`);
  if (page) {
    await page
      .screenshot({ fullPage: true, path: path.join(runDir, "failure.png") })
      .catch(() => undefined);
  }
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await deleteSmokeUsers().catch(() => undefined);
  fs.mkdirSync(runDir, { recursive: true });
  writeJson(reportPath, {
    failure: failure?.message || null,
    finishedAt: new Date().toISOString(),
    result,
    runId,
    steps,
    supabaseUrl,
    webUrl,
  });
  fs.writeFileSync(
    summaryPath,
    [
      `# Hosted Auth Smoke ${failure ? "Failed" : "Passed"}`,
      "",
      `- Web: ${webUrl}`,
      `- Supabase: ${supabaseUrl}`,
      `- Result: ${failure ? failure.message : "All checks passed."}`,
      "",
      "## Checks",
      ...steps.map(
        ({ detail, name, status }) =>
          `- [${status === "pass" ? "x" : " "}] ${name}${detail ? `: ${detail}` : ""}`,
      ),
      "",
    ].join("\n"),
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, fs.readFileSync(summaryPath));
  }
  console.log(`Hosted auth smoke bundle: ${runDir}`);
}
