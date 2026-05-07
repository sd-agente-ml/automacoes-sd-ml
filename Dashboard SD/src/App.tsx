import { useMemo, useState } from "react";

type AutomationStatus = "ok" | "warn" | "error";

type Automation = {
  name: string;
  status: AutomationStatus;
  label: string;
  lastRun: string;
  owner: string;
};

type Alert = {
  title: string;
  detail: string;
};

const automations: Automation[] = [
  {
    name: "Coleta de dados SD",
    status: "ok",
    label: "Ativa",
    lastRun: "Hoje, 09:12",
    owner: "Operacao",
  },
  {
    name: "Atualizacao ML",
    status: "warn",
    label: "Atencao",
    lastRun: "Hoje, 08:47",
    owner: "Dados",
  },
  {
    name: "Relatorio executivo",
    status: "ok",
    label: "Ativa",
    lastRun: "Ontem, 18:20",
    owner: "Gestao",
  },
  {
    name: "Validacao de entradas",
    status: "error",
    label: "Falha",
    lastRun: "Hoje, 07:30",
    owner: "Suporte",
  },
];

const alerts: Alert[] = [
  {
    title: "Validacao de entradas falhou",
    detail: "Revisar arquivo de origem antes da proxima execucao.",
  },
  {
    title: "Atualizacao ML com atraso",
    detail: "Fila aguardando nova janela de processamento.",
  },
];

const formatUpdateTime = () =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

function App() {
  const [lastUpdated, setLastUpdated] = useState(formatUpdateTime);

  const metrics = useMemo(() => {
    const active = automations.filter((item) => item.status === "ok").length;
    const successRate = Math.round((active / automations.length) * 100);

    return {
      active,
      runsToday: 128,
      successRate,
      alerts: alerts.length,
    };
  }, []);

  return (
    <>
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <span className="brand-mark">SD</span>
          <div>
            <strong>Dashboard SD</strong>
            <small>Automacoes ML</small>
          </div>
        </div>

        <nav className="nav-list">
          <a className="nav-item active" href="#visao-geral">
            Visao geral
          </a>
          <a className="nav-item" href="#automacoes">
            Automacoes
          </a>
          <a className="nav-item" href="#execucoes">
            Execucoes
          </a>
          <a className="nav-item" href="#alertas">
            Alertas
          </a>
        </nav>
      </aside>

      <main className="page" id="visao-geral">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operacao</p>
            <h1>Central de automacoes</h1>
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
            <span>Automacoes ativas</span>
            <strong>{metrics.active}</strong>
            <small>Fluxos monitorados</small>
          </article>
          <article className="metric-card">
            <span>Execucoes hoje</span>
            <strong>{metrics.runsToday}</strong>
            <small>Processos concluidos</small>
          </article>
          <article className="metric-card">
            <span>Taxa de sucesso</span>
            <strong>{metrics.successRate}%</strong>
            <small>Ultimas 24 horas</small>
          </article>
          <article className="metric-card warning">
            <span>Alertas</span>
            <strong>{metrics.alerts}</strong>
            <small>Pendentes de revisao</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel" id="automacoes">
            <div className="panel-heading">
              <h2>Automacoes</h2>
              <span>Atualizado as {lastUpdated}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Status</th>
                    <th>Ultima execucao</th>
                    <th>Responsavel</th>
                  </tr>
                </thead>
                <tbody>
                  {automations.map((item) => (
                    <tr key={item.name}>
                      <td>{item.name}</td>
                      <td>
                        <span className={`status ${item.status}`}>
                          {item.label}
                        </span>
                      </td>
                      <td>{item.lastRun}</td>
                      <td>{item.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="panel" id="alertas">
            <div className="panel-heading">
              <h2>Fila de alertas</h2>
            </div>
            <div className="alert-list">
              {alerts.map((alert) => (
                <article className="alert-item" key={alert.title}>
                  <strong>{alert.title}</strong>
                  <span>{alert.detail}</span>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}

export default App;
