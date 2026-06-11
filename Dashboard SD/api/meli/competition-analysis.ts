import type { VercelRequest, VercelResponse } from "@vercel/node";

type RefreshResponse = { access_token: string; refresh_token: string };
type UserResponse = { id: number };
type Order = {
  id: number;
  order_items?: Array<{
    quantity?: number;
    unit_price?: number;
    item?: { id?: string; title?: string; seller_sku?: string | null };
  }>;
};
type OrdersResponse = {
  paging: { total: number; limit: number; offset: number };
  results: Order[];
};
type Attribute = { id?: string; value_name?: string | null };
type Item = {
  id: string;
  title: string;
  thumbnail?: string;
  price: number;
  currency_id?: string;
  category_id?: string;
  permalink?: string;
  seller_id?: number;
  seller_custom_field?: string | null;
  attributes?: Attribute[];
  tags?: string[];
  listing_type_id?: string;
};
type ItemLookupResponse = { code: number; body?: Item };
type SearchResult = Item & {
  promotion_decorations?: unknown;
  sale_price?: { regular_amount?: number; amount?: number };
  organic_position?: number;
};
type SearchResponse = {
  results?: SearchResult[];
};
type HighlightEntry = {
  id?: string;
  type?: string;
  position?: number;
};
type HighlightsResponse =
  | {
      content?: HighlightEntry[];
    }
  | HighlightEntry[];
type ProductResponse = {
  buy_box_winner?: {
    item_id?: string;
  };
};
type ProductOffer = {
  id?: string;
  item_id?: string;
};
type ProductItemsResponse =
  | {
      results?: ProductOffer[];
    }
  | ProductOffer[];
type SalesAggregate = {
  itemId: string;
  sku: string;
  title: string;
  revenue: number;
  units: number;
};

const STOP_WORDS = new Set([
  "a",
  "as",
  "ate",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "kit",
  "o",
  "os",
  "para",
  "por",
  "original",
  "peca",
  "produto",
  "unidade",
]);

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

const lastCompleteDays = (days: number) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const to = new Date(`${today}T12:00:00.000Z`);
  const from = new Date(to);
  to.setUTCDate(to.getUTCDate() - 1);
  from.setUTCDate(from.getUTCDate() - days);
  const fromDate = formatter.format(from);
  const toDate = formatter.format(to);
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

const aggregateSales = (orders: Order[]) => {
  const sales = new Map<string, SalesAggregate>();
  orders.forEach((order) => {
    order.order_items?.forEach((orderItem) => {
      const itemId = orderItem.item?.id;
      if (!itemId) return;
      const existing = sales.get(itemId) ?? {
        itemId,
        sku: orderItem.item?.seller_sku ?? itemId,
        title: orderItem.item?.title ?? itemId,
        revenue: 0,
        units: 0,
      };
      existing.units += orderItem.quantity ?? 0;
      existing.revenue +=
        (orderItem.quantity ?? 0) * (orderItem.unit_price ?? 0);
      sales.set(itemId, existing);
    });
  });
  return [...sales.values()];
};

const fetchItems = async (accessToken: string, itemIds: string[]) => {
  const items = new Map<string, Item>();
  for (let index = 0; index < itemIds.length; index += 20) {
    const url = new URL("https://api.mercadolibre.com/items");
    url.searchParams.set("ids", itemIds.slice(index, index + 20).join(","));
    url.searchParams.set(
      "attributes",
      "id,title,thumbnail,price,currency_id,category_id,permalink,seller_id,seller_custom_field,attributes,tags,listing_type_id",
    );
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) continue;
    const payload = (await response.json()) as ItemLookupResponse[];
    payload.forEach(({ body }) => {
      if (body?.id) items.set(body.id, body);
    });
  }
  return items;
};

const normalize = (value?: string) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const titleTokens = (title: string) =>
  normalize(title)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

const searchTerms = (item: Item) => titleTokens(item.title).slice(0, 7).join(" ");

const attributeMap = (attributes: Attribute[] | undefined) =>
  new Map(
    (attributes ?? [])
      .filter((attribute) => attribute.id && attribute.value_name)
      .map((attribute) => [
        attribute.id as string,
        normalize(attribute.value_name as string),
      ]),
  );

const packageQuantity = (item: Item) => {
  const quantityAttribute = item.attributes?.find((attribute) =>
    ["SALE_FORMAT", "UNITS_PER_PACKAGE", "UNITS_PER_PACK"].includes(
      attribute.id ?? "",
    ),
  )?.value_name;
  const attributeNumber = Number(quantityAttribute?.match(/\d+/)?.[0]);
  if (attributeNumber > 0) return attributeNumber;
  const title = normalize(item.title);
  const kitMatch = title.match(/\b(?:kit|com|c)\s*(\d{1,3})\b/);
  return kitMatch ? Number(kitMatch[1]) : 1;
};

