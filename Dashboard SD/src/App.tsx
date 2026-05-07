import { useMemo, useState } from "react";

type OrderStatus = "ok" | "warn" | "error";

type OperationRow = {
  channel: string;
  status: OrderStatus;
  label: string;
  orders: number;
  revenue: number;
  sla: string;
  owner: string;
};

type Alert = {
  title: string;
  detail: string;
  level: "Atencao" | "Critico";
};

type FunnelStage = {
  label: string;
  value: number;
  target: number;
};

const operationRows: OperationRow[] = [
  {
    channel: "Full",
    status: "ok",
    label: "No prazo",
    orders: 284,
    revenue: 87240,
    sla: "98,4%",
    owner: "Logistica",
  },
  {
    channel: "Flex",
    status: "warn",
    label: "Fila alta",
    orders: 126,
    revenue: 38910,
    sla: "91,2%",
    owner: "Expedicao",
  },
  {
    channel: "Coleta",
    status: "ok",
    label: "Estavel",
    orders: 74,
    revenue: 22180,
    sla: "96,8%",
    owner: "Operacao",
  },
  {
    channel: "Pendencias",
    status: "error",
    label: "Revisar",
    orders: 18,
    revenue: 6420,
    sla: "76,5%",
    owner: "Atendimento",
  },
];

const alerts: Alert[] = [
  {
    title: "Pedidos Flex perto do limite de corte",
    detail: "126 pedidos aguardam separacao antes da proxima janela.",
    level: "Atencao",
  },
  {
    title: "18 pedidos com pendencia operacional",
    detail: "Priorizar NF, etiqueta ou resposta ao comprador.",
    level: "Critico",
  },
  {
    title: "Reputacao em observacao",
    detail: "Atrasos de envio podem afetar a barra de qualidade.",
    level: "Atencao",
  },
];

const funnel: FunnelStage[] = [
  { label: "Visitas", value: 18420, target: 20000 },
  { label: "Carrinhos", value: 1290, target: 1500 },
  { label: "Pedidos pagos", value: 502, target: 560 },
  { label: "Enviados", value: 466, target: 520 },
];

const formatUpdateTime = () =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

function App() {
  const [lastUpdated, setLastUpdated] = useState(formatUpdateTime);

  const metrics = useMemo(() => {
    const totalOrders = operationRows.reduce((sum, item) => sum + item.orders, 0);
    const revenue = operationRows.reduce((sum, item) => sum + item.revenue, 0);
    const sentOrders = funnel.find((item) => item.label === "Enviados")?.value ?? 0;
    const paidOrders =
      funnel.find((item) => item.label === "Pedidos pagos")?.value ?? 1;
    const shippingRate = Math.round((sentOrders / paidOrders) * 100);

    return {
      totalOrders,
      revenue,
      shippingRate,
      alerts: alerts.length,
    };
  }, []);

  const formattedRevenue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(metrics.revenue);

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
          <a className="nav-item active" href="#visao-geral">
            Visao geral
          </a>
          <a className="nav-item" href="#pedidos">
            Pedidos
          </a>
          <a className="nav-item" href="#funil">
            Funil
          </a>
          <a className="nav-item" href="#alertas">
            Alertas
          </a>
        </nav>
      </aside>

      <main className="page" id="visao-geral">
        <header className="topbar">
          <div>
            <p className="eyebrow">Mercado Livre</p>
            <h1>Painel diario da operacao</h1>
            <p className="subtitle">
              Pedidos, receita, SLA de envio e pontos de atencao em uma visao
              unica.
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={() => setLastUpdated(formatUpdateTime())}
          >
            Atualizar
          </button>
        </header>

        <section className="metrics-grid" aria-label="Indicadores principais">
          <article className="metric-card">
            <span>Pedidos hoje</span>
            <strong>{metrics.totalOrders}</strong>
            <small>Pagos e em processamento</small>
          </article>
          <article className="metric-card">
            <span>Faturamento</span>
            <strong>{formattedRevenue}</strong>
            <small>Receita bruta estimada</small>
          </article>
          <article className="metric-card">
            <span>Pedidos enviados</span>
            <strong>{metrics.shippingRate}%</strong>
            <small>Sobre pedidos pagos</small>
          </article>
          <article className="metric-card warning">
            <span>Alertas abertos</span>
            <strong>{metrics.alerts}</strong>
            <small>Precisam de acao</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel" id="pedidos">
            <div className="panel-heading">
              <h2>Operacao por canal</h2>
              <span>Atualizado as {lastUpdated}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Status</th>
                    <th>Pedidos</th>
                    <th>Receita</th>
                    <th>SLA</th>
                    <th>Responsavel</th>
                  </tr>
                </thead>
                <tbody>
                  {operationRows.map((item) => (
                    <tr key={item.channel}>
                      <td>{item.channel}</td>
                      <td>
                        <span className={`status ${item.status}`}>
                          {item.label}
                        </span>
                      </td>
                      <td>{item.orders}</td>
                      <td>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        }).format(item.revenue)}
                      </td>
                      <td>{item.sla}</td>
                      <td>{item.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="panel" id="funil">
            <div className="panel-heading">
              <h2>Funil comercial</h2>
            </div>
            <div className="funnel-list">
              {funnel.map((stage) => (
                <article className="funnel-item" key={stage.label}>
                  <div>
                    <strong>{stage.label}</strong>
                    <span>
                      {stage.value.toLocaleString("pt-BR")} de{" "}
                      {stage.target.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div
                    className="progress"
                    aria-label={`${stage.label}: ${stage.value} de ${stage.target}`}
                  >
                    <span
                      style={{
                        width: `${Math.min(
                          Math.round((stage.value / stage.target) * 100),
                          100,
                        )}%`,
                      }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="wide-panel panel" id="alertas">
          <div className="panel-heading">
            <h2>Alertas operacionais</h2>
            <span>Prioridade do dia</span>
          </div>
          <div className="alert-list">
            {alerts.map((alert) => (
              <article className="alert-item" key={alert.title}>
                <span className="alert-level">{alert.level}</span>
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

export default App;
