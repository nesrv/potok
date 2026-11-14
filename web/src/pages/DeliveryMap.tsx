import { useEffect, useRef, useState } from "react";
import { api, getToken, userId } from "../api";

type Point = [number, number];

function samePoint(a: Point, b: Point) {
  return a[0] === b[0] && a[1] === b[1];
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d)) return false;
  const orient = (p: Point, q: Point, r: Point) =>
    Math.sign((q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]));
  return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
}

function polygonCrosses(points: Point[]) {
  const count = points.length;
  if (count < 4) return false;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];
    for (let j = i + 1; j < count; j += 1) {
      const c = points[j];
      const d = points[(j + 1) % count];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

function distanceToEdge(point: Point, a: Point, b: Point) {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((point[1] - a[1]) * dx + (point[0] - a[0]) * dy) / length));
  return Math.hypot(point[0] - (a[0] + t * dy), point[1] - (a[1] + t * dx));
}

function insertPoint(points: Point[], point: Point, closed: boolean) {
  if (points.length < 2) return [...points, point];
  const edges = closed ? points.length : points.length - 1;
  const candidates: { index: number; distance: number }[] = [];
  for (let i = 0; i < edges; i += 1) {
    const next = points.slice();
    next.splice(i + 1, 0, point);
    if (closed && polygonCrosses(next)) continue;
    candidates.push({
      index: i,
      distance: distanceToEdge(point, points[i], points[(i + 1) % points.length]),
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => left.distance - right.distance);
  const next = points.slice();
  next.splice(candidates[0].index + 1, 0, point);
  return next;
}

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement, options?: { attributionControl?: boolean }) => Map;
      tileLayer: (url: string, options: { attribution: string }) => { addTo: (map: Map) => void };
      layerGroup: () => LayerGroup;
      polygon: (points: Point[], options: object) => Shape;
      polyline: (points: Point[], options: object) => Shape;
      circleMarker: (point: Point, options: object) => { addTo: (group: LayerGroup) => void };
      marker: (point: Point, options: object) => Marker;
      divIcon: (options: object) => unknown;
      DomEvent: { stopPropagation: (event: unknown) => void };
    };
  }
}

