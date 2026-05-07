import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AuthCallback from "./AuthCallback";
import "./styles.css";

const Component = window.location.pathname === "/auth/callback" ? AuthCallback : App;

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <Component />
  </StrictMode>,
);
