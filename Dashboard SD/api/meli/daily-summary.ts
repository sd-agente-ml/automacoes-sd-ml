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
  shipping?: {
    id?: number;
    logistic_type?: string | null;
  };
  order_items?: Array<{
    quantity?: number;
    item?: {
      id?: string;
      title?: string;
      seller_sku?: string | null;
      seller_custom_field?: string | null;
    };
  }>;
};

type OrdersResponse = {
  paging: {
    total: number;
    limit: number;
    offset: number;
  };
  results: Order[];
};

type ItemLookupResponse = {
  code: number;
  body?: {
    id?: string;
    thumbnail?: string;
    seller_custom_field?: string | null;
    attributes?: Array<{
      id?: string;
      value_name?: string;
    }>;
  };
};

type TopSku = {
  itemId: string;
  sku: string;
  image: string | null;
  units: number;
};

type ShippingGroup = "flex" | "full" | "mercadoEnvios";

type ShippingSummary = {
  orders: number;
  revenue: number;
};

type ShipmentResponse = {
  id: number;
  logistic_type?: string | null;
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

const fetchItemImages = async (accessToken: string, itemIds: string[]) => {
  const images = new Map<string, string | null>();
  const uniqueIds = [...new Set(itemIds)].slice(0, 20);

  for (let index = 0; index < uniqueIds.length; index += 20) {
    const batch = uniqueIds.slice(index, index + 20);
    const url = new URL("https://api.mercadolibre.com/items");

    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("attributes", "id,thumbnail");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as ItemLookupResponse[];

    payload.forEach((item) => {
      if (item.body?.id) {
        images.set(item.body.id, item.body.thumbnail ?? null);
      }
    });
  }

  return images;
};

const resolveSku = (item: NonNullable<Order["order_items"]>[number]["item"]) =>
  item?.seller_sku ??
  item?.seller_custom_field ??
  item?.id ??
  "SKU sem cadastro";

const buildTopSkus = async (accessToken: string, orders: Order[]) => {
  const skuMap = new Map<string, TopSku>();

  orders.forEach((order) => {
    order.order_items?.forEach((orderItem) => {
      const itemId = orderItem.item?.id;

      if (!itemId) {
        return;
      }

      const sku = resolveSku(orderItem.item);
      const existing = skuMap.get(sku);
      const units = orderItem.quantity ?? 0;

      skuMap.set(sku, {
        itemId,
        sku,
        image: existing?.image ?? null,
        units: (existing?.units ?? 0) + units,
      });
    });
  });

  const topSkus = [...skuMap.values()]
    .sort((left, right) => right.units - left.units)
    .slice(0, 10);
  const images = await fetchItemImages(
    accessToken,
    topSkus.map((item) => item.itemId),
  );

  return topSkus.map((item) => ({
    ...item,
    image: images.get(item.itemId) ?? null,
  }));
};

const getOrderAmount = (order: Order) => order.paid_amount ?? order.total_amount ?? 0;

const fetchShipmentLogisticType = async (
  accessToken: string,
  shipmentId: number,
) => {
  const response = await fetch(
    `https://api.mercadolibre.com/shipments/${shipmentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    return undefined;
  }

  const shipment = (await response.json()) as ShipmentResponse;

  return shipment.logistic_type ?? undefined;
};

const classifyLogisticType = (logisticType: string | undefined): ShippingGroup => {
  if (logisticType === "self_service") {
    return "flex";
  }

  if (logisticType === "fulfillment") {
    return "full";
  }

  return "mercadoEnvios";
};

const buildShippingBreakdown = async (accessToken: string, orders: Order[]) => {
  const shipmentTypeCache = new Map<number, string | undefined>();
  const breakdown: Record<ShippingGroup, ShippingSummary> = {
    flex: { orders: 0, revenue: 0 },
    full: { orders: 0, revenue: 0 },
    mercadoEnvios: { orders: 0, revenue: 0 },
  };

  for (const order of orders) {
    let logisticType = order.shipping?.logistic_type ?? undefined;
    const shipmentId = order.shipping?.id;

    if (!logisticType && shipmentId) {
      if (!shipmentTypeCache.has(shipmentId)) {
        shipmentTypeCache.set(
          shipmentId,
          await fetchShipmentLogisticType(accessToken, shipmentId),
        );
      }

      logisticType = shipmentTypeCache.get(shipmentId);
    }

    const group = classifyLogisticType(logisticType);

    breakdown[group].orders += 1;
    breakdown[group].revenue += getOrderAmount(order);
  }

  return breakdown;
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
    const revenue = orders.reduce((sum, order) => sum + getOrderAmount(order), 0);
    const currencyId = orders.find((order) => order.currency_id)?.currency_id ?? "BRL";
    const topSkus = await buildTopSkus(token.access_token, orders);
    const shippingBreakdown = await buildShippingBreakdown(token.access_token, orders);

    response.setHeader("Set-Cookie", tokenCookie(token.refresh_token));
    response.status(200).json({
      connected: true,
      date: range.date,
      orders: orders.length,
      revenue,
      currencyId,
      topSkus,
      shippingBreakdown,
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
