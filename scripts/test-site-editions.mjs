import assert from "node:assert/strict";
import {
  createSiteEditionConfig,
  getRequestedVariant,
  resolveEditionVariant,
  resolveSiteEdition,
} from "../src/config/siteEdition.js";

const client = createSiteEditionConfig();
assert.equal(client.siteEdition, "client", "missing configuration must default to client");
assert.equal(client.featuredVariant, 1);
assert.equal(client.listingVariant, 2);
assert.equal(client.variantSelectionEnabled, false);

const explicitClient = createSiteEditionConfig("client");
assert.equal(explicitClient.variantSelectionEnabled, false);
assert.equal(resolveEditionVariant(explicitClient, getRequestedVariant("?carouselVariant=4", "carouselVariant", [1, 2, 3, 4]), "featuredVariant"), 1, "client ignores carousel URL variants");
assert.equal(resolveEditionVariant(explicitClient, getRequestedVariant("?offersVariant=3", "offersVariant", [1, 2, 3]), "listingVariant"), 2, "client ignores listing URL variants");
assert.equal(resolveEditionVariant(explicitClient, 3, "featuredVariant"), 1, "a persisted portfolio carousel choice cannot change client");
assert.equal(resolveEditionVariant(explicitClient, 1, "listingVariant"), 2, "a persisted portfolio listing choice cannot change client");

const portfolio = createSiteEditionConfig("portfolio");
assert.equal(portfolio.variantSelectionEnabled, true);
assert.equal(resolveEditionVariant(portfolio, getRequestedVariant("?carouselVariant=4", "carouselVariant", [1, 2, 3, 4]), "featuredVariant"), 4);
assert.equal(resolveEditionVariant(portfolio, getRequestedVariant("?offersVariant=3", "offersVariant", [1, 2, 3]), "listingVariant"), 3);
assert.equal(portfolio.analyticsEnabled, false);
assert.equal(portfolio.formDeliveryEnabled, false);
assert.equal(portfolio.noIndex, true);

assert.throws(() => resolveSiteEdition("portoflio"), /Invalid VITE_SITE_EDITION value "portoflio"/);

console.log("Site editions: client lock, portfolio switches and invalid configuration checks passed.");