type Marker = {
  addTo: (group: LayerGroup) => Marker;
  on: (name: string, fn: (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => void) => Marker;
};

type Map = {
  setView: (center: Point, zoom: number) => void;
  on: (event: string, fn: (event: { latlng: { lat: number; lng: number } }) => void) => void;
  remove: () => void;
  invalidateSize: () => void;
  dragging: { disable: () => void; enable: () => void };
  doubleClickZoom: { disable: () => void };
  attributionControl: { setPrefix: (prefix: string | false) => void };
  createPane: (name: string) => HTMLElement;
  mouseEventToLatLng: (event: MouseEvent) => { lat: number; lng: number };
};

type LayerGroup = { clearLayers: () => void; addTo: (map: Map) => LayerGroup };

type Shape = { setLatLngs: (points: Point[]) => void; addTo: (group: LayerGroup) => Shape };

type Props = {
  productId: number;
  ownerId?: number;
  districts: { id: number; name: string; polygon?: number[][] }[];
  route: number[][];
  selectedDistrictId: string;
  onSaved: () => void;
};

export function DeliveryMap({ productId, ownerId, districts, route, selectedDistrictId, onSaved }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [full, setFull] = useState(false);
  const layers = useRef<LayerGroup | null>(null);
  const draft = useRef<Point[]>([]);
  const modeRef = useRef<"polygon" | "route">("polygon");
  const [mode, setMode] = useState<"polygon" | "route">("polygon");
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const removeRef = useRef<(index: number) => void>(() => {});
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const canEdit = Boolean(getToken()) && userId() === ownerId;
  const district = districts.find((item) => String(item.id) === selectedDistrictId) || districts[0];
  const districtRef = useRef(district);
  const routeRef = useRef(route);
  const persistRef = useRef<(points: Point[], kind: "polygon" | "route") => void>(() => {});
  if (districtRef.current?.id !== district?.id) districtRef.current = district;
  persistRef.current = (points, kind) => {
    const districtId = districtRef.current?.id;
    const body = kind === "route" ? { route: points } : { district_id: districtId, polygon: points };
    api(`/api/products/${productId}/map`, { method: "PUT", body: JSON.stringify(body) })
      .then(() => {
        if (kind === "route") routeRef.current = points;
        else if (districtRef.current) districtRef.current = { ...districtRef.current, polygon: points };
        setMessage("Сохранено");
      })
      .catch((err: Error) => setMessage(err.message));
  };

  function paint() {
    const group = layers.current;
    const L = window.L;
    if (!group || !L || !mapRef.current) return;
    try {
    group.clearLayers();
    const savedArea = (districtRef.current?.polygon || district?.polygon || []) as Point[];
    const editingArea = modeRef.current === "polygon";
    const area = editingArea && draft.current.length ? draft.current : savedArea;
    const path = (modeRef.current === "route" && draft.current.length ? draft.current : routeRef.current) as Point[];
    let areaShape: Shape | undefined;
    let pathShape: Shape | undefined;
    if (area.length > 2) {
      areaShape = L.polygon(area, {
        color: "#1f9d45",
        fillColor: "#1f9d45",
        fillOpacity: 0.28,
        interactive: false,
        className: "map-shape",
        pane: "shapes",
      }).addTo(group);
    }
    if (path.length > 1) {
      pathShape = L.polyline(path, {
        color: "#1a1a1a",
        weight: 4,
        interactive: false,
        className: "map-shape",
        pane: "shapes",
      }).addTo(group);
    }
    const handles = editingArea ? area : path;
    if (!canEdit) {
      handles.forEach((point) => L.circleMarker(point, { radius: 4, color: editingArea ? "#1f9d45" : "#1a1a1a" }).addTo(group));
      return;
    }
    handles.forEach((point, index) => {
      const marker = L.marker(point, {
        draggable: true,
        autoPan: false,
        icon: L.divIcon({
          className: editingArea ? "map-handle" : "map-handle route",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(group);
      marker.on("click", (event) => L.DomEvent.stopPropagation(event));
      marker.on("dblclick", (event) => {
        L.DomEvent.stopPropagation(event);
        removeRef.current(index);
      });
      marker.on("contextmenu", (event) => {
        L.DomEvent.stopPropagation(event);
        const mouse = event as { originalEvent?: MouseEvent };
        mouse.originalEvent?.preventDefault();
        if (!mouse.originalEvent) return;
        setMenu({ x: mouse.originalEvent.clientX, y: mouse.originalEvent.clientY, index });
      });
      marker.on("dragstart", () => {
        mapRef.current?.dragging.disable();
        if (!draft.current.length) draft.current = handles.map((item) => [Number(item[0]), Number(item[1])]);
      });
      marker.on("dragend", (event) => {
        mapRef.current?.dragging.enable();
        const here = event.target.getLatLng();
        if (!draft.current.length) draft.current = handles.map((item) => [Number(item[0]), Number(item[1])]);
        draft.current[index] = [Number(here.lat.toFixed(6)), Number(here.lng.toFixed(6))];
        const saved = draft.current.map((item) => [item[0], item[1]] as Point);
        const kind = modeRef.current;
        window.setTimeout(() => {
          try {
            paint();
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Карта не обновилась");
          }
          persistRef.current(saved, kind);
        }, 0);
      });
    });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Карта не обновилась");
    }
  }

  useEffect(() => {
    const node = box.current;
    if (!node || window.L) {
      setReady(Boolean(window.L));
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setReady(true);
    script.onerror = () => setMessage("Карта не загрузилась");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const node = box.current;
    if (!ready || !node || !window.L) return;
    const center: Point = (district?.polygon?.[0] as Point) || (route[0] as Point) || [44.895, 37.316];
    const map = window.L.map(node, { attributionControl: false });
    mapRef.current = map;
    const shapes = map.createPane("shapes");
    shapes.style.pointerEvents = "none";
    map.doubleClickZoom.disable();
    map.setView(center, 12);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "",
    }).addTo(map);
    layers.current = window.L.layerGroup().addTo(map);
    paint();
    node.addEventListener("click", (event) => {
      if (!canEdit || modeRef.current !== "route") return;
      const target = event.target as HTMLElement;
      if (target.closest(".map-handle")) return;
      const latlng = map.mouseEventToLatLng(event);
      const point: Point = [Number(latlng.lat.toFixed(6)), Number(latlng.lng.toFixed(6))];
      const base = draft.current.length ? draft.current : ((routeRef.current || []) as Point[]);
      const next = [...base.map((item) => [...item] as Point), point];
      draft.current = next;
      setDraftPoints(next);
      setMessage(`Точек маршрута: ${next.length}`);
      paint();
      persistRef.current(next, "route");
    });
    map.on("click", (event) => {
      if (!canEdit || modeRef.current !== "polygon") return;
      const point: Point = [Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))];
      const base = draft.current.length
        ? draft.current
        : ((districtRef.current?.polygon || []) as Point[]);
      const next = insertPoint(base.map((item) => [...item] as Point), point, base.length >= 3);
      if (!next) {
        setMessage("Эта точка пересекла бы стороны. Поставьте её ближе к нужной границе.");
        return;
      }
      draft.current = next;
      setDraftPoints(next);
      setMessage(`Углов района: ${next.length}`);
      paint();
      persistRef.current(next, "polygon");
    });
    return () => {
      map.remove();
      mapRef.current = null;
      layers.current = null;
    };
  }, [ready, district?.id, canEdit]);

  useEffect(() => {
    paint();
  }, [mode, district?.polygon, route]);

  useEffect(() => {
    const timer = window.setTimeout(() => mapRef.current?.invalidateSize(), 50);
    return () => window.clearTimeout(timer);
  }, [full]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  removeRef.current = (index) => {
    const editingArea = modeRef.current === "polygon";
    const base = draft.current.length
      ? draft.current
      : (((editingArea ? districtRef.current?.polygon : routeRef.current) || []) as Point[]);
    const next = base.map((item) => [...item] as Point);
    next.splice(index, 1);
    draft.current = next;
    setDraftPoints(next);
    setMenu(null);
    setMessage(next.length ? "Точка удалена" : "Точек не осталось");
    paint();
    persistRef.current(next, editingArea ? "polygon" : "route");
  };

  function choose(next: "polygon" | "route") {
    draft.current = [];
    setDraftPoints([]);
    modeRef.current = next;
    setMode(next);
    setMessage(next === "route" ? "Кликайте по карте в порядке маршрута." : "");
    paint();
  }

  return (
    <section className={full ? "card map-card full" : "card map-card"}>
      <div className="section-head">
        <h2>Доставка на карте</h2>
        <button type="button" className="ghost" onClick={() => setFull((value) => !value)}>
          {full ? "Свернуть" : "На весь экран"}
        </button>
      </div>
      <p className="muted">
        {canEdit
          ? mode === "route"
            ? "Маршрут: клик добавляет точку. Двойной клик или правая кнопка удаляет её."
            : "Район: клик добавляет угол. Двойной клик или правая кнопка удаляет его."
          : "Зелёным показан район, тёмной линией — маршрут продавца."}
      </p>
      {canEdit && (
        <div className="map-tools">
          <button type="button" className={mode === "polygon" ? "" : "ghost"} onClick={() => choose("polygon")}>
            Район{district ? `: ${district.name}` : ""}
          </button>
          <button type="button" className={mode === "route" ? "" : "ghost"} onClick={() => choose("route")}>
            Маршрут
          </button>
          <button type="button" className="ghost" onClick={() => { draft.current = []; setDraftPoints([]); setMessage("Черновик очищен"); paint(); }}>
            Очистить черновик
          </button>
        </div>
      )}
      {mode === "route" && canEdit && (
        <p className="muted">{draftPoints.length ? `Маршрут: ${draftPoints.length} точ.` : "Маршрут ещё без точек."}</p>
      )}
      <div ref={box} className="map-box" onContextMenu={(event) => event.preventDefault()} />
      {menu && (
        <button
          type="button"
          className="map-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={() => removeRef.current(menu.index)}
        >
          Удалить
        </button>
      )}
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
