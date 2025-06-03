import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; // du kan skapa denna för Tailwind eller lämna bort

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);