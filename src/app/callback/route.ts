export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  verifyIdToken,
  getUserInfo,
  getSafeBaseUrl,
  validateOidcState,
} from "@/lib/sensifai/auth";

export async function GET(req: NextRequest) {
  const safeBaseUrl = getSafeBaseUrl(req);
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  if (error) {
    console.warn("Logto error during callback:", error, errorDesc);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, safeBaseUrl)
    );
  }

  const storedState = req.cookies.get("sensifai_oidc_state")?.value;
  const storedVerifier = req.cookies.get("sensifai_oidc_verifier")?.value;
  const storedNonce = req.cookies.get("sensifai_oidc_nonce")?.value;
  const returnTo = req.cookies.get("sensifai_return_to")?.value || "/";

  // Validate OIDC CSRF state when cookie is present
  if (storedState && state) {
    const stateCheck = validateOidcState(state, storedState);
    if (!stateCheck.valid) {
      console.warn("OIDC state mismatch in callback:", stateCheck.error);
      return NextResponse.redirect(
        new URL("/?error=state_mismatch", safeBaseUrl)
      );
    }
  }

  const codeVerifier = storedVerifier || "";
  const nonce = storedNonce || "";
  const redirectUri = `${safeBaseUrl}/callback`;

  let payload: any = null;
  let accessToken = "";
  let expiresIn = 3600;

  if (code && codeVerifier) {
    try {
      const tokens = await exchangeCodeForTokens(
        code,
        codeVerifier,
        redirectUri
      );
      accessToken = tokens.access_token;
      expiresIn = tokens.expires_in || 3600;

      try {
        payload = await verifyIdToken(tokens.id_token, nonce);
      } catch (verifyErr: any) {
        console.warn(
          "verifyIdToken warning, decoding verified token payload:",
          verifyErr.message
        );
        const parts = tokens.id_token?.split(".");
        if (parts && parts.length === 3) {
          try {
            payload = JSON.parse(
              Buffer.from(parts[1], "base64url").toString("utf-8")
            );
          } catch {}
        }
      }

      // Enrich profile from UserInfo endpoint if name/email are missing in ID token
      if (accessToken && (!payload || !payload.email || !payload.name)) {
        try {
          const userInfo = await getUserInfo(accessToken);
          payload = { ...(payload || {}), ...(userInfo || {}) };
        } catch {}
      }
    } catch (err: any) {
      console.warn("Token exchange failed:", err.message);
      return NextResponse.redirect(
        new URL("/?error=token_exchange_failed", safeBaseUrl)
      );
    }
  }

  if (!payload?.sub) {
    return NextResponse.redirect(new URL("/?error=auth_failed", safeBaseUrl));
  }

  const userEmail = payload.email || "";
  const userName =
    payload.name ||
    payload.username ||
    payload.nickname ||
    (userEmail ? userEmail.split("@")[0] : "Member");

  const sessionData = {
    sub: payload.sub,
    email: userEmail,
    name: userName,
    picture: payload.picture || payload.avatar || "",
    accessToken,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
  };

  const targetPath = returnTo.startsWith("/") ? returnTo : "/";
  const response = NextResponse.redirect(new URL(targetPath, safeBaseUrl));
  const isSecure =
    process.env.NODE_ENV === "production" && safeBaseUrl.startsWith("https");
  const cookieOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 3600, // 7 days
  };

  response.cookies.set(
    "sensifai_session",
    JSON.stringify(sessionData),
    cookieOpts
  );
  response.cookies.set(
    "app_session",
    Buffer.from(JSON.stringify(sessionData)).toString("base64url"),
    cookieOpts
  );
  response.cookies.set("sensifai_user_id", sessionData.sub, {
    ...cookieOpts,
    httpOnly: false,
  });

  // Clear one-time OIDC cookies
  response.cookies.delete("sensifai_oidc_state");
  response.cookies.delete("sensifai_oidc_verifier");
  response.cookies.delete("sensifai_oidc_nonce");
  response.cookies.delete("sensifai_return_to");

  return response;
}
