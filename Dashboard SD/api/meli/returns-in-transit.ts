import type { VercelRequest, VercelResponse } from "@vercel/node";

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

type UserResponse = {
  id: number;
  site_id?: string;
};

type Claim = {
  id: number;
  resource_id?: number | string;
  order_id?: number | string;
  type?: string;
  status?: string;
  stage?: string;
  resource?: string;
  date_created?: string;
  last_updated?: string;
};

type ClaimsSearchResponse = {
  paging?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
  data?: Claim[];
  results?: Claim[];
};

type ReturnShipment = {
  shipment_id?: number;
  id?: number;
  status?: string;
};

type ReturnDetail = {
  id?: number;
  status?: string;
  shipping?: ReturnShipment;
  shipments?: ReturnShipment[];
  resources?: Array<{
    id?: number | string;
    name?: string;
    type?: string;
  }>;
};

type ReturnCandidate = {
  orderId: string;
  claimId: number;
  returnId: number | null;
  returnStatus: string;
  shipmentStatus: string | null;
  lastUpdated?: string;
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

const getLastDaysRange = (days: number) => {
  const since = new Date();

  since.setUTCDate(since.getUTCDate() - days);

  return since.toISOString();
};

const fetchClaims = async (accessToken: string, userId: number, siteId: string) => {
  const claims: Claim[] = [];
  const limit = 30;
  let offset = 0;
  let total = 0;

  do {
    const url = new URL("https://api.mercadolibre.com/post-purchase/v1/claims/search");

    url.searchParams.set("site_id", siteId);
    url.searchParams.set("user_id", String(userId));
    url.searchParams.set("type", "return");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("sort", "last_updated:desc");
    url.searchParams.set(
      "range",
      `last_updated:after:${getLastDaysRange(21)},before:${new Date().toISOString()}`,
    );

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel consultar devolucoes no Mercado Livre.");
    }

    const payload = (await response.json()) as ClaimsSearchResponse;
    const results = payload.data ?? payload.results ?? [];

    claims.push(...results);
    total = payload.paging?.total ?? results.length;
    offset += payload.paging?.limit ?? limit;
  } while (offset < total && offset < 300);

  return claims;
};

const fetchReturnDetail = async (accessToken: string, claimId: number) => {
  const response = await fetch(
    `https://api.mercadolibre.com/post-purchase/v2/claims/${claimId}/returns`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as ReturnDetail;
};

const getOrderId = (claim: Claim, detail: ReturnDetail | undefined) => {
  const claimOrder = claim.order_id ?? claim.resource_id;
  const resourceOrder = detail?.resources?.find((resource) => {
    const label = `${resource.name ?? ""} ${resource.type ?? ""}`.toLowerCase();

    return label.includes("order");
  })?.id;

  return claimOrder ?? resourceOrder;
};

const getShipmentStatus = (detail: ReturnDetail | undefined) =>
  detail?.shipping?.status ?? detail?.shipments?.find((shipment) => shipment.status)?.status ?? null;

const isInTransitReturn = (detail: ReturnDetail | undefined) => {
  const returnStatus = detail?.status;
  const shipmentStatus = getShipmentStatus(detail);

  return returnStatus === "shipped" || shipmentStatus === "shipped";
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
    const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error("Nao foi possivel identificar o vendedor.");
    }

    const user = (await userResponse.json()) as UserResponse;
    const claims = await fetchClaims(
      token.access_token,
      user.id,
      user.site_id ?? "MLB",
    );
    const returns: ReturnCandidate[] = [];

    for (const claim of claims) {
      const detail = await fetchReturnDetail(token.access_token, claim.id);

      if (!isInTransitReturn(detail)) {
        continue;
      }

      const orderId = getOrderId(claim, detail);

      if (!orderId) {
        continue;
      }

      returns.push({
        orderId: String(orderId),
        claimId: claim.id,
        returnId: detail?.id ?? null,
        returnStatus: detail?.status ?? "unknown",
        shipmentStatus: getShipmentStatus(detail),
        lastUpdated: claim.last_updated,
      });
    }

    response.setHeader("Set-Cookie", tokenCookie(token.refresh_token));
    response.status(200).json({
      connected: true,
      returns,
    });
  } catch (error) {
    response.status(200).json({
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar devolucoes.",
    });
  }
}
