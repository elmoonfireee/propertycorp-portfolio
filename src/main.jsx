import React from "react";
import ReactDOM from "react-dom/client";
import { ConsentProvider } from "./consent/ConsentProvider.jsx";
import FinalSite from "./pages/HomePage.jsx";
import "./styles/fonts.css";
import "./styles/consent.css";
import "./styles/map-controls.css";
import "./styles/homepage.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConsentProvider><FinalSite /></ConsentProvider>
  </React.StrictMode>,
);
