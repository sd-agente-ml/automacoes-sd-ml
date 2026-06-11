import { useEffect, useState } from "react";

type ConnectionStatus = {
  connected: boolean;
  nickname?: string;
  siteId?: string;
  id?: number;
  message?: string;
};

type DailySummary = {
  connected: boolean;
  date: string;
  orders: number;
  revenue: number;
  currencyId: string;
  topSkus?: Array<{
    sku: string;
    image: string | null;
    units: number;
  }>;
  shippingBreakdown?: Record<
    "flex" | "full" | "mercadoEnvios",
    {
      orders: number;
      revenue: number;
    }
  >;
  message?: string;
};

type AdsSummary = {
  connected: boolean;
  date: string;
  acos: number;
  investment: number;
  currencyId: string;
  message?: string;
};

type ActiveView =
  | "overview"
  | "metrics"
  | "competition"
  | "purchases"
  | "catalogs"
  | "integration";

type PerformancePeriod = 7 | 30;

type PerformanceMetricSet = {
  units: number;
  orders: number;
  revenue: number;
  visits: number;
  conversion: number;
};

type PerformanceItem = {
  itemId: string;
  sku: string;
  title: string;
  image: string | null;
  current: PerformanceMetricSet;
  previous: PerformanceMetricSet;
  change: {
    units: number | null;
    revenue: number | null;
    visits: number | null;
    conversion: number | null;
  };
};

type PerformanceResponse = {
  connected: boolean;
  days: PerformancePeriod;
  minimumRevenue: number;
  visitsAvailable: boolean;
  currentRange: { fromDate: string; toDate: string };
  previousRange: { fromDate: string; toDate: string };
  totalCurrentOrders: number;
  totalPreviousOrders: number;
  items: PerformanceItem[];
  message?: string;
};

type CompetitionItem = {
  itemId: string;
  sku: string;
  title: string;
  image: string | null;
  categoryId: string | null;
  revenue30d: number;
  units30d: number;
  price: number;
  unitPrice: number;
  packageQuantity: number;
  permalink: string | null;
  organicResultsAnalyzed: number;
  rankingSource: "search" | "category_highlights" | "unavailable";
  competitors: Array<{
    itemId: string;
    title: string;
    image: string | null;
    position: number;
    price: number;
    unitPrice: number;
    packageQuantity: number;
    priceDifference: number;
    similarity: number;
    permalink: string | null;
  }>;
};

type CompetitionResponse = {
  connected: boolean;
  fromDate: string;
  toDate: string;
  minimumRevenue: number;
  analyzedProducts: number;
  flaggedProducts: number;
  rankingSources: {
    search: number;
    category_highlights: number;
    unavailable: number;
  };
  items: CompetitionItem[];
  message?: string;
};

type PurchaseSuggestion = {
  sku: string;
  title: string;
  image: string | null;
  unitsSold30d: number;
  currentStock: number;
  targetStock: number;
  suggestedPurchase: number;
};

type PurchaseSuggestionsResponse = {
  connected: boolean;
  fromDate: string;
  toDate: string;
  suggestions: PurchaseSuggestion[];
  message?: string;
};

type CatalogItem = {
  id: string;
  image: string | null;
  sku: string;
  title: string;
  currentPrice: number;
  currencyId: string;
  status: "winning" | "competing" | "sharing_first_place" | "listed" | "unknown";
  statusLabel: string;
  priceToWin: number | null;
  visits60d: number;
};

type CatalogsResponse = {
  connected: boolean;
  fromDate: string;
  toDate: string;
  items: CatalogItem[];
  message?: string;
};

const formatUpdateTime = () =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

