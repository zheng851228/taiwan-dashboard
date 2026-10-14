// Probes for the MapLibre maps in the page.
//
// Since #76 there is a single map stack: `MapMod` (#map) is the phone map and
// `DesktopDashboardMod` (#desktop-map) is the >=1200px map; both are the same
// MapRenderer drawing into the same GeoJSON sources ('desktop-route',
// 'desktop-sections', 'desktop-events', 'desktop-cameras', 'desktop-weather')
// plus DOM markers. On desktop MapMod builds no renderer (#map is display:none),
// so assertions must be scoped to the map the user can actually see.

export function isDesktopViewport(page) {
  return (page.viewportSize()?.width || 0) >= 1200;
}

export function mapRoot(page) {
  return page.locator(isDesktopViewport(page) ? '#desktop-map' : '#map');
}

// Resolves once the visible map's renderer is loaded and its data layers exist.
export async function waitForMapReady(page) {
  const desktop = isDesktopViewport(page);
  await page.waitForFunction((isDesktop) => {
    const renderer = isDesktop
      ? window.DesktopDashboardMod && window.DesktopDashboardMod.getRenderer()
      : window.MapMod && window.MapMod.renderer;
    return Boolean(renderer && renderer.map && renderer.map.getSource('desktop-route'));
  }, desktop, { timeout: 15000 });
}

// GeoJSON features the visible map's renderer last drew into one of its data
// sources (null when nothing was ever drawn / the source does not exist).
export async function readMapFeatures(page, sourceId) {
  const desktop = isDesktopViewport(page);
  return page.evaluate(({ id, isDesktop }) => {
    const renderer = isDesktop ? window.DesktopDashboardMod.getRenderer() : window.MapMod.renderer;
    const data = renderer && renderer.getSourceData(id);
    return data && Array.isArray(data.features) ? JSON.parse(JSON.stringify(data.features)) : null;
  }, { id: sourceId, isDesktop: desktop });
}

// [lng, lat] of every road-event marker on the visible map.
export async function readEventMarkerPositions(page) {
  const desktop = isDesktopViewport(page);
  return page.evaluate((isDesktop) => {
    const renderer = isDesktop ? window.DesktopDashboardMod.getRenderer() : window.MapMod.renderer;
    return renderer.markers
      .filter((marker) => marker.getElement().classList.contains('desktop-event-marker'))
      .map((marker) => {
        const { lng, lat } = marker.getLngLat();
        return [lng, lat];
      });
  }, desktop);
}
