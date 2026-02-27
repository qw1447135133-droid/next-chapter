import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandler } from "./lib/global-error-handler";

installGlobalErrorHandler();

createRoot(document.getElementById("root")!).render(<App />);