function App() {
  const [activeView, setActiveView] = useState<ActiveView>("overview");
  const [lastUpdated, setLastUpdated] = useState(formatUpdateTime);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [adsSummary, setAdsSummary] = useState<AdsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [purchaseData, setPurchaseData] =
    useState<PurchaseSuggestionsResponse | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [catalogData, setCatalogData] = useState<CatalogsResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [performancePeriod, setPerformancePeriod] =
    useState<PerformancePeriod>(7);
  const [performanceData, setPerformanceData] =
    useState<PerformanceResponse | null>(null);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [competitionData, setCompetitionData] =
    useState<CompetitionResponse | null>(null);
  const [competitionError, setCompetitionError] = useState<string | null>(null);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);
  const [isLoadingPerformance, setIsLoadingPerformance] = useState(false);
  const [isLoadingCompetition, setIsLoadingCompetition] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingAds, setIsLoadingAds] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const formattedRevenue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: dailySummary?.currencyId ?? "BRL",
    maximumFractionDigits: 0,
  }).format(dailySummary?.revenue ?? 0);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: dailySummary?.currencyId ?? "BRL",
      maximumFractionDigits: 0,
    }).format(value);

  const formatAdsCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: adsSummary?.currencyId ?? dailySummary?.currencyId ?? "BRL",
      maximumFractionDigits: 0,
    }).format(value);

  const formatItemCurrency = (value: number, currency: string) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);

  const formattedAcos = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(adsSummary?.acos ?? 0);

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("pt-BR").format(
      new Date(`${value}T12:00:00.000Z`),
    );

  const formatChange = (value: number | null) =>
    value === null
      ? "Sem comparativo"
      : `${value > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }).format(value)}%`;

  const performancePriority = (change: number | null) => {
    if (change !== null && change <= -40) {
      return { label: "Critica", className: "critical" };
    }
    if (change !== null && change <= -20) {
      return { label: "Atencao", className: "attention" };
    }
    return { label: "Monitorar", className: "monitor" };
  };

  const shippingCards = [
    {
      title: "Flex ontem",
      key: "flex" as const,
    },
    {
      title: "Full ontem",
      key: "full" as const,
    },
    {
      title: "Mercado Envios ontem",
      key: "mercadoEnvios" as const,
    },
  ];

  useEffect(() => {
    fetch("/api/meli/daily-summary")
      .then(async (response) => {
        const payload = (await response.json()) as DailySummary;

        if (!response.ok || !payload.connected) {
          throw new Error(payload.message ?? "Resumo Mercado Livre indisponivel.");
        }

        setDailySummary(payload);
      })
      .catch((error: Error) => {
        setSummaryError(error.message);
      })
      .finally(() => {
        setIsLoadingSummary(false);
      });
  }, []);

  useEffect(() => {
    fetch("/api/meli/ads-summary")
      .then(async (response) => {
        const payload = (await response.json()) as AdsSummary;

        if (!response.ok || !payload.connected) {
          throw new Error(payload.message ?? "Publicidade indisponivel.");
        }

        setAdsSummary(payload);
      })
      .catch((error: Error) => {
        setAdsError(error.message);
      })
      .finally(() => {
        setIsLoadingAds(false);
      });
  }, []);

  const loadPurchaseSuggestions = () => {
    if (purchaseData || isLoadingPurchases) {
      return;
    }

    setIsLoadingPurchases(true);
    fetch("/api/meli/purchase-suggestions")
      .then(async (response) => {
        const payload = (await response.json()) as PurchaseSuggestionsResponse;

        if (!response.ok || !payload.connected) {
          throw new Error(payload.message ?? "Sugestoes de compra indisponiveis.");
        }

        setPurchaseData(payload);
      })
      .catch((error: Error) => {
        setPurchaseError(error.message);
      })
      .finally(() => {
        setIsLoadingPurchases(false);
      });
  };

  const loadCatalogs = () => {
    if (catalogData || isLoadingCatalogs) {
      return;
    }

    setIsLoadingCatalogs(true);
    fetch("/api/meli/catalogs")
      .then(async (response) => {
        const payload = (await response.json()) as CatalogsResponse;

        if (!response.ok || !payload.connected) {
          throw new Error(payload.message ?? "Catalogos indisponiveis.");
        }

        setCatalogData(payload);
      })
      .catch((error: Error) => {
        setCatalogError(error.message);
      })
      .finally(() => {
        setIsLoadingCatalogs(false);
      });
  };

  const loadPerformance = async (
    days: PerformancePeriod = performancePeriod,
  ) => {
    if (isLoadingPerformance) {
      return;
    }

    setIsLoadingPerformance(true);
    setPerformanceError(null);
    try {
      const response = await fetch(
        `/api/meli/listing-performance?days=${days}&minimumRevenue=100`,
      );
      const payload = (await response.json()) as PerformanceResponse;

      if (!response.ok || !payload.connected) {
        throw new Error(payload.message ?? "Metricas indisponiveis.");
      }

      setPerformanceData(payload);
      setLastUpdated(formatUpdateTime());
    } catch (error) {
      setPerformanceError(
        error instanceof Error ? error.message : "Metricas indisponiveis.",
      );
    } finally {
      setIsLoadingPerformance(false);
    }
  };

  const selectPerformancePeriod = (days: PerformancePeriod) => {
    setPerformancePeriod(days);
    setPerformanceData(null);
    void loadPerformance(days);
  };

  const loadCompetition = async () => {
    if (isLoadingCompetition) {
      return;
    }

    setIsLoadingCompetition(true);
    setCompetitionError(null);
    try {
      const response = await fetch(
        "/api/meli/competition-analysis?minimumRevenue=800",
      );
      const payload = (await response.json()) as CompetitionResponse;

      if (!response.ok || !payload.connected) {
        throw new Error(payload.message ?? "Analise de concorrencia indisponivel.");
      }

      setCompetitionData(payload);
      setLastUpdated(formatUpdateTime());
    } catch (error) {
      setCompetitionError(
        error instanceof Error
          ? error.message
          : "Analise de concorrencia indisponivel.",
      );
    } finally {
      setIsLoadingCompetition(false);
    }
  };

  const startMercadoLivreAuth = async () => {
    const response = await fetch("/api/meli/auth-url");
    const payload = (await response.json()) as { authUrl: string };
    window.location.href = payload.authUrl;
  };

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const response = await fetch("/api/meli/me");
      const payload = (await response.json()) as ConnectionStatus;
      setConnection(payload);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <>
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <span className="brand-mark">ML</span>
          <div>
            <strong>Operacao Mercado Livre</strong>
            <small>Dashboard SD</small>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={`nav-item ${activeView === "overview" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("overview")}
          >
            Visao geral
          </button>
          <button
            className={`nav-item ${activeView === "metrics" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setActiveView("metrics");
              if (!performanceData) {
                void loadPerformance();
              }
            }}
          >
            Metricas
          </button>
          <button
            className={`nav-item ${
              activeView === "competition" ? "active" : ""
            }`}
            type="button"
            onClick={() => {
              setActiveView("competition");
              if (!competitionData) {
                void loadCompetition();
              }
            }}
          >
            Concorrencia
          </button>
          <button
            className={`nav-item ${activeView === "purchases" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setActiveView("purchases");
              loadPurchaseSuggestions();
            }}
          >
            Compras
          </button>
          <button
            className={`nav-item ${activeView === "catalogs" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setActiveView("catalogs");
              loadCatalogs();
            }}
          >
            Catálogos
          </button>
          <button
            className={`nav-item ${activeView === "integration" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("integration")}
          >
            Integracao ML
          </button>
        </nav>
      </aside>

      <main className="page">
        <header className="topbar">
          <div>
            <p className="eyebrow">Mercado Livre</p>
            <h1>
              {activeView === "overview"
                ? "Painel diario da operacao"
                : activeView === "metrics"
                  ? "Metricas dos anuncios"
                  : activeView === "competition"
                    ? "Analise de concorrencia"
                    : activeView === "purchases"
                      ? "Sugestao de compras"
                      : activeView === "catalogs"
                        ? "Competicao de catalogos"
                        : "Integracao Mercado Livre"}
            </h1>
            <p className="subtitle">
              {activeView === "overview"
                ? "Pedidos, faturamento e principais SKUs vendidos no dia anterior."
                : activeView === "metrics"
                  ? "Anuncios com queda e faturamento minimo de R$ 100 no periodo selecionado."
                  : activeView === "competition"
                    ? "Concorrentes organicos relevantes com preco por unidade mais de 10% abaixo."
                    : activeView === "purchases"
                      ? "Reposicao sugerida para cada SKU com base nos ultimos 30 dias completos."
                      : activeView === "catalogs"
                        ? "Anuncios de catalogo com visitas nos ultimos 60 dias, ordenados por status de competicao."
                        : "Conexao da conta usada para carregar os dados reais do dashboard."}
            </p>
          </div>
          {activeView === "overview" ||
          activeView === "metrics" ||
          activeView === "competition" ? (
            <button
              className="primary-action"
              type="button"
              disabled={
                (activeView === "metrics" && isLoadingPerformance) ||
                (activeView === "competition" && isLoadingCompetition)
              }
              onClick={() => {
                if (activeView === "metrics") {
                  void loadPerformance();
                  return;
                }
                if (activeView === "competition") {
                  void loadCompetition();
                  return;
                }
                setLastUpdated(formatUpdateTime());
              }}
            >
              {(activeView === "metrics" && isLoadingPerformance) ||
              (activeView === "competition" && isLoadingCompetition)
                ? "Atualizando"
                : "Atualizar"}
            </button>
          ) : null}
        </header>

        {activeView === "overview" ? (
          <>
            <p className="last-updated">Atualizado as {lastUpdated}</p>
            <section className="metrics-grid" aria-label="Indicadores principais">
              <article className="metric-card">
                <span>Pedidos ontem</span>
                <strong>{isLoadingSummary ? "..." : dailySummary?.orders ?? 0}</strong>
                <small>
                  {dailySummary?.connected
                    ? `Pedidos pagos em ${dailySummary.date}`
                    : summaryError ?? "Pagos e em processamento"}
                </small>
              </article>
              <article className="metric-card">
                <span>Faturamento ontem</span>
                <strong>{isLoadingSummary ? "..." : formattedRevenue}</strong>
                <small>
                  {dailySummary?.connected
                    ? `${dailySummary.orders} pedidos pagos em ${dailySummary.date}`
                    : summaryError ?? "Receita bruta estimada"}
                </small>
              </article>
              {shippingCards.map((card) => {
                const summary = dailySummary?.shippingBreakdown?.[card.key];

                return (
                  <article className="metric-card" key={card.key}>
                    <span>{card.title}</span>
                    <strong>
                      {isLoadingSummary
                        ? "..."
                        : formatCurrency(summary?.revenue ?? 0)}
                    </strong>
                    <small>{summary?.orders ?? 0} pedidos pagos</small>
                  </article>
                );
              })}
              <article className="metric-card">
                <span>ACOS Product Ads ontem</span>
                <strong>{isLoadingAds ? "..." : `${formattedAcos}%`}</strong>
                <small>
                  {adsSummary?.connected
                    ? `${formatAdsCurrency(adsSummary.investment)} investidos em ${adsSummary.date}`
                    : adsError ?? "Investimento de publicidade"}
                </small>
              </article>
            </section>

            <section className="wide-panel panel" id="top-skus">
              <div className="panel-heading">
                <h2>Top 10 SKUs ontem</h2>
                <span>Unidades vendidas no dia anterior</span>
              </div>
              <div className="sku-grid">
                {(dailySummary?.topSkus ?? []).length > 0 ? (
                  dailySummary?.topSkus?.map((item) => (
                    <article className="sku-item" key={item.sku}>
                      <div className="sku-image">
                        {item.image ? (
                          <img src={item.image} alt="" loading="lazy" />
                        ) : (
                          <span>Sem imagem</span>
                        )}
                      </div>
                      <strong>{item.sku}</strong>
                      <span>{item.units} un vendidas</span>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">
                    {isLoadingSummary
                      ? "Carregando SKUs..."
                      : "Nenhum SKU vendido ontem ou conta ainda nao conectada."}
                  </p>
                )}
              </div>
            </section>
          </>
        ) : activeView === "metrics" ? (
          <>
            <section className="metrics-toolbar" aria-label="Periodo do relatorio">
              <div>
                <strong>Periodo analisado</strong>
                <span>
                  Comparacao com os {performancePeriod} dias imediatamente
                  anteriores
                </span>
              </div>
              <div className="period-control" role="group" aria-label="Periodo">
                {([7, 30] as PerformancePeriod[]).map((days) => (
                  <button
                    className={`period-option ${
                      performancePeriod === days ? "active" : ""
                    }`}
                    type="button"
                    key={days}
                    disabled={isLoadingPerformance}
                    onClick={() => selectPerformancePeriod(days)}
                  >
                    Ultimos {days} dias
                  </button>
                ))}
              </div>
            </section>

            {performanceData ? (
              <section className="performance-summary" aria-label="Resumo">
                <div>
                  <span>Periodo atual</span>
                  <strong>
                    {formatDate(performanceData.currentRange.fromDate)} a{" "}
                    {formatDate(performanceData.currentRange.toDate)}
                  </strong>
                </div>
                <div>
                  <span>Pedidos no periodo</span>
                  <strong>{performanceData.totalCurrentOrders}</strong>
                  <small>
                    {performanceData.totalPreviousOrders} no periodo anterior
                  </small>
                </div>
                <div>
                  <span>Anuncios em destaque</span>
                  <strong>{performanceData.items.length}</strong>
                  <small>Com queda e faturamento acima de R$ 100</small>
                </div>
              </section>
            ) : null}

            {performanceData && !performanceData.visitsAvailable ? (
              <p className="api-note">
                Visitas e conversao nao estao disponiveis pela API do Mercado
                Livre para esta conta. O relatorio usa vendas, unidades e
                faturamento.
              </p>
            ) : null}

            <section className="wide-panel panel performance-panel">
              <div className="panel-heading">
                <h2>Produtos que exigem atencao</h2>
                <span>
                  {performanceData
                    ? `Comparado com ${formatDate(
                        performanceData.previousRange.fromDate,
                      )} a ${formatDate(performanceData.previousRange.toDate)}`
                    : `Base: ultimos ${performancePeriod} dias completos`}
                </span>
              </div>
              <div className="purchase-table-wrap">
                <table className="purchase-table performance-table">
                  <thead>
                    <tr>
                      <th>Imagem</th>
                      <th>SKU / Produto</th>
                      <th>Faturamento</th>
                      <th>Periodo anterior</th>
                      <th>Variacao</th>
                      <th>Unidades</th>
                      <th>Prioridade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceData?.items.map((item) => {
                      const priority = performancePriority(item.change.revenue);

                      return (
                        <tr key={item.itemId}>
                          <td>
                            <div className="purchase-image">
                              {item.image ? (
                                <img src={item.image} alt="" loading="lazy" />
                              ) : (
                                <span>Sem imagem</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <strong>{item.sku}</strong>
                            <span>{item.title}</span>
                            <small>{item.itemId}</small>
                          </td>
                          <td>{formatItemCurrency(item.current.revenue, "BRL")}</td>
                          <td>
                            {formatItemCurrency(item.previous.revenue, "BRL")}
                          </td>
                          <td>
                            <strong className="negative-change">
                              {formatChange(item.change.revenue)}
                            </strong>
                          </td>
                          <td>
                            <strong>{item.current.units}</strong>
                            <span>{item.previous.units} anteriormente</span>
                          </td>
                          <td>
                            <span
                              className={`priority-badge ${priority.className}`}
                            >
                              {priority.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {isLoadingPerformance || !performanceData?.items.length ? (
                  <p className="empty-state purchase-empty">
                    {isLoadingPerformance
                      ? `Analisando os ultimos ${performancePeriod} dias...`
                      : performanceError ??
                        "Nenhum anuncio com queda e faturamento minimo de R$ 100 no periodo."}
                  </p>
                ) : null}
              </div>
            </section>
          </>
        ) : activeView === "competition" ? (
          <>
            {competitionData ? (
              <section className="performance-summary" aria-label="Resumo">
                <div>
                  <span>Periodo de faturamento</span>
                  <strong>
                    {formatDate(competitionData.fromDate)} a{" "}
                    {formatDate(competitionData.toDate)}
                  </strong>
                </div>
                <div>
                  <span>Produtos analisados</span>
                  <strong>{competitionData.analyzedProducts}</strong>
                  <small>Faturamento acima de R$ 800 em 30 dias</small>
                </div>
                <div>
                  <span>Produtos com alerta</span>
                  <strong>{competitionData.flaggedProducts}</strong>
                  <small>Concorrente relevante mais de 10% abaixo</small>
                </div>
              </section>
            ) : null}

            <p className="api-note competition-note">
              A posicao usa a busca organica autenticada quando disponivel e o
              ranking oficial da categoria como alternativa. Anuncios
              patrocinados e produtos sem similaridade relevante sao
              ignorados.
            </p>

            {competitionData?.rankingSources.unavailable ? (
              <p className="api-note">
                O Mercado Livre nao liberou uma fonte de ranking para{" "}
                {competitionData.rankingSources.unavailable} produtos. Eles nao
                foram tratados como produtos sem concorrencia.
              </p>
            ) : null}

            <div className="competition-list">
              {competitionData?.items.map((item) => (
                <section className="panel competition-product" key={item.itemId}>
                  <div className="competition-product-heading">
                    <div className="competition-own-image">
                      {item.image ? (
                        <img src={item.image} alt="" loading="lazy" />
                      ) : (
                        <span>Sem imagem</span>
                      )}
                    </div>
                    <div className="competition-product-title">
                      <span>{item.sku}</span>
                      <h2>{item.title}</h2>
                      <small>
                        {item.categoryId} · {item.organicResultsAnalyzed} posicoes
                        organicas analisadas ·{" "}
                        {item.rankingSource === "search"
                          ? "Busca organica"
                          : "Ranking da categoria"}
                      </small>
                    </div>
                    <div className="competition-own-metrics">
                      <div>
                        <span>Seu preco</span>
                        <strong>{formatItemCurrency(item.price, "BRL")}</strong>
                        {item.packageQuantity > 1 ? (
                          <small>
                            {formatItemCurrency(item.unitPrice, "BRL")} por
                            unidade
                          </small>
                        ) : null}
                      </div>
                      <div>
                        <span>Faturamento 30d</span>
                        <strong>
                          {formatItemCurrency(item.revenue30d, "BRL")}
                        </strong>
                        <small>{item.units30d} unidades vendidas</small>
                      </div>
                    </div>
                  </div>

                  <div className="purchase-table-wrap">
                    <table className="purchase-table competition-table">
                      <thead>
                        <tr>
                          <th>Posicao</th>
                          <th>Concorrente</th>
                          <th>Preco</th>
                          <th>Preco por unidade</th>
                          <th>Diferenca</th>
                          <th>Similaridade</th>
                          <th>Anuncio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.competitors.map((competitor) => (
                          <tr key={competitor.itemId}>
                            <td>
                              <strong>#{competitor.position}</strong>
                            </td>
                            <td>
                              <div className="competitor-identity">
                                <div className="competitor-image">
                                  {competitor.image ? (
                                    <img
                                      src={competitor.image}
                                      alt=""
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span>Sem imagem</span>
                                  )}
                                </div>
                                <div>
                                  <strong>{competitor.title}</strong>
                                  <span>{competitor.itemId}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              {formatItemCurrency(competitor.price, "BRL")}
                            </td>
                            <td>
                              {formatItemCurrency(competitor.unitPrice, "BRL")}
                              {competitor.packageQuantity > 1 ? (
                                <span>
                                  Kit com {competitor.packageQuantity} unidades
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <strong className="negative-change">
                                {formatChange(competitor.priceDifference)}
                              </strong>
                            </td>
                            <td>{competitor.similarity}%</td>
                            <td>
                              {competitor.permalink ? (
                                <a
                                  className="table-link"
                                  href={competitor.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Abrir
                                </a>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>

            {isLoadingCompetition || !competitionData?.items.length ? (
              <section className="panel competition-empty">
                <p className="empty-state">
                  {isLoadingCompetition
                    ? "Analisando produtos, categorias e ranking organico..."
                    : competitionData &&
                        competitionData.rankingSources.unavailable ===
                          competitionData.analyzedProducts
                      ? "O Mercado Livre nao liberou o ranking organico dos produtos para esta aplicacao. Nenhum resultado foi classificado como ausencia de concorrencia."
                    : competitionError ??
                      "Nenhum concorrente relevante mais de 10% abaixo foi encontrado."}
                </p>
              </section>
            ) : null}
          </>
        ) : activeView === "purchases" ? (
          <section className="wide-panel panel">
            <div className="panel-heading">
              <h2>Compras sugeridas</h2>
              <span>
                {purchaseData
                  ? `${purchaseData.fromDate} a ${purchaseData.toDate}`
                  : "Base: ultimos 30 dias completos"}
              </span>
            </div>
            <div className="purchase-table-wrap">
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th>Imagem</th>
                    <th>SKU</th>
                    <th>Vendas 30d</th>
                    <th>Estoque ML</th>
                    <th>Estoque alvo</th>
                    <th>Sugestao compra</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseData?.suggestions.map((item) => (
                    <tr key={`${item.sku}-${item.title}`}>
                      <td>
                        <div className="purchase-image">
                          {item.image ? (
                            <img src={item.image} alt="" loading="lazy" />
                          ) : (
                            <span>Sem imagem</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>{item.sku}</strong>
                        <span>{item.title}</span>
                      </td>
                      <td>{item.unitsSold30d}</td>
                      <td>{item.currentStock}</td>
                      <td>{item.targetStock}</td>
                      <td>
                        <strong>{item.suggestedPurchase}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isLoadingPurchases || !purchaseData?.suggestions.length ? (
                <p className="empty-state purchase-empty">
                  {isLoadingPurchases
                    ? "Calculando sugestoes..."
                    : purchaseError ??
                      "Nenhuma venda encontrada nos ultimos 30 dias completos."}
                </p>
              ) : null}
            </div>
          </section>
        ) : activeView === "catalogs" ? (
          <section className="wide-panel panel">
            <div className="panel-heading">
              <h2>Catálogos em competição</h2>
              <span>
                {catalogData
                  ? `${catalogData.fromDate} a ${catalogData.toDate}`
                  : "Base: visitas dos ultimos 60 dias"}
              </span>
            </div>
            <div className="purchase-table-wrap">
              <table className="purchase-table catalog-table">
                <thead>
                  <tr>
                    <th>Imagem</th>
                    <th>SKU</th>
                    <th>Titulo</th>
                    <th>Preco atual</th>
                    <th>Status</th>
                    <th>Preco para ganhar</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogData?.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="purchase-image">
                          {item.image ? (
                            <img src={item.image} alt="" loading="lazy" />
                          ) : (
                            <span>Sem imagem</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>{item.sku}</strong>
                        <span>{item.visits60d} visitas em 60d</span>
                      </td>
                      <td>{item.title}</td>
                      <td>{formatItemCurrency(item.currentPrice, item.currencyId)}</td>
                      <td>
                        <span className={`status-pill ${item.status}`}>
                          {item.statusLabel}
                        </span>
                      </td>
                      <td>
                        {item.priceToWin === null
                          ? "-"
                          : formatItemCurrency(item.priceToWin, item.currencyId)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isLoadingCatalogs || !catalogData?.items.length ? (
                <p className="empty-state purchase-empty">
                  {isLoadingCatalogs
                    ? "Mapeando catalogos..."
                    : catalogError ??
                      "Nenhum catalogo com visitas nos ultimos 60 dias."}
                </p>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="connection-panel panel">
            <div>
              <p className="eyebrow">Integracao</p>
              <h2>Conta Mercado Livre</h2>
              <p>
                Conecte a conta para trocar os indicadores mockados por dados
                reais da operacao.
              </p>
            </div>
            <div className="connection-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={checkConnection}
                disabled={isChecking}
              >
                {isChecking ? "Verificando" : "Verificar conexao"}
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={startMercadoLivreAuth}
              >
                Conectar Mercado Livre
              </button>
            </div>
            {connection ? (
              <div className={connection.connected ? "notice ok" : "notice warn"}>
                {connection.connected
                  ? `Conectado: ${connection.nickname} (${connection.siteId})`
                  : connection.message}
              </div>
            ) : null}
          </section>
        )}
      </main>
    </>
  );
}

export default App;
