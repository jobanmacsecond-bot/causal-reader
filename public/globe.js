import { canonicalCountryName, countryArticleCounts } from './location.mjs';

/** A local, Canvas-rendered geographic view of the stories already in the feed. */
export function createNewsGlobe(container, { onSelect = () => {} } = {}) {
  if (!container) throw new Error('A globe container is required.');
  const uid = `globe-${Math.random().toString(36).slice(2, 9)}`;
  container.classList.add('news-globe');
  container.innerHTML = `
    <div class="globe-copy">
      <div class="globe-eyebrow"><span aria-hidden="true">◉</span> EXPLORE BY PLACE</div>
      <h2>The world,<br><em>within reach.</em></h2>
      <p>Spin the globe. Find a place.<br>Follow the stories unfolding there.</p>
      <label class="globe-country-label" for="${uid}-country">Go to a country</label>
      <select id="${uid}-country" class="globe-country" disabled aria-label="Choose a country on the globe"><option value="">Around the world</option></select>
    </div>
    <div class="globe-stage">
      <canvas class="globe-canvas" tabindex="0" role="img" aria-label="Interactive world globe. Drag to rotate, scroll to zoom, or choose a country in the selector. Arrow keys rotate; plus and minus zoom; Home resets." aria-describedby="${uid}-hint"></canvas>
      <div class="globe-tooltip" hidden></div>
      <div class="globe-loading" role="status">Drawing the world…</div>
      <div class="globe-controls" role="group" aria-label="Globe view controls">
        <button class="globe-zoom-in" type="button" aria-label="Zoom in on globe" title="Zoom in">+</button>
        <button class="globe-zoom-out" type="button" aria-label="Zoom out on globe" title="Zoom out">−</button>
        <button class="globe-reset-view" type="button" aria-label="Show all world headlines and reset globe" title="Reset globe"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 7A6 6 0 1 1 4 12M4.5 3v4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div class="globe-hint" id="${uid}-hint">DRAG TO SPIN <span>·</span> + / − TO ZOOM <b class="globe-zoom-value" title="Current zoom">1.0×</b></div>
    </div>
    <div class="globe-selection">
      <div class="globe-location-kicker">YOUR VIEW</div>
      <h3 class="globe-selected-name">Around the world</h3>
      <div class="globe-count"><strong>—</strong><span>headlines in this feed</span></div>
      <div class="globe-coverage-note">Loading geographic coverage…</div>
      <button type="button" class="globe-show-world">↗ All world headlines</button>
      <div class="globe-legend"><i></i> Places with stories in the feed</div>
    </div>`;

  const canvas = container.querySelector('canvas');
  const stage = container.querySelector('.globe-stage');
  const ctx = canvas.getContext('2d');
  const selector = container.querySelector('.globe-country');
  const tooltip = container.querySelector('.globe-tooltip');
  const loading = container.querySelector('.globe-loading');
  const plus = container.querySelector('.globe-zoom-in');
  const minus = container.querySelector('.globe-zoom-out');
  const resetButton = container.querySelector('.globe-reset-view');
  const worldButton = container.querySelector('.globe-show-world');
  const listeners = [];
  const initialRotation = [-15, -18, 0];
  let rotation = [...initialRotation];
  let zoom = 1;
  let width = 0;
  let height = 0;
  let baseRadius = 120;
  let articles = [];
  let counts = new Map();
  let coverageLoading = true;
  let selected = null;
  let features = [];
  let featureByName = new Map();
  let featureBounds = new Map();
  let featureCentroids = new Map();
  let projection;
  let path;
  let graticule;
  let activePointer = null;
  let hoverFeature = null;
  let destroyed = false;
  let drawFrame = 0;
  let focusFrame = 0;
  const abort = new AbortController();

  function listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  }
  function nameOf(feature) {
    return canonicalCountryName(feature?.properties?.name || '') || feature?.properties?.name || '';
  }
  function scheduleDraw() {
    if (destroyed || drawFrame) return;
    drawFrame = requestAnimationFrame(() => { drawFrame = 0; draw(); });
  }
  function configureProjection() {
    if (!projection) return;
    projection.translate([width / 2, height / 2 - 2]).scale(baseRadius * zoom).rotate(rotation);
  }
  function resize() {
    const box = stage.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseRadius = Math.max(20, Math.min(width * 0.44, height * 0.415));
    configureProjection();
    scheduleDraw();
  }
  function trace(object, fill, stroke, lineWidth = 0.7) {
    ctx.beginPath();
    path(object);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (!projection || !features.length) return;
    const cx = width / 2;
    const cy = height / 2 - 2;
    const radius = baseRadius * zoom;
    const gradient = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.05, cx, cy, radius);
    gradient.addColorStop(0, '#fbfdf8');
    gradient.addColorStop(0.72, '#eef4e8');
    gradient.addColorStop(1, '#dde9d6');
    ctx.save();
    ctx.shadowColor = '#385f3420';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    trace({ type: 'Sphere' }, gradient, '#c8d8bd', 1);
    ctx.restore();
    ctx.save();
    trace({ type: 'Sphere' }, null, null);
    ctx.clip();
    for (const feature of features) {
      const country = nameOf(feature);
      const chosen = country === selected;
      const count = counts.get(country) || 0;
      const hovered = feature === hoverFeature;
      let fill = count ? '#c0d2b4' : '#e0e8d7';
      if (hovered) fill = '#a6c095';
      if (chosen) fill = '#527e5c';
      trace(feature, fill, chosen ? '#f0f6e9' : '#fcfdf7', chosen ? 1.1 : 0.65);
    }
    ctx.globalAlpha = 0.62;
    trace(graticule, null, '#b3c7aa', 0.5);
    ctx.globalAlpha = 1;
    const front = projection.invert([cx, cy]);
    for (const [country, count] of counts) {
      const feature = featureByName.get(country);
      if (!feature || !count) continue;
      const centroid = featureCentroids.get(country);
      if (!front || window.d3.geoDistance(front, centroid) > Math.PI / 2 - 0.01) continue;
      const point = projection(centroid);
      if (!point || point.some(v => !Number.isFinite(v))) continue;
      const chosen = country === selected;
      const r = chosen ? 4.5 : Math.min(3.7, 2 + Math.log2(count + 1) * 0.34);
      ctx.beginPath();
      ctx.arc(point[0], point[1], r + (chosen ? 4 : 0), 0, Math.PI * 2);
      ctx.fillStyle = chosen ? '#fcfff25e' : '#f7fbf1';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(point[0], point[1], r, 0, Math.PI * 2);
      ctx.fillStyle = chosen ? '#fff9db' : '#467451';
      ctx.fill();
      ctx.strokeStyle = chosen ? '#315b3d' : '#f8fcf3';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.restore();
    trace({ type: 'Sphere' }, null, '#afc5a1', 0.8);
  }
  function updateLabels() {
    const count = selected ? counts.get(selected) || 0 : articles.length;
    container.querySelector('.globe-selected-name').textContent = selected || 'Around the world';
    container.querySelector('.globe-count strong').textContent = coverageLoading ? '—' : String(count);
    container.querySelector('.globe-count span').textContent = coverageLoading ? 'loading headlines' : `${count === 1 ? 'headline' : 'headlines'} in this feed`;
    const note = coverageLoading ? 'Connecting to global source feeds…' : selected
      ? count ? 'Stories mentioning this country or its named places.' : 'No stories tagged here in the current feed. Try another place or a wider search.'
      : `${counts.size} countries mentioned in the current stories. Choose a country to narrow your view.`;
    container.querySelector('.globe-coverage-note').textContent = note;
    selector.value = selected || '';
    worldButton.classList.toggle('is-selected', Boolean(selected));
    minus.disabled = zoom <= 1;
    plus.disabled = zoom >= 4;
    container.querySelector('.globe-zoom-value').textContent = `${zoom.toFixed(1)}×`;
    canvas.setAttribute('aria-label', `Interactive world globe. ${selected || 'Around the world'}, ${coverageLoading ? 'headlines are loading' : `${count} ${count === 1 ? 'headline' : 'headlines'} in the current feed`}, ${zoom.toFixed(1)} times zoom. Drag to rotate, scroll to zoom, or choose a country. Arrow keys rotate; plus and minus zoom; Home resets.`);
  }
  function fillSelector() {
    // Small island states can be absent from the simplified outlines but still have news.
    const names = [...new Set([...featureByName.keys(), ...counts.keys(), ...(selected ? [selected] : [])])];
    selector.replaceChildren(new Option('Around the world', ''));
    names.sort((a, b) => a.localeCompare(b)).forEach(name => selector.add(new Option(coverageLoading ? name : `${name} (${counts.get(name) || 0})`, name)));
    selector.disabled = !names.length;
    selector.value = selected || '';
  }
  function cancelFocus() {
    cancelAnimationFrame(focusFrame);
    focusFrame = 0;
  }
  function focusCountry(country) {
    if (!projection) return;
    cancelFocus();
    const feature = featureByName.get(country);
    const point = feature ? featureCentroids.get(country) : null;
    const nextRotation = point && point.every(Number.isFinite) ? [-point[0], -point[1], 0] : [...initialRotation];
    const nextZoom = country ? Math.max(zoom, 1.3) : 1;
    const startRotation = [...rotation];
    const startZoom = zoom;
    let longitudeDifference = nextRotation[0] - startRotation[0];
    longitudeDifference = ((longitudeDifference + 180) % 360 + 360) % 360 - 180;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rotation = nextRotation;
      zoom = nextZoom;
      configureProjection(); updateLabels(); scheduleDraw();
      return;
    }
    const began = performance.now();
    const animate = now => {
      if (destroyed) return;
      const t = Math.min(1, (now - began) / 450);
      const eased = 1 - (1 - t) ** 3;
      rotation = [startRotation[0] + longitudeDifference * eased, startRotation[1] + (nextRotation[1] - startRotation[1]) * eased, 0];
      zoom = startZoom + (nextZoom - startZoom) * eased;
      configureProjection(); updateLabels(); draw();
      if (t < 1) focusFrame = requestAnimationFrame(animate);
      else focusFrame = 0;
    };
    focusFrame = requestAnimationFrame(animate);
  }
  function setSelection(country, notify = false) {
    selected = country ? canonicalCountryName(country) || country : null;
    hoverFeature = null;
    tooltip.hidden = true;
    updateLabels();
    focusCountry(selected);
    scheduleDraw();
    if (notify) {
      const feature = featureByName.get(selected);
      const centroid = feature ? featureCentroids.get(selected) : [];
      onSelect(selected, { id: feature?.id || null, lng: centroid[0] ?? null, lat: centroid[1] ?? null, articlesCount: selected ? counts.get(selected) || 0 : articles.length });
    }
  }
  function zoomBy(factor) {
    cancelFocus();
    zoom = Math.min(4, Math.max(1, zoom * factor));
    configureProjection(); updateLabels(); scheduleDraw();
  }
  function positionOf(event) {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }
  function countryAt(point) {
    if (!projection) return null;
    const center = projection.translate();
    if (Math.hypot(point[0] - center[0], point[1] - center[1]) > projection.scale()) return null;
    const coord = projection.invert(point);
    if (!coord || coord.some(v => !Number.isFinite(v))) return null;
    return features.find(feature => {
      const [[west, south], [east, north]] = featureBounds.get(feature);
      if (coord[1] < south || coord[1] > north) return false;
      if (west <= east ? coord[0] < west || coord[0] > east : coord[0] > east && coord[0] < west) return false;
      return window.d3.geoContains(feature, coord);
    }) || null;
  }
  function hover(event) {
    if (event.pointerType === 'touch' || activePointer) return;
    const point = positionOf(event);
    const feature = countryAt(point);
    if (hoverFeature !== feature) { hoverFeature = feature; scheduleDraw(); }
    canvas.style.cursor = feature ? 'pointer' : 'grab';
    tooltip.hidden = !feature;
    if (!feature) return;
    const country = nameOf(feature);
    const count = counts.get(country) || 0;
    tooltip.textContent = `${country} · ${count} ${count === 1 ? 'headline' : 'headlines'}`;
    tooltip.style.left = `${Math.min(width - 12, Math.max(12, point[0]))}px`;
    tooltip.style.top = `${Math.max(28, point[1] - 12)}px`;
    tooltip.style.transform = point[0] > width * 0.66 ? 'translate(-100%, -100%)' : 'translate(-25%, -100%)';
  }

  listen(selector, 'change', () => setSelection(selector.value || null, true));
  listen(plus, 'click', () => zoomBy(1.25));
  listen(minus, 'click', () => zoomBy(0.8));
  listen(resetButton, 'click', () => setSelection(null, true));
  listen(worldButton, 'click', () => setSelection(null, true));
  listen(canvas, 'wheel', event => {
    if (event.ctrlKey || event.metaKey || !projection) return;
    event.preventDefault();
    zoomBy(Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.026 : 0.002)));
  }, { passive: false });
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0 || activePointer || !projection) return;
    cancelFocus();
    const point = positionOf(event);
    activePointer = { id: event.pointerId, start: point, last: point, distance: 0 };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    canvas.style.cursor = 'grabbing';
    tooltip.hidden = true;
    hoverFeature = null;
    scheduleDraw();
  });
  listen(canvas, 'pointermove', event => {
    if (!activePointer || activePointer.id !== event.pointerId) { hover(event); return; }
    const point = positionOf(event);
    const dx = point[0] - activePointer.last[0];
    const dy = point[1] - activePointer.last[1];
    activePointer.distance = Math.max(activePointer.distance, Math.hypot(point[0] - activePointer.start[0], point[1] - activePointer.start[1]));
    if (activePointer.distance > 4) {
      const sensitivity = 70 / (baseRadius * zoom);
      rotation[0] += dx * sensitivity;
      rotation[1] = Math.max(-89.9, Math.min(89.9, rotation[1] - dy * sensitivity));
      configureProjection(); scheduleDraw();
    }
    activePointer.last = point;
  });
  const endPointer = (event, cancelled = false) => {
    if (!activePointer || activePointer.id !== event.pointerId) return;
    const tap = !cancelled && activePointer.distance <= 4;
    activePointer = null;
    canvas.classList.remove('is-dragging');
    canvas.style.cursor = 'grab';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (tap) {
      const feature = countryAt(positionOf(event));
      if (feature) setSelection(nameOf(feature), true);
    }
  };
  listen(canvas, 'pointerup', event => endPointer(event));
  listen(canvas, 'pointercancel', event => endPointer(event, true));
  listen(canvas, 'lostpointercapture', event => endPointer(event, true));
  listen(canvas, 'pointerleave', () => { hoverFeature = null; tooltip.hidden = true; scheduleDraw(); });
  listen(canvas, 'keydown', event => {
    if (!projection) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'];
    if (!keys.includes(event.key)) return;
    event.preventDefault(); cancelFocus();
    if (event.key === '+' || event.key === '=') return zoomBy(1.25);
    if (event.key === '-' || event.key === '_') return zoomBy(0.8);
    if (event.key === 'Home') return setSelection(null, true);
    const step = 12 / zoom;
    if (event.key === 'ArrowLeft') rotation[0] -= step;
    if (event.key === 'ArrowRight') rotation[0] += step;
    if (event.key === 'ArrowUp') rotation[1] = Math.min(89.9, rotation[1] + step);
    if (event.key === 'ArrowDown') rotation[1] = Math.max(-89.9, rotation[1] - step);
    configureProjection(); scheduleDraw();
  });

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  const ready = (async () => {
    try {
      if (!window.d3?.geoOrthographic || !window.topojson?.feature) throw new Error('Map renderer is unavailable.');
      const response = await fetch('/data/countries-50m.json', { signal: abort.signal });
      if (!response.ok) throw new Error('Map data is unavailable.');
      const topology = await response.json();
      if (destroyed) return;
      features = window.topojson.feature(topology, topology.objects.countries).features.filter(f => nameOf(f));
      featureByName = new Map(features.map(f => [nameOf(f), f]));
      featureBounds = new Map(features.map(f => [f, window.d3.geoBounds(f)]));
      featureCentroids = new Map(features.map(f => [nameOf(f), window.d3.geoCentroid(f)]));
      projection = window.d3.geoOrthographic().clipAngle(90).precision(0.45);
      path = window.d3.geoPath(projection, ctx);
      graticule = window.d3.geoGraticule().step([30, 30])();
      fillSelector(); configureProjection(); updateLabels();
      loading.hidden = true;
      if (selected) focusCountry(selected);
      scheduleDraw();
      container.dispatchEvent(new CustomEvent('globe-ready', { detail: { countries: features.length } }));
    } catch (error) {
      if (destroyed || error.name === 'AbortError') return;
      loading.textContent = 'The map couldn’t load. You can still choose a country.';
      loading.classList.add('globe-error');
      fillSelector(); updateLabels();
      container.dispatchEvent(new CustomEvent('globe-ready', { detail: { error: error.message } }));
    }
  })();

  return {
    ready,
    updateArticles(nextArticles = [], { loading = false } = {}) {
      articles = nextArticles;
      coverageLoading = loading;
      counts = countryArticleCounts(articles);
      fillSelector();
      updateLabels(); scheduleDraw();
    },
    selectCountry(country = null) { setSelection(country, false); },
    getState() { return { country: selected, zoom, rotation: [...rotation], countries: features.length, articles: articles.length }; },
    destroy() {
      destroyed = true;
      abort.abort();
      observer.disconnect();
      cancelFocus(); cancelAnimationFrame(drawFrame);
      listeners.forEach(remove => remove());
      container.replaceChildren();
    }
  };
}
