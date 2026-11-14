import { useEffect, useRef, useState } from "react";
import { api } from "../api";

type Point = [number, number];

type Leaflet = {
  map: (node: HTMLElement, options?: object) => Map;
  tileLayer: (url: string, options?: object) => { addTo: (map: Map) => void };
  layerGroup: () => Group;
  polygon: (points: Point[], options?: object) => { addTo: (group: Group) => void };
  marker: (point: Point, options?: object) => Marker;
  divIcon: (options: object) => object;
  DomEvent: { stopPropagation: (event: object) => void };
};

type Map = {
  setView: (center: Point, zoom: number) => void;
  dragging: { disable: () => void; enable: () => void };
  remove: () => void;
  invalidateSize: () => void;
  doubleClickZoom: { disable: () => void };
  createPane: (name: string) => HTMLElement;
};

type Group = { addTo: (map: Map) => Group; clearLayers: () => void };
type Marker = {
  addTo: (group: Group) => Marker;
  on: (name: string, fn: (event: { target: { getLatLng: () => { lat: number; lng: number } }; originalEvent?: MouseEvent }) => void) => void;
};

declare global {
  interface Window {
    L?: Leaflet;
  }
}

function ring(lat: number, lon: number): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < 8; index += 1) {
    const bearing = (index * 45 * Math.PI) / 180;
    const dlat = (50 / 111.32) * Math.cos(bearing);
    const dlon = (50 / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(bearing);
    points.push([Number((lat + dlat).toFixed(6)), Number((lon + dlon).toFixed(6))]);
  }
  return points;
}

export function FarmMap({
  storefrontId,
  name,
  latitude,
  longitude,
  area,
  onMoved,
}: {
  storefrontId: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  area: number[][];
  onMoved: (latitude: number, longitude: number, area: Point[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const layers = useRef<Group | null>(null);
  const areaRef = useRef<Point[]>(area as Point[]);
  const hereRef = useRef<Point | null>(latitude != null && longitude != null ? [latitude, longitude] : null);
  const [ready, setReady] = useState(Boolean(window.L));
  const [full, setFull] = useState(false);
  const [message, setMessage] = useState("");

  function save(nextArea: Point[], here: Point | null) {
    areaRef.current = nextArea;
    hereRef.current = here;
    api(`/api/storefronts/${storefrontId}`, {
      method: "PATCH",
      body: JSON.stringify({
        area: nextArea,
        ...(here ? { latitude: here[0], longitude: here[1] } : {}),
      }),
    })
      .then(() => {
        if (here) onMoved(here[0], here[1], nextArea);
        setMessage("Сохранено");
      })
      .catch((err: Error) => setMessage(err.message));
  }

  function paint() {
    const group = layers.current;
    const L = window.L;
    const map = mapRef.current;
    if (!group || !L || !map) return;
    group.clearLayers();
    const points = areaRef.current;
    if (points.length > 2) {
      L.polygon(points, {
        color: "#1f9d45",
        fillColor: "#1f9d45",
        fillOpacity: 0.18,
        interactive: false,
        className: "map-shape",
        pane: "shapes",
      }).addTo(group);
    }
    const here = hereRef.current || ([44.895, 37.316] as Point);
    if (here) {
      const shop = L.marker(here, {
        draggable: true,
        autoPan: false,
        icon: L.divIcon({ className: "map-shop", html: name, iconSize: [120, 36], iconAnchor: [60, 36] }),
      }).addTo(group);
      shop.on("dragstart", () => map.dragging.disable());
      shop.on("dragend", (event) => {
        map.dragging.enable();
        const spot = event.target.getLatLng();
        const next: Point = [Number(spot.lat.toFixed(6)), Number(spot.lng.toFixed(6))];
        const zone = hereRef.current && areaRef.current.length ? areaRef.current : ring(next[0], next[1]);
        save(zone, next);
        paint();
      });
    }
    points.forEach((point, index) => {
      const marker = L.marker(point, {
        draggable: true,
        autoPan: false,
        icon: L.divIcon({ className: "map-handle", iconSize: [28, 28], iconAnchor: [14, 14] }),
      }).addTo(group);
      marker.on("dragstart", () => map.dragging.disable());
      marker.on("dragend", (event) => {
        map.dragging.enable();
        const spot = event.target.getLatLng();
        const next = points.map((item) => [item[0], item[1]] as Point);
        next[index] = [Number(spot.lat.toFixed(6)), Number(spot.lng.toFixed(6))];
        save(next, hereRef.current);
        paint();
      });
    });
  }

  useEffect(() => {
    if (window.L) {
      setReady(true);
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const node = box.current;
    if (!ready || !node || !window.L) return;
    const center = hereRef.current || [44.895, 37.316];
    const map = window.L.map(node, { attributionControl: false });
    mapRef.current = map;
    const shapes = map.createPane("shapes");
    shapes.style.pointerEvents = "none";
    map.doubleClickZoom.disable();
    map.setView(center, hereRef.current ? 9 : 8);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "" }).addTo(map);
    layers.current = window.L.layerGroup().addTo(map);
    if (!areaRef.current.length && hereRef.current) {
      save(ring(hereRef.current[0], hereRef.current[1]), hereRef.current);
    }
    paint();
    return () => {
      map.remove();
      mapRef.current = null;
      layers.current = null;
    };
  }, [ready, storefrontId]);

  useEffect(() => {
    const timer = window.setTimeout(() => mapRef.current?.invalidateSize(), 50);
    return () => window.clearTimeout(timer);
  }, [full]);

  return (
    <section className={full ? "card map-card full" : "card map-card"}>
      <div className="section-head">
        <h2>Зона доставки</h2>
        <button type="button" className="ghost" onClick={() => setFull((value) => !value)}>
          {full ? "Свернуть" : "На весь экран"}
        </button>
      </div>
      <p className="muted">Перетащите лавку и точки зоны. Радиус по умолчанию — 50 км.</p>
      <div ref={box} className="map-box" />
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
