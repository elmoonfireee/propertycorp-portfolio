import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { createSiteEditionConfig } from "./src/config/siteEdition.js";

export default defineConfig(({ mode }) => {
  const loadedEnvironment = loadEnv(mode, process.cwd(), "");
  const editionConfig = createSiteEditionConfig(process.env.VITE_SITE_EDITION ?? loadedEnvironment.VITE_SITE_EDITION);
  const offersRepository = process.env.VITE_OFFERS_REPOSITORY ?? loadedEnvironment.VITE_OFFERS_REPOSITORY ?? "local";
  if (!["local", "runtime"].includes(offersRepository)) {
    throw new Error(`Invalid VITE_OFFERS_REPOSITORY value "${offersRepository}". Use "local" or "runtime".`);
  }
  const offersRepositoryFile = offersRepository === "runtime" ? "runtimeOfferRepository.js" : "localSnapshotRepository.js";

  return {
    plugins: [
      react(),
      {
        name: "propertycorp-portfolio-noindex",
        transformIndexHtml(html) {
          return editionConfig.noIndex
            ? html.replace("<head>", '<head>\n    <meta name="robots" content="noindex,nofollow" />')
            : html;
        },
      },
    ],
    build: {
      outDir: editionConfig.siteEdition === "portfolio" ? "dist-portfolio" : "dist",
    },
    resolve: {
      // Resolve one adapter before Vite scans the module graph. This keeps a
      // runtime build independent of the local accepted snapshot.
      alias: {
        "@propertycorp-offer-repository": resolve(process.cwd(), "src", "services", "offers", offersRepositoryFile),
      },
    },
  };
});
