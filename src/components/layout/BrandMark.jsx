import React from "react";
import { siteAssets } from "../../config/siteAssets.js";
import { SiteAssetImage } from "../media/SiteAssetImage.jsx";

export function BrandMark({ className = "", tone = "light" }) {
  const asset = tone === "dark" ? siteAssets.brand.logoDark : null;
  const fallback = <span className="brand-mark__fallback" aria-label="PropertyCorp Nieruchomości">PropertyCorp<small>Nieruchomości</small></span>;
  return (
    <span className={`brand-mark ${className}`}>
      {asset ? <SiteAssetImage asset={asset} alt="" className="brand-mark__asset" fallback={fallback} /> : fallback}
    </span>
  );
}
