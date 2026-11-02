import React from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import { formatLocation, formatPrice, getPrimaryOfferImage } from "./OfferCard.jsx";
import { formatOfferArea, formatOfferFloor, formatOfferRoomCount, getOfferDescriptionPreview } from "./offerCardContent.js";

export function OfferCardVariant3({ offer, href = buildOfferPath(offer), priority = false }) {
  const image = getPrimaryOfferImage(offer);
  const location = formatLocation(offer.location) || "Wrocław i okolice";
  const description = getOfferDescriptionPreview(offer.description);
  const facts = [formatOfferRoomCount(offer.rooms), formatOfferFloor(offer.floor)].filter(Boolean);

  return (
    <article className="offers-listing-card-v3">
      <a href={href} aria-label={`Zobacz ofertę: ${offer.title}`}>
        <div className="offers-listing-card-v3__visual">
          {image ? <img src={image.url} alt={offer.title} loading={priority ? "eager" : "lazy"} sizes="(max-width: 700px) calc(100vw - 36px), (max-width: 1050px) calc((100vw - 76px) / 2), (max-width: 1480px) calc((100vw - 12vw - 56px) / 3), 450px" /> : <div className="offers-listing-card-v3__fallback" aria-hidden="true">PropertyCorp</div>}
          <span className="offers-listing-card-v3__ribbon"><strong>{formatOfferArea(offer.area)}</strong></span>
        </div>
        <div className="offers-listing-card-v3__body">
          <div className="offers-listing-card-v3__meta">
            <p className="offers-listing-card-v3__location"><MapPin aria-hidden="true" />{location}</p>
            <strong className="offers-listing-card-v3__price">Cena: {formatPrice(offer)}</strong>
          </div>
          <h2>{offer.title}</h2>
          <p className="offers-listing-card-v3__description">{description}</p>
          <div className="offers-listing-card-v3__footer">
            <span>{facts.length ? facts.join(" · ") : "Szczegóły na zapytanie"}</span>
            <ArrowUpRight aria-hidden="true" />
          </div>
        </div>
      </a>
    </article>
  );
}
