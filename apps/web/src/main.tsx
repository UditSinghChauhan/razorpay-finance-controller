import { StrictMode } from "react";
import { createRoot }  from "react-dom/client";
import { App } from "./App.js";
import { guardIconFont } from "./lib/icon-font.js";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Before the first render, so the verdict on a refused icon font is on :root
// by the time the fonts settle — not after a frame of leaked ligature text.
guardIconFont();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
