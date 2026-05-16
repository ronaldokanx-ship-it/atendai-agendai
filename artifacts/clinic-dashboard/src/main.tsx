import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Em produção (Vercel), VITE_API_URL aponta para a VM Oracle.
// Em desenvolvimento, fica vazio e o proxy do Vite intercepta /api/*.
const apiUrl = import.meta.env.VITE_API_URL ?? "";
if (apiUrl) {
  setBaseUrl(apiUrl);
}

setAuthTokenGetter(() => localStorage.getItem("clinic_token"));

createRoot(document.getElementById("root")!).render(<App />);
