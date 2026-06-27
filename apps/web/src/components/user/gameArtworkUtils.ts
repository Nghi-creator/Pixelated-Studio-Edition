export function isGeneratedCatalogArtworkUrl(url: string | null | undefined) {
  return Boolean(
    url &&
      url.includes("/storage/v1/object/public/catalog_artifacts/covers/") &&
      url.endsWith(".svg"),
  );
}
