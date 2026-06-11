import type { VercelRequest, VercelResponse } from "@vercel/node";

type RefreshResponse = { access_token: string; refresh_token: string };
type UserResponse = { id: number };
type Order = {
  id: number;
  order_items?: Array<{
    quantity?: number;
    unit_price?: number;
    item?: {
      id?: string;
      title?: string;
      seller_sku?: string | null;
      seller_custom_field?: string | null;
    };
  }>;
};
type OrdersResponse = {
  paging: { total: number; limit: number; offset: number };
  results: Order[];
};
type ItemLookupResponse = {
  code: number;
  body?: {
    id?: string;
    title?: string;
    thumbnail?: string;
    seller_custom_field?: string | null;
    attributes?: Array<{ id?: string; value_name?: string | null }>;
  };
};
type VisitsResponse = {
  item_id?: string;
  total_visits?: number;
};
type Aggregate = {
  itemId: string;
  sku: string;
  title: string;
  units: number;
  orders: Set<number>;
  revenue: number;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

const parseCookie = (header: string | undefined, name: string) => {
  const cookie = header
    ?.split(";")
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
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: requiredEnv("MELI_CLIENT_ID"),
      client_secret: requiredEnv("MELI_CLIENT_SECRET"),
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error("Nao foi possivel renovar o token.");
  return (await response.json()) as RefreshResponse;
};

const dateInSaoPaulo = (daysBeforeToday: number) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const date = new Date(`${today}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysBeforeToday);
  return formatter.format(date);
};

const range = (fromDaysAgo: number, toDaysAgo: number) => {
  const fromDate = dateInSaoPaulo(fromDaysAgo);
  const toDate = dateInSaoPaulo(toDaysAgo);
  return {
    fromDate,
    toDate,
    from: `${fromDate}T00:00:00.000-03:00`,
    to: `${toDate}T23:59:59.999-03:00`,
  };
};

const fetchOrders = async (
  accessToken: string,
  sellerId: number,
  from: string,
  to: string,
) => {
  const orders: Order[] = [];
  let offset = 0;
  let total = 0;
  do {
    const url = new URL("https://api.mercadolibre.com/orders/search");
    url.searchParams.set("seller", String(sellerId));
    url.searchParams.set("order.status", "paid");
    url.searchParams.set("order.date_created.from", from);
    url.searchParams.set("order.date_created.to", to);
    url.searchParams.set("limit", "50");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("Nao foi possivel consultar os pedidos.");
    const payload = (await response.json()) as OrdersResponse;
    orders.push(...payload.results);
    total = payload.paging.total;
    offset += payload.paging.limit;
  } while (offset < total && offset < 2000);
  return orders;
};

const skuFromItem = (item: NonNullable<Order["order_items"]>[number]["item"]) =>
  item?.seller_sku ?? item?.seller_custom_field ?? item?.id ?? "SEM-SKU";

const aggregateOrders = (orders: Order[]) => {
  const aggregates = new Map<string, Aggregate>();
  orders.forEach((order) => {
    order.order_items?.forEach((orderItem) => {
      const itemId = orderItem.item?.id;
      if (!itemId) return;
      const sku = skuFromItem(orderItem.item);
      const quantity = orderItem.quantity ?? 0;
      const key = `${sku}::${itemId}`;
      const existing = aggregates.get(key) ?? {
        itemId,
        sku,
        title: orderItem.item?.title ?? itemId,
        units: 0,
        orders: new Set<number>(),
        revenue: 0,
      };
      existing.units += quantity;
      existing.orders.add(order.id);
      existing.revenue += quantity * (orderItem.unit_price ?? 0);
      aggregates.set(key, existing);
    });
  });
  return aggregates;
};

const fetchItems = async (accessToken: string, itemIds: string[]) => {
  const result = new Map<string, NonNullable<ItemLookupResponse["body"]>>();
  const uniqueIds = [...new Set(itemIds)];
  for (let index = 0; index < uniqueIds.length; index += 20) {
    const url = new URL("https://api.mercadolibre.com/items");
    url.searchParams.set("ids", uniqueIds.slice(index, index + 20).join(","));
    url.searchParams.set(
      "attributes",
      "id,title,thumbnail,seller_custom_field,attributes",
    );
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) continue;
    const payload = (await response.json()) as ItemLookupResponse[];
    payload.forEach(({ body }) => {
      if (body?.id) result.set(body.id, body);
    });
  }
  return result;
};

const fetchVisitsWindow = async (
  accessToken: string,
  itemIds: string[],
  last: number,
) => {
  const visits = new Map<string, number>();
  for (let index = 0; index < itemIds.length; index += 50) {
    const batch = itemIds.slice(index, index + 50);
    const url = new URL(
      "https://api.mercadolibre.com/items/visits/time_window",
    );
    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("last", String(last));
    url.searchParams.set("unit", "day");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      batch.forEach((id) => visits.set(id, 0));
      continue;
    }
    const payload = (await response.json()) as
      | VisitsResponse[]
      | Record<string, number>;
    if (Array.isArray(payload)) {
      payload.forEach((item) => {
        if (item.item_id) visits.set(item.item_id, item.total_visits ?? 0);
      });
    } else {
      Object.entries(payload).forEach(([itemId, total]) => {
        visits.set(itemId, typeof total === "number" ? total : 0);
      });
    }
  }
  return visits;
};

const percentageChange = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
};

const round = (value: number, decimals = 2) =>
  Number(value.toFixed(decimals));

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    const refreshToken =
      parseCookie(request.headers.cookie, "meli_refresh_token") ??
      process.env.MELI_REFRESH_TOKEN;
    if (!refreshToken) {
      response.status(200).json({ connected: false });
      return;
    }

    const minimumRevenue = Math.max(
      0,
      Number(request.query.minimumRevenue ?? 100) || 100,
    );
    const token = await refreshAccessToken(refreshToken);
    const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userResponse.ok) throw new Error("Nao foi possivel identificar a conta.");
    const user = (await userResponse.json()) as UserResponse;
    const currentRange = range(7, 1);
    const previousRange = range(14, 8);
    const [currentOrders, previousOrders] = await Promise.all([
      fetchOrders(token.access_token, user.id, currentRange.from, currentRange.to),
      fetchOrders(token.access_token, user.id, previousRange.from, previousRange.to),
    ]);
    const current = aggregateOrders(currentOrders);
    const previous = aggregateOrders(previousOrders);
    const itemIds = [
      ...new Set([
        ...[...current.values()].map((item) => item.itemId),
        ...[...previous.values()].map((item) => item.itemId),
      ]),
    ];
    const [items, visits7d, visits14d] = await Promise.all([
      fetchItems(token.access_token, itemIds),
      fetchVisitsWindow(token.access_token, itemIds, 7),
      fetchVisitsWindow(token.access_token, itemIds, 14),
    ]);

    const rows = [...current.entries()]
      .map(([key, currentItem]) => {
        const previousItem = previous.get(key);
        const currentVisitCount = visits7d.get(currentItem.itemId) ?? 0;
        const previousVisitCount = Math.max(
          0,
          (visits14d.get(currentItem.itemId) ?? 0) - currentVisitCount,
        );
        const currentConversion =
          currentVisitCount > 0 ? currentItem.units / currentVisitCount : 0;
        const previousConversion =
          previousVisitCount > 0
            ? (previousItem?.units ?? 0) / previousVisitCount
            : 0;
        const item = items.get(currentItem.itemId);
        const sellerSku = item?.attributes?.find(
          (attribute) => attribute.id === "SELLER_SKU",
        )?.value_name;
        return {
          itemId: currentItem.itemId,
          sku: sellerSku ?? item?.seller_custom_field ?? currentItem.sku,
          title: item?.title ?? currentItem.title,
          image: item?.thumbnail ?? null,
          current: {
            units: currentItem.units,
            orders: currentItem.orders.size,
            revenue: round(currentItem.revenue),
            visits: currentVisitCount,
            conversion: round(currentConversion * 100),
          },
          previous: {
            units: previousItem?.units ?? 0,
            orders: previousItem?.orders.size ?? 0,
            revenue: round(previousItem?.revenue ?? 0),
            visits: previousVisitCount,
            conversion: round(previousConversion * 100),
          },
          change: {
            units: percentageChange(currentItem.units, previousItem?.units ?? 0),
            revenue: percentageChange(
              currentItem.revenue,
              previousItem?.revenue ?? 0,
            ),
            visits: percentageChange(currentVisitCount, previousVisitCount),
            conversion: percentageChange(currentConversion, previousConversion),
          },
        };
      })
      .filter((row) => row.current.revenue >= minimumRevenue)
      .filter(
        (row) =>
          (row.change.revenue !== null && row.change.revenue < 0) ||
          (row.change.units !== null && row.change.units < 0),
      )
      .sort(
        (left, right) =>
          (left.change.revenue ?? 0) - (right.change.revenue ?? 0),
      );

    response.setHeader("Set-Cookie", tokenCookie(token.refresh_token));
    response.status(200).json({
      connected: true,
      minimumRevenue,
      currentRange,
      previousRange,
      totalCurrentOrders: currentOrders.length,
      totalPreviousOrders: previousOrders.length,
      items: rows,
    });
  } catch (error) {
    response.status(500).json({
      connected: false,
      message: error instanceof Error ? error.message : "Unexpected error",
    });
  }
}