const similarity = (own: Item, competitor: Item) => {
  const ownTokens = new Set(titleTokens(own.title));
  const competitorTokens = new Set(titleTokens(competitor.title));
  const sharedTokens = [...ownTokens].filter((token) =>
    competitorTokens.has(token),
  ).length;
  const titleCoverage = sharedTokens / Math.max(ownTokens.size, 1);
  const ownAttributes = attributeMap(own.attributes);
  const competitorAttributes = attributeMap(competitor.attributes);
  const comparableAttributes = [...ownAttributes.keys()].filter((key) =>
    competitorAttributes.has(key),
  );
  const matchingAttributes = comparableAttributes.filter(
    (key) => ownAttributes.get(key) === competitorAttributes.get(key),
  ).length;
  const attributeScore =
    comparableAttributes.length > 0
      ? matchingAttributes / comparableAttributes.length
      : 0;
  const samePackage = packageQuantity(own) === packageQuantity(competitor);
  const score =
    titleCoverage * 0.7 + attributeScore * 0.2 + (samePackage ? 0.1 : 0);
  return {
    score,
    titleCoverage,
    matchingAttributes,
    comparableAttributes: comparableAttributes.length,
    samePackage,
  };
};

const isSponsored = (item: SearchResult) =>
  Boolean(item.promotion_decorations) ||
  item.tags?.some((tag) => /sponsor|promoted|ads/i.test(tag)) === true;

