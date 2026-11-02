import React, { useEffect, useState } from "react";
import { warnAboutMissingSiteAsset } from "../../config/siteAssets.js";

function useAssetAvailability(assets) {
  const canRender = assets.every((asset) => asset?.delivered && asset.path);
  const assetSignature = assets.map((asset) => `${asset?.path}:${asset?.delivered}`).join("|");
  const [failed, setFailed] = useState(!canRender);

  useEffect(() => {
    assets.forEach(warnAboutMissingSiteAsset);
    setFailed(!canRender);
  }, [assetSignature, canRender]);

  return [canRender && !failed, () => {
    assets.forEach((asset) => warnAboutMissingSiteAsset(asset, { force: true }));
    setFailed(true);
  }];
}

export function SiteAssetImage({ asset, fallback = null, ...imageProps }) {
  const [available, markFailed] = useAssetAvailability([asset]);
  if (!available) return fallback;
  return <img {...imageProps} src={asset.path} onError={markFailed} />;
}

export function SiteAssetPicture({ desktopAsset, mobileAsset, fallback = null, className = "", imageClassName = "", ...imageProps }) {
  const [available, markFailed] = useAssetAvailability([desktopAsset, mobileAsset]);
  if (!available) return fallback;
  return (
    <picture className={className}>
      <source media="(max-width: 700px)" srcSet={mobileAsset.path} />
      <img {...imageProps} className={imageClassName} src={desktopAsset.path} onError={markFailed} />
    </picture>
  );
}
