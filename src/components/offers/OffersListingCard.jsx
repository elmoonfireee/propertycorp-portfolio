import React from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import { formatLocation, formatPrice, getPrimaryOfferImage } from "./OfferCard.jsx";

function formatArea(value) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(value);
}

function getFacts(offer) {
  return [
    offer.area != null && `${formatArea(offer.area)} m²`,
    offer.rooms != null && `${offer.rooms} ${offer.rooms === 1 ? "pokój" : "pokoje"}`,
    offer.floor != null && `${offer.floor === 0 ? "parter" : `${offer.floor}. piętro`}`,
  ].filter(Boolean);
}

export function OffersListingCard({ offer, href = buildOfferPath(offer), priority = false }) {
  const image = getPrimaryOfferImage(offer);
  const location = formatLocation(offer.location) || "Wrocław i okolice";
  const facts = getFacts(offer);

  return (
    <article className="offers-listing-card">
      <a href={href} aria-label={`Zobacz ofertę: ${offer.title}`}>
        <div className="offers-listing-card__visual">
          {image ? (
            <img src={image.url} alt={offer.title} loading={priority ? "eager" : "lazy"} sizes="(max-width: 700px) calc(100vw - 36px), (max-width: 1050px) calc((100vw - 76px) / 2), (max-width: 1480px) calc((100vw - 12vw - 56px) / 3), 450px" />
          ) : (
            <div className="offers-listing-card__fallback" aria-hidden="true"><span>PropertyCorp</span></div>
          )}
          <span className="offers-listing-card__arrow"><ArrowUpRight aria-hidden="true" /></span>
        </div>
        <div className="offers-listing-card__body">
          <p className="offers-listing-card__location"><MapPin aria-hidden="true" />{location}</p>
          <h2>{offer.title}</h2>
          <div className="offers-listing-card__details">
            <strong>{formatPrice(offer)}</strong>
            {facts.length > 0 && <span>{facts.join(" · ")}</span>}
          </div>
          <span className="offers-listing-card__cta">Zobacz ofertę <ArrowUpRight aria-hidden="true" /></span>
        </div>
      </a>
    </article>
  );
}

export function OffersCardSkeleton() {
  return <article className="offers-card-skeleton" aria-hidden="true"><i /><span /><span /><b /></article>;
}
