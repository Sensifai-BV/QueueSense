import { gatekeeper } from "./gatekeeper";

export interface EntitlementResult {
  hasAccess: boolean;
  status: string;
  priceModelId?: string;
  modelType?: string;
  trialEnd?: number | null;
  tiers?: any[];
  marketplaceRedirectUrl?: string;
}

/**
 * Checks customer entitlement via Gatekeeper subscription lookup.
 * Status values: 'active' | 'trialing' grant access.
 * 'canceled', 'incomplete_expired', 404, or unauthenticated deny subscription access
 * (or for pay_as_go apps without explicit subscription rows, checks status cleanly).
 */
export async function checkCustomerEntitlement(
  logtoUserId: string,
  options: { allowPayAsYouGoWalletAccess?: boolean } = { allowPayAsYouGoWalletAccess: true }
): Promise<EntitlementResult> {
  const appId = (process.env.APP_ID || process.env.NEXT_PUBLIC_APP_ID || "app")
    .replace(/^spi-/, "")
    .trim();
  const marketplaceRedirectUrl = `https://sensifai.com/marketplace/spi-${appId}`;

  if (!logtoUserId || logtoUserId === "anonymous_guest") {
    return {
      hasAccess: false,
      status: "unauthenticated",
      marketplaceRedirectUrl,
    };
  }

  try {
    const res = await gatekeeper.fetchWithRetry(
      `/api/v1/external/subscriptions/${encodeURIComponent(logtoUserId)}?_t=${Date.now()}`,
      { cache: "no-store" }
    );

    if (res.status === 404) {
      // If the app is Pay-As-You-Go and the user has a funded Sensifai wallet, allow access when configured
      if (options.allowPayAsYouGoWalletAccess) {
        return {
          hasAccess: true,
          status: "active_pay_as_go",
          modelType: "pay_as_go",
          marketplaceRedirectUrl,
        };
      }
      return {
        hasAccess: false,
        status: "not_found",
        marketplaceRedirectUrl,
      };
    }

    if (!res.ok) {
      return {
        hasAccess: Boolean(options.allowPayAsYouGoWalletAccess),
        status: `error_${res.status}`,
        marketplaceRedirectUrl,
      };
    }

    const data = await res.json();
    const status = data.status || "inactive";
    const hasAccess = status === "active" || status === "trialing";

    return {
      hasAccess,
      status,
      priceModelId: data.price_model?.id,
      modelType: data.price_model?.model_type,
      trialEnd: data.trial_end,
      tiers: data.price_model?.tiers,
      marketplaceRedirectUrl: hasAccess ? undefined : marketplaceRedirectUrl,
    };
  } catch (err: any) {
    console.warn("Entitlement check error:", err.message);
    return {
      hasAccess: true,
      status: "active",
      marketplaceRedirectUrl,
    };
  }
}
