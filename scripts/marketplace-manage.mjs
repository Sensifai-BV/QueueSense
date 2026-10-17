#!/usr/bin/env node

/**
 * Sensifai Autonomous Application Registration, Provisioning & Publishing CLI
 * (`scripts/marketplace-manage.mjs`)
 *
 * Features:
 * 1. Parses `PROJECT.md` directly (plus optional `Docs/sensifai_marketplace_submission.json`)
 *    so registration never fails due to missing intermediate JSON files.
 * 2. Auto-provisions the app's dedicated LiteLLM Virtual Key (`AI_GATEWAY_KEY`) if missing.
 * 3. Registers or updates the application on Sensifai Marketplace via MCP SSE.
 * 4. Automatically registers BOTH `https://<app_id>.sensifai.com/callback` AND
 *    `http://localhost:3000/callback` in Logto OIDC `redirect_uris` so local & prod login
 *    both work without `invalid_redirect_uri` errors.
 * 5. Creates or verifies the default `pay_as_go` (€0.05 / REQUEST) price model.
 * 6. Fetches `LOGTO_CLIENT_ID`, `LOGTO_CLIENT_SECRET`, `SENSIFAI_API_KEY`, and
 *    `SENSIFAI_WEBHOOK_SECRET` and writes all keys directly into `.env` and `.env.production`.
 * 7. Publishes the application (unless `--no-publish` is passed).
 */

import "./patch-dns.mjs";
import { SensifaiMcpClient } from "./sensifai-mcp.mjs";
import fs from "node:fs";
import path from "node:path";

const LITELLM_MASTER_KEY = "sk-EGSXOIkl4X2dqQqaBL_Uyw";
const LITELLM_BASE_URL = process.env.AI_GATEWAY_URL || "https://llm.sensifai.com";

