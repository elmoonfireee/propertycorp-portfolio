const EDITIONS = Object.freeze({
  client: "client",
  portfolio: "portfolio",
});

const EDITION_CONFIGS = Object.freeze({
  [EDITIONS.client]: Object.freeze({
    siteEdition: EDITIONS.client,
    featuredVariant: 1,
    listingVariant: 2,
    variantSelectionEnabled: false,
    featuredOffersLimit: 9,
    analyticsEnabled: true,
    formDeliveryEnabled: true,
    noIndex: false,
  }),
  [EDITIONS.portfolio]: Object.freeze({
    siteEdition: EDITIONS.portfolio,
    featuredVariant: 1,
    listingVariant: 2,
    variantSelectionEnabled: true,
    featuredOffersLimit: 9,
    analyticsEnabled: false,
    formDeliveryEnabled: false,
    noIndex: true,
  }),
});

export function resolveSiteEdition(value) {
  const edition = String(value ?? "").trim();
  if (!edition) return EDITIONS.client;
  if (edition === EDITIONS.client || edition === EDITIONS.portfolio) return edition;
  throw new Error(`[PropertyCorp] Invalid VITE_SITE_EDITION value "${edition}". Use "client" or "portfolio".`);
}

export function createSiteEditionConfig(value) {
  return EDITION_CONFIGS[resolveSiteEdition(value)];
}

export function getRequestedVariant(search, parameter, allowedVariants) {
  const requested = Number(new URLSearchParams(search).get(parameter));
  return allowedVariants.includes(requested) ? requested : null;
}

export function resolveEditionVariant(config, requestedVariant, configKey) {
  return config.variantSelectionEnabled && requestedVariant != null
    ? requestedVariant
    : config[configKey];
}

const runtimeEnvironment = import.meta.env || {};

export const siteEditionConfig = createSiteEditionConfig(runtimeEnvironment.VITE_SITE_EDITION);
export const isPortfolioEdition = siteEditionConfig.siteEdition === EDITIONS.portfolio;
export { EDITIONS };
