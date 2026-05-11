import type { VercelRequest, VercelResponse } from "@vercel/node";

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

type Advertiser = {
  advertiser_id?: number;
  site_id?: string;
};

type AdvertisersResponse = {
  advertisers?: Advertiser[];
  results?: Advertiser[];
};

type CampaignMetric = {
  cost?: number;
  acos?: number;
  total_amount?: number;
};

type CampaignMetricsResult = {
  currency_id?: string;
  cost?: number;
  acos?: number;
  total_amount?: number;
  metrics?: CampaignMetric;
};

type CampaignsResponse = {
  paging?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
  results?: CampaignMetricsResult[];
};

const requiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

const parseCookie = (cookieHeader: string | undefined, name: string) => {
  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : undefined;
};

const tokenCookie = (token: string) =>
  [
    `meli_refresh_token=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=15552000",
  ].join("; ");

const refreshAccessToken = async (refreshToken: string) => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requiredEnv("MELI_CLIENT_ID"),
    client_secret: requiredEnv("MELI_CLIENT_SECRET"),
    refresh_token: refreshToken,
  });

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel renovar o token do Mercado Livre.");
  }

  return (await response.json()) as RefreshResponse;
};

const getBrazilYesterday = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const now = new Date();
  const saoPauloToday = formatter.format(now);
  const todayStartUtc = new Date(`${saoPauloToday}T03:00:00.000Z`);
  const yesterdayStartUtc = new Date(todayStartUtc);

  yesterdayStartUtc.setUTCDate(yesterdayStartUtc.getUTCDate() - 1);

  return formatter.format(yesterdayStartUtc);
};

const fetchProductAdsAdvertiser = async (accessToken: string) => {
  const url = new URL("https://api.mercadolibre.com/advertising/advertisers");

  url.searchParams.set("product_id", "PADS");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Api-Version": "1",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel consultar o anunciante do Mercado Ads.");
  }

  const payload = (await response.json()) as AdvertisersResponse | Advertiser[];
  const advertisers = Array.isArray(payload)
    ? payload
    : payload.advertisers ?? payload.results ?? [];
  const advertiser = advertisers.find((item) => item.advertiser_id);

  if (!advertiser?.advertiser_id) {
    throw new Error("Conta sem anunciante Product Ads disponivel.");
  }

  return {
    advertiserId: advertiser.advertiser_id,
    siteId: advertiser.site_id ?? "MLB",
  };
};

const getMetricValue = (
  result: CampaignMetricsResult,
  field: keyof CampaignMetric,
) => result.metrics?.[field] ?? result[field] ?? 0;

const fetchCampaignMetrics = async (
  accessToken: string,
  advertiserId: number,
  siteId: string,
  date: string,
) => {
  const metrics = ["cost", "acos", "total_amount"].join(",");
  const limit = 50;
  let offset = 0;
  let total = 0;
  let cost = 0;
  let totalAmount = 0;
  let acosSum = 0;
  let acosCount = 0;
  let currencyId = "BRL";

  do {
    const url = new URL(
      `https://api.mercadolibre.com/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search`,
    );

    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("date_from", date);
    url.searchParams.set("date_to", date);
    url.searchParams.set("metrics", metrics);
    url.searchParams.set("metrics_summary", "true");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "api-version": "2",
      },
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel consultar metricas de Product Ads.");
    }

    const payload = (await response.json()) as CampaignsResponse;
    const results = payload.results ?? [];

    results.forEach((result) => {
      const itemCost = getMetricValue(result, "cost");
      const itemTotalAmount = getMetricValue(result, "total_amount");
      const itemAcos = getMetricValue(result, "acos");

      cost += itemCost;
      totalAmount += itemTotalAmount;

      if (itemAcos > 0) {
        acosSum += itemAcos;
        acosCount += 1;
      }

      if (result.currency_id) {
        currencyId = result.currency_id;
      }
    });

    total = payload.paging?.total ?? results.length;
    offset += payload.paging?.limit ?? limit;
  } while (offset < total && offset < 1000);

  return {
    acos: totalAmount > 0 ? (cost / totalAmount) * 100 : acosCount > 0 ? acosSum / acosCount : 0,
    investment: cost,
    currencyId,
  };
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    const refreshToken =
      parseCookie(request.headers.cookie, "meli_refresh_token") ??
      process.env.MELI_REFRESH_TOKEN;

    if (!refreshToken) {
      response.status(200).json({
        connected: false,
        message: "Conta Mercado Livre ainda nao conectada.",
      });
      return;
    }

    const token = await refreshAccessToken(refreshToken);
    const date = getBrazilYesterday();
    const advertiser = await fetchProductAdsAdvertiser(token.access_token);
    const metrics = await fetchCampaignMetrics(
      token.access_token,
      advertiser.advertiserId,
      advertiser.siteId,
      date,
    );

    response.setHeader("Set-Cookie", tokenCookie(token.refresh_token));
    response.status(200).json({
      connected: true,
      date,
      advertiserId: advertiser.advertiserId,
      siteId: advertiser.siteId,
      ...metrics,
    });
  } catch (error) {
    response.status(200).json({
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar publicidade.",
    });
  }
}