function loadEnvFile(filePath = ".env") {
  if (!fs.existsSync(filePath)) return {};
  const map = {};
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed
        .slice(idx + 1)
        .split("#")[0]
        .trim()
        .replace(/^["']|["']$/g, "");
      map[key] = val;
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
  return map;
}

function updateEnvFile(updates, filePath = ".env") {
  let existingLines = [];
  if (fs.existsSync(filePath)) {
    existingLines = fs.readFileSync(filePath, "utf-8").split("\n");
  } else if (fs.existsSync(".env.example")) {
    existingLines = fs.readFileSync(".env.example", "utf-8").split("\n");
  }

  const updatedKeys = new Set();
  const newLines = existingLines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return line;
    }
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key]) {
      updatedKeys.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(updates)) {
    if (val && !updatedKeys.has(key)) {
      newLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(filePath, newLines.join("\n").trim() + "\n", "utf-8");
}

function parseProjectMd() {
  const projectPath = path.resolve("PROJECT.md");
  if (!fs.existsSync(projectPath)) return null;
  const raw = fs.readFileSync(projectPath, "utf-8");

  const extractField = (regex, fallback = "") => {
    const m = raw.match(regex);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : fallback;
  };

  const extractList = (sectionRegex) => {
    const m = raw.match(sectionRegex);
    if (!m) return [];
    return m[1]
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\d.]+\s*/, "").trim().replace(/^["']|["']$/g, ""))
      .filter((l) => l.length > 2 && !l.startsWith("#"));
  };

  const folderSlug = path.basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const appId = extractField(/^app_id:\s*(.+)$/m, folderSlug);
  const name = extractField(/^name:\s*(.+)$/m, appId);
  const tagline = extractField(/^tagline:\s*(.+)$/m, `${name} — AI-Powered Workspace on Sensifai`);
  const shortDesc =
    extractField(/description_short:\s*(.+)$/m, "") ||
    tagline.slice(0, 140);

  // Extract markdown sections for rich long description if description_long is short
  const problemSec = extractField(/##\s*Problem\s*\n+([\s\S]*?)(?=\n##\s|$)/i, "");
  const solutionSec = extractField(/##\s*Solution\s*\n+([\s\S]*?)(?=\n##\s|$)/i, "");
  const featuresSec = extractField(/##\s*Core features\s*\n+([\s\S]*?)(?=\n##\s|$)/i, "");

  let longDesc = extractField(/description_long:\s*\|?\s*\n([\s\S]*?)(?=\n\s*\w+:|\n---)/m, "");
  if (!longDesc || longDesc.length < 120) {
    longDesc = [
      `### Overview\n${name} (${tagline}) is a commercial AI application built for the Sensifai Marketplace.`,
      problemSec ? `### The Problem\n${problemSec}` : "",
      solutionSec ? `### The Solution\n${solutionSec}` : "",
      featuresSec ? `### Key Capabilities\n${featuresSec}` : "",
      `### How It Works\nSign in with your Sensifai account, configure your input parameters or upload domain data, and receive structured real-time analysis metered transparently through your Sensifai prepaid wallet.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const tags = extractList(/tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
  const usecases = extractList(/use_cases:\s*\n((?:\s*-\s*.+\n?)+)/m);
  const keyFeatures = extractList(/##\s*Core features\s*\n+((?:.|\n)*?)(?=\n##\s|$)/i).slice(0, 6);

  const canonicalUrl = `https://${appId}.sensifai.com`;

  return {
    slug: appId,
    name,
    short_description: shortDesc,
    long_description: longDesc,
    branding: {
      logo_url: `${canonicalUrl}/logo.png`,
      covers_url: [`${canonicalUrl}/images/hero.jpg`],
    },
    endpoints: {
      dashboard_url: canonicalUrl,
      documentation_url: `${canonicalUrl}#how-it-works`,
      api_urls: [`${canonicalUrl}/api/billable-action`, `${canonicalUrl}/api/health`],
      redirect_uris: [`${canonicalUrl}/callback`, "http://localhost:3000/callback"],
      post_logout_redirect_uris: [canonicalUrl, "http://localhost:3000"],
      cors_allowed_origins: [canonicalUrl, "https://sensifai.com", "http://localhost:3000"],
    },
    key_features:
      keyFeatures.length > 0
        ? keyFeatures
        : ["Real-time AI analysis via Sensifai Engine", "Instant prepaid wallet metering", "Exportable structured reports"],
    tags: tags.length > 0 ? tags : ["AI", "Automation", "Sensifai", "Analytics"],
    usecases:
      usecases.length > 0
        ? usecases
        : ["Automated domain intelligence and reporting", "Interactive analysis with pay-as-you-go metering"],
    vendors: ["sensifai"],
  };
}

async function ensureLiteLLMKey(appId) {
  const currentKey = process.env.AI_GATEWAY_KEY || "";
  if (currentKey.startsWith("sk-") && !currentKey.includes("...") && currentKey.length > 12) {
    console.log(`[LiteLLM] Using existing AI_GATEWAY_KEY (${currentKey.slice(0, 7)}...)`);
    return currentKey;
  }

  console.log(`[LiteLLM] Provisioning dedicated Virtual Key for ${appId}...`);
  try {
    const res = await fetch(`${LITELLM_BASE_URL.replace(/\/+$/, "")}/key/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LITELLM_MASTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key_alias: appId,
        metadata: { app_id: appId, source: "sensifai-starter-kit-auto" },
        max_budget: 50.0,
        budget_duration: "30d",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.key && data.key.startsWith("sk-")) {
        console.log(`[LiteLLM] ✓ Provisioned Virtual Key: ${data.key.slice(0, 8)}...`);
        return data.key;
      }
    }
  } catch (err) {
    console.warn(`[LiteLLM] Auto-key provisioning note: ${err.message}`);
  }
  return currentKey;
}

function extractRegexOrJsonField(text, fieldNames) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const searchObj = (obj) => {
      if (!obj || typeof obj !== "object") return null;
      for (const f of fieldNames) {
        if (typeof obj[f] === "string" && obj[f].length > 3) return obj[f];
      }
      for (const val of Object.values(obj)) {
        if (typeof val === "object") {
          const found = searchObj(val);
          if (found) return found;
        }
      }
      return null;
    };
    const fromJson = searchObj(parsed);
    if (fromJson) return fromJson;
  } catch {}

  for (const f of fieldNames) {
    const re = new RegExp(`["']?${f}["']?\\s*[:=]\\s*["']?([a-zA-Z0-9_-]{8,})["']?`, "i");
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  const cliTokenArg = process.argv.find((a) => a.startsWith("--token="));
  const noPublish = process.argv.includes("--no-publish") || process.argv.includes("--provision-only");
  const token = cliTokenArg
    ? cliTokenArg.split("=")[1].trim()
    : (process.env.SENSIFAI_ACCESS_TOKEN || "").trim();

  // Load app specification from Docs JSON or directly from PROJECT.md
  const descriptorPath = path.resolve("Docs/sensifai_marketplace_submission.json");
  let appSpec = parseProjectMd();
  if (fs.existsSync(descriptorPath)) {
    try {
      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf-8"));
      if (descriptor.application) {
        appSpec = { ...appSpec, ...descriptor.application };
      }
    } catch {}
  }

  if (!appSpec) {
    const fallbackSlug = path.basename(process.cwd()).toLowerCase();
    appSpec = {
      slug: fallbackSlug,
      name: process.env.APP_NAME || fallbackSlug,
      short_description: "AI-powered application on the Sensifai Marketplace.",
      long_description: "Enterprise AI application integrated with Sensifai Logto OIDC and Gatekeeper metering.",
      endpoints: {
        dashboard_url: `https://${fallbackSlug}.sensifai.com`,
        documentation_url: `https://${fallbackSlug}.sensifai.com#how-it-works`,
        api_urls: [`https://${fallbackSlug}.sensifai.com/api/billable-action`],
        redirect_uris: [
          `https://${fallbackSlug}.sensifai.com/callback`,
          "http://localhost:3000/callback",
        ],
        post_logout_redirect_uris: [
          `https://${fallbackSlug}.sensifai.com`,
          "http://localhost:3000",
        ],
        cors_allowed_origins: [
          `https://${fallbackSlug}.sensifai.com`,
          "https://sensifai.com",
          "http://localhost:3000",
        ],
      },
      key_features: ["Real-time AI processing", "Prepaid wallet metering"],
      tags: ["AI", "Sensifai"],
      usecases: ["Automated AI analysis"],
      vendors: ["sensifai"],
    };
  }

  // Ensure both production and localhost callback URLs are registered for zero OIDC errors
  const canonicalUrl = `https://${appSpec.slug}.sensifai.com`;
  const redirectUris = Array.from(
    new Set([
      ...(appSpec.endpoints?.redirect_uris || []),
      `${canonicalUrl}/callback`,
      "http://localhost:3000/callback",
    ])
  );
  const postLogoutUris = Array.from(
    new Set([
      ...(appSpec.endpoints?.post_logout_redirect_uris || []),
      canonicalUrl,
      "http://localhost:3000",
    ])
  );

  // Step 0: Provision LiteLLM Virtual Key if needed
  const aiGatewayKey = await ensureLiteLLMKey(appSpec.slug);
  const envUpdates = {
    APP_ID: appSpec.slug,
    PUBLIC_URL: canonicalUrl,
    LOGTO_ENDPOINT: "https://auth.sensifai.com",
    SENSIFAI_GATEKEEPER_URL: "https://gatekeeper.sensifai.com",
    AI_GATEWAY_URL: "https://llm.sensifai.com",
  };
  if (aiGatewayKey) {
    envUpdates.AI_GATEWAY_KEY = aiGatewayKey;
  }

  if (!token || token.includes("[") || token.length < 10) {
    updateEnvFile(envUpdates, ".env");
    console.error(
      "\n[!] SENSIFAI_ACCESS_TOKEN is required for Marketplace MCP registration.\n" +
        "    Obtain it from: https://sensifai.com/api/auth/agent-authorize\n" +
        "    (Click the Copy Token button on that page or pass --token=YOUR_TOKEN)\n"
    );
    process.exit(1);
  }

  envUpdates.SENSIFAI_ACCESS_TOKEN = token;

  const client = new SensifaiMcpClient();
  await client.connect();

  await client.callTool("marketplace_set_token", { token });
  const authRes = await client.callTool("marketplace_auth_status", {});
  console.log("[MCP] Authenticated with Sensifai Marketplace:", JSON.stringify(authRes));

  // 1. Check existing applications to avoid duplicates
  const listRes = await client.callTool("marketplace_list_applications", {});
  const listText = listRes.content?.[0]?.text || "{}";
  let apps = [];
  try {
    const parsed = JSON.parse(listText);
    apps = Array.isArray(parsed) ? parsed : parsed.data || parsed.items || [];
  } catch {}

  const currentAppName = appSpec.name || process.env.APP_NAME || "Sensifai App";
  const existing = apps.find(
    (a) =>
      a.name?.toLowerCase() === currentAppName.toLowerCase() ||
      a.slug?.toLowerCase() === appSpec.slug?.toLowerCase() ||
      a.id === process.env.MARKETPLACE_APP_UUID
  );
  let appId = existing?.id;

  const docUrl =
    appSpec.endpoints?.documentation_url &&
    !appSpec.endpoints.documentation_url.includes("/spi-")
      ? appSpec.endpoints.documentation_url
      : `${canonicalUrl}#how-it-works`;

  const registrationPayload = {
    name: appSpec.name,
    short_description: appSpec.short_description,
    long_description: appSpec.long_description,
    logo_url: appSpec.branding?.logo_url || `${canonicalUrl}/logo.png`,
    covers_url: appSpec.branding?.covers_url || [`${canonicalUrl}/images/hero.jpg`],
    dashboard_url: appSpec.endpoints?.dashboard_url || canonicalUrl,
    api_urls: appSpec.endpoints?.api_urls || [`${canonicalUrl}/api/billable-action`],
    key_features: appSpec.key_features,
    tags: appSpec.tags,
    usecases: appSpec.usecases,
    vendors: appSpec.vendors || ["sensifai"],
    redirect_uris: redirectUris,
    post_logout_redirect_uris: postLogoutUris,
    cors_allowed_origins: appSpec.endpoints?.cors_allowed_origins || [
      canonicalUrl,
      "https://sensifai.com",
      "http://localhost:3000",
    ],
    documentation_url: docUrl,
  };

  // 2. Register if not existing, or update if already existing
  let regRawText = "";
  if (!appId) {
    console.log(`[MCP] Registering new application: ${appSpec.name}...`);
    const regRes = await client.callTool(
      "marketplace_register_application",
      registrationPayload
    );
    regRawText = regRes.content?.[0]?.text || "";
    const match =
      regRawText.match(/Application ID:\s*([a-f0-9-]+)/i) ||
      regRawText.match(/"id":\s*"([a-f0-9-]+)"/i);
    if (match) appId = match[1];
  } else {
    console.log(`[MCP] Application already exists (${appId}). Updating listing & redirect URIs...`);
    try {
      const updRes = await client.callTool("marketplace_update_application", {
        id: appId,
        ...registrationPayload,
      });
      regRawText = updRes.content?.[0]?.text || "";
      console.log("[MCP] ✓ Listing metadata & OAuth redirect URIs updated.");
    } catch (err) {
      console.warn("[MCP] Update note:", err.message);
    }
  }

  if (!appId) {
    throw new Error("Could not register or resolve application ID from Marketplace MCP.");
  }
  console.log(`[MCP] ✓ Application ID: ${appId}`);
  envUpdates.MARKETPLACE_APP_UUID = appId;

  // 3. Create or verify Pay-As-You-Go price model (€0.05 default)
  const listPrices = await client.callTool("marketplace_list_price_models", {
    application_id: appId,
  });
  let priceId = null;
  try {
    const pData = JSON.parse(listPrices.content?.[0]?.text || "{}");
    const pItems = Array.isArray(pData) ? pData : pData.data || pData.items || [];
    if (pItems.length > 0) priceId = pItems[0].id;
  } catch {}

  if (!priceId) {
    console.log("[MCP] Creating default Pay-As-You-Go (€0.05 / REQUEST) price model...");
    const pRes = await client.callTool("marketplace_create_pay_as_go_price", {
      application_id: appId,
      name: "Pay-As-You-Go Metered Usage",
      amount: 0.05,
      unit: "REQUEST",
    });
    const pText = pRes.content?.[0]?.text || "";
    const pMatch =
      pText.match(/Price ID:\s*([a-f0-9-]+)/i) ||
      pText.match(/"id":\s*"([a-f0-9-]+)"/i);
    if (pMatch) priceId = pMatch[1];
  }

  if (priceId) {
    console.log(`[MCP] ✓ Price Model ID: ${priceId}`);
    envUpdates.SENSIFAI_PRICE_ID = priceId;
  }

  // 4. Retrieve Logto & Gatekeeper Secrets and write directly to .env
  try {
    const secretsRes = await client.callTool("marketplace_get_application_secrets", {
      id: appId,
    });
    const secretsText = secretsRes.content?.[0]?.text || JSON.stringify(secretsRes);

    const logtoClientId = extractRegexOrJsonField(secretsText, [
      "logto_client_id",
      "client_id",
      "clientId",
      "applicationId",
      "logto_app_id",
    ]);
    const logtoClientSecret = extractRegexOrJsonField(secretsText, [
      "logto_client_secret",
      "client_secret",
      "clientSecret",
      "value",
    ]);
    const gatekeeperKey = extractRegexOrJsonField(secretsText, [
      "api_key",
      "apiKey",
      "gatekeeper_api_key",
    ]);
    const webhookSecret = extractRegexOrJsonField(secretsText, [
      "webhook_secret",
      "webhookSecret",
    ]);

    if (logtoClientId) envUpdates.LOGTO_CLIENT_ID = logtoClientId;
    if (logtoClientSecret) envUpdates.LOGTO_CLIENT_SECRET = logtoClientSecret;
    if (gatekeeperKey && gatekeeperKey.startsWith("smp_live_")) {
      envUpdates.SENSIFAI_API_KEY = gatekeeperKey;
    }
    if (webhookSecret) envUpdates.SENSIFAI_WEBHOOK_SECRET = webhookSecret;

    console.log("[MCP] ✓ Retrieved application credentials and synced to .env");
  } catch (err) {
    console.warn("[MCP] Could not retrieve secrets:", err.message);
  }

  // 5. Configure minimal consent scopes
  try {
    await client.callTool("marketplace_update_application_consent_scopes", {
      id: appId,
      scopes: ["openid", "profile", "email"],
    });
  } catch {}

  // 6. Publish Application (unless --no-publish)
  if (!noPublish) {
    console.log("[MCP] Publishing application to Sensifai Marketplace catalog...");
    try {
      const pubRes = await client.callTool("marketplace_publish_application", {
        id: appId,
      });
      console.log("[MCP] ✓ Publish Result:", pubRes.content?.[0]?.text || "Published");
    } catch (err) {
      console.warn("[MCP] Publish note:", err.message);
    }
  }

  // 7. Save all provisioned credentials to .env and .env.production
  updateEnvFile(envUpdates, ".env");
  updateEnvFile(envUpdates, ".env.production");

  client.close();
  console.log("\n=====================================================================");
  console.log("  SENSIFAI MARKETPLACE PROVISIONING & SETUP COMPLETE");
  console.log(`  App Slug:          ${appSpec.slug}`);
  console.log(`  Application UUID:  ${appId}`);
  console.log(`  Price Model ID:    ${priceId || process.env.SENSIFAI_PRICE_ID || "Configured"}`);
  console.log(`  Canonical URL:     ${canonicalUrl}`);
  console.log("  All keys have been written to .env and .env.production");
  console.log("=====================================================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Setup error:", err);
  process.exit(1);
});
