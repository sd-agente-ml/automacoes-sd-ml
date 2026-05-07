import type { VercelRequest, VercelResponse } from "@vercel/node";

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

type UserResponse = {
  id: number;
};

type Order = {
  id: number;
  paid_amount?: number;
  total_amount?: number;
  currency_id?: string;
};

type OrdersResponse = {
  paging: {
    total: number;
    limit: number;
    offset: number;
  };
  results: Order[];
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

const getBrazilYesterdayRange = () => {
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

  const date = formatter.format(yesterdayStartUtc);

  return {
    date,
    from: `${date}T00:00:00.000-03:00`,
    to: `${date}T23:59:59.999-03:00`,
  };
};

const fetchPaidOrders = async (
  accessToken: string,
  sellerId: number,
  from: string,
  to: string,
) => {
  const orders: Order[] = [];
  const limit = 50;
  let offset = 0;
  let total = 0;

  do {
    const url = new URL("https://api.mercadolibre.com/orders/search");

    url.searchParams.set("seller", String(sellerId));
    url.searchParams.set("order.status", "paid");
    url.searchParams.set("order.date_created.from", from);
    url.searchParams.set("order.date_created.to", to);
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel consultar pedidos do Mercado Livre.");
    }

    const payload = (await response.json()) as OrdersResponse;

    orders.push(...payload.results);
    total = payload.paging.total;
    offset += payload.paging.limit;
  } while (offset < total && offset < 1000);

  return orders;
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
    const range = getBrazilYesterdayRange();
    const orders = await fetchPaidOrders(
      token.access_token,
      user.id,
      range.from,
      range.to,
    );
    const revenue = orders.reduce(
      (sum, order) => sum + (order.paid_amount ?? order.total_amount ?? 0),
      0,
    );
    const currencyId = orders.find((order) => order.currency_id)?.currency_id ?? "BRL";

    response.setHeader("Set-Cookie", tokenCookie(token.refresh_token));
    response.status(200).json({
      connected: true,
      date: range.date,
      orders: orders.length,
      revenue,
      currencyId,
    });
  } catch (error) {
    response.status(200).json({
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar faturamento.",
    });
  }
}