const resolveHighlightItemId = async (
  accessToken: string,
  entry: HighlightEntry,
) => {
  if (!entry.id) return null;
  if (entry.type === "ITEM") return entry.id;
  if (entry.type !== "PRODUCT") return null;
  const response = await fetch(
    `https://api.mercadolibre.com/products/${entry.id}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  const product = (await response.json()) as ProductResponse;
  if (product.buy_box_winner?.item_id) {
    return product.buy_box_winner.item_id;
  }
  const offersResponse = await fetch(
    `https://api.mercadolibre.com/products/${entry.id}/items`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!offersResponse.ok) return null;
  const offers = (await offersResponse.json()) as ProductItemsResponse;
  const firstOffer = Array.isArray(offers) ? offers[0] : offers.results?.[0];
  return firstOffer?.item_id ?? firstOffer?.id ?? null;
};

const searchCategory = async (accessToken: string, item: Item) => {
  if (!item.category_id) {
    return {
      results: [] as SearchResult[],
      source: "unavailable" as const,
      debug: [],
    };
  }
  const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
  url.searchParams.set("category", item.category_id);
  url.searchParams.set("q", searchTerms(item));
  url.searchParams.set("limit", "20");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.ok) {
    const payload = (await response.json()) as SearchResponse;
    return {
      results: (payload.results ?? []).map((result, index) => ({
        ...result,
        organic_position: index + 1,
      })),
      source: "search" as const,
      debug: [],
    };
  }

  const highlightsResponse = await fetch(
    `https://api.mercadolibre.com/highlights/MLB/category/${item.category_id}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!highlightsResponse.ok) {
    return {
      results: [] as SearchResult[],
      source: "unavailable" as const,
      debug: [],
    };
  }
  const highlights = (await highlightsResponse.json()) as HighlightsResponse;
  const highlightEntries = Array.isArray(highlights)
    ? highlights
    : highlights.content ?? [];
  const rankedEntries = highlightEntries.slice(0, 20);
  const resolvedIds = await Promise.all(
    rankedEntries.map((entry) => resolveHighlightItemId(accessToken, entry)),
  );
  const rankedIds = rankedEntries.flatMap((entry, index) => {
    const id = resolvedIds[index];
    return id ? [{ ...entry, id }] : [];
  });
  const rankedItems = await fetchItems(
    accessToken,
    rankedIds.flatMap((entry) => (entry.id ? [entry.id] : [])),
  );
  const results: SearchResult[] = rankedIds.flatMap((entry, index) => {
      const rankedItem = entry.id ? rankedItems.get(entry.id) : undefined;
      return rankedItem
        ? [
            {
              ...rankedItem,
              organic_position: entry.position ?? index + 1,
            },
          ]
        : [];
    });
  return {
    results,
    source:
      results.length > 0
        ? ("category_highlights" as const)
        : ("unavailable" as const),
    debug: rankedEntries.slice(0, 3).map((entry, index) => ({
      id: entry.id ?? null,
      type: entry.type ?? null,
      position: entry.position ?? null,
      resolvedItemId: resolvedIds[index],
    })),
  };
};

const round = (value: number) => Number(value.toFixed(2));

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
      Number(request.query.minimumRevenue ?? 800) || 800,
    );
    const token = await refreshAccessToken(refreshToken);
    const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userResponse.ok) throw new Error("Nao foi possivel identificar a conta.");
    const user = (await userResponse.json()) as UserResponse;
    const period = lastCompleteDays(30);
    const orders = await fetchOrders(
      token.access_token,
      user.id,
      period.from,
      period.to,
    );
    const sales = aggregateSales(orders)
      .filter((item) => item.revenue >= minimumRevenue)
      .sort((left, right) => right.revenue - left.revenue);
    const ownItems = await fetchItems(
      token.access_token,
      sales.map((item) => item.itemId),
    );

    const analyses = await Promise.all(
      sales.map(async (sale) => {
        const ownItem = ownItems.get(sale.itemId);
        if (!ownItem) return null;
        const ranking = await searchCategory(token.access_token, ownItem);
        const organicResults = ranking.results.filter(
          (item) =>
            typeof item.title === "string" &&
            typeof item.price === "number" &&
            item.price > 0 &&
            !isSponsored(item) &&
            item.seller_id !== user.id,
        );
        const rankedCompetitors = organicResults
          .map((competitor, index) => {
            const match = similarity(ownItem, competitor);
            const ownUnits = packageQuantity(ownItem);
            const competitorUnits = packageQuantity(competitor);
            const ownUnitPrice = ownItem.price / ownUnits;
            const competitorPrice =
              competitor.sale_price?.amount ?? competitor.price;
            const competitorUnitPrice = competitorPrice / competitorUnits;
            const priceDifference =
              ((competitorUnitPrice - ownUnitPrice) / ownUnitPrice) * 100;
            return {
              itemId: competitor.id,
              title: competitor.title,
              image: competitor.thumbnail ?? null,
              position: competitor.organic_position ?? index + 1,
              price: round(competitorPrice),
              unitPrice: round(competitorUnitPrice),
              packageQuantity: competitorUnits,
              priceDifference: round(priceDifference),
              similarity: round(match.score * 100),
              permalink: competitor.permalink ?? null,
              match,
            };
          });
        const competitors = rankedCompetitors
          .filter(
            (competitor) =>
              competitor.match.titleCoverage >= 0.45 &&
              competitor.similarity >= 48 &&
              competitor.priceDifference < -10,
          )
          .map((competitor) => ({
            itemId: competitor.itemId,
            title: competitor.title,
            image: competitor.image,
            position: competitor.position,
            price: competitor.price,
            unitPrice: competitor.unitPrice,
            packageQuantity: competitor.packageQuantity,
            priceDifference: competitor.priceDifference,
            similarity: competitor.similarity,
            permalink: competitor.permalink,
          }))
          .sort((left, right) => left.priceDifference - right.priceDifference);

        return {
          itemId: ownItem.id,
          sku:
            ownItem.attributes?.find(
              (attribute) => attribute.id === "SELLER_SKU",
            )?.value_name ??
            ownItem.seller_custom_field ??
            sale.sku,
          title: ownItem.title,
          image: ownItem.thumbnail ?? null,
          categoryId: ownItem.category_id ?? null,
          revenue30d: round(sale.revenue),
          units30d: sale.units,
          price: round(ownItem.price),
          unitPrice: round(ownItem.price / packageQuantity(ownItem)),
          packageQuantity: packageQuantity(ownItem),
          permalink: ownItem.permalink ?? null,
          rankingSource:
            organicResults.length > 0 ? ranking.source : "unavailable",
          organicResultsAnalyzed: organicResults.length,
          diagnostics: rankedCompetitors
            .slice()
            .sort((left, right) => right.similarity - left.similarity)
            .slice(0, 3)
            .map((competitor) => ({
              title: competitor.title,
              position: competitor.position,
              priceDifference: competitor.priceDifference,
              similarity: competitor.similarity,
              titleCoverage: round(competitor.match.titleCoverage * 100),
            })),
          rankingDebug: ranking.debug,
          competitors,
        };
      }),
    );

    const analyzedItems = analyses.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );
    const items = analyzedItems
      .filter((item) => item.competitors.length > 0);
    const rankingSources = analyzedItems.reduce(
      (totals, item) => {
        totals[item.rankingSource] += 1;
        return totals;
      },
      { search: 0, category_highlights: 0, unavailable: 0 },
    );

    response.setHeader("Set-Cookie", tokenCookie(token.refresh_token));
    response.status(200).json({
      connected: true,
      fromDate: period.fromDate,
      toDate: period.toDate,
      minimumRevenue,
      analyzedProducts: sales.length,
      flaggedProducts: items.length,
      rankingSources,
      ...(request.query.debug === "1"
        ? {
            diagnostics: analyzedItems.map((item) => ({
              sku: item.sku,
              title: item.title,
              rankingSource: item.rankingSource,
              organicResultsAnalyzed: item.organicResultsAnalyzed,
              rankingDebug: item.rankingDebug,
              candidates: item.diagnostics,
            })),
          }
        : {}),
      items,
    });
  } catch (error) {
    response.status(500).json({
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "Nao foi possivel analisar a concorrencia.",
    });
  }
}
