import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { Pothole, PotholeStatus, PotholeSeverity } from '../types';
import L from 'leaflet';
import { LocateFixed, Filter, X, Radio } from 'lucide-react';

// Fix for default Leaflet icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const CHENNAI_CENTER: [number, number] = [13.0827, 80.2707];
const CHENNAI_ZOOM = 12;

const STATUS_COLORS: Record<string, string> = {
  [PotholeStatus.DETECTED]: '#ef4444',
  [PotholeStatus.SENT_TO_GCC]: '#f59e0b',
  [PotholeStatus.VIEWED]: '#3b82f6',
  [PotholeStatus.ACTION_TAKEN]: '#10b981'
};

const SEVERITY_COLORS: Record<string, string> = {
  [PotholeSeverity.SMALL]: '#3b82f6',
  [PotholeSeverity.MEDIUM]: '#f59e0b',
  [PotholeSeverity.LARGE]: '#ef4444'
};

const SEVERITY_RADIUS: Record<string, number> = {
  [PotholeSeverity.SMALL]: 180,
  [PotholeSeverity.MEDIUM]: 350,
  [PotholeSeverity.LARGE]: 550
};

const ALL_STATUSES = Object.values(PotholeStatus);
const ALL_SEVERITIES = Object.values(PotholeSeverity);

/** Child of MapContainer — flies back to the Chennai overview. */
function RecenterControl() {
  const map = useMap();
  return (
    <button
      onClick={() => map.flyTo(CHENNAI_CENTER, CHENNAI_ZOOM, { duration: 0.8 })}
      className="absolute bottom-4 right-4 z-[20] flex items-center gap-1.5 border border-brand-text bg-brand-bg px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-wider shadow-[3px_3px_0_#141414] hover:bg-brand-text hover:text-brand-bg transition-colors"
      title="Recenter on Chennai"
    >
      <LocateFixed size={12} />
      Recenter
    </button>
  );
}

export default function PotholeMap({ potholes }: { potholes: Pothole[] }) {
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(ALL_STATUSES));
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set(ALL_SEVERITIES));
  const [showFilters, setShowFilters] = useState(true);

  // Empty set means "show all" — avoids an empty map edge case.
  const filtered = useMemo(() => {
    const statuses = statusFilter.size ? statusFilter : null;
    const severities = severityFilter.size ? severityFilter : null;
    return potholes.filter(p =>
      (!statuses || statuses.has(p.status)) &&
      (!severities || severities.has(p.severity))
    );
  }, [potholes, statusFilter, severityFilter]);

  const toggleStatus = (s: string) =>
    setStatusFilter(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const toggleSeverity = (s: string) =>
    setSeverityFilter(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const clearFilters = () => {
    setStatusFilter(new Set());
    setSeverityFilter(new Set());
  };

  return (
    <div className="relative z-0 h-full min-h-[400px] isolate">
      <MapContainer center={CHENNAI_CENTER} zoom={CHENNAI_ZOOM} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filtered.map((pothole) => {
          const color = STATUS_COLORS[pothole.status] || '#9ca3af';
          return (
            <React.Fragment key={pothole.id ?? pothole.timestamp}>
              <Circle
                center={[pothole.location.latitude, pothole.location.longitude]}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.15,
                  weight: 2,
                  dashArray: pothole.status === PotholeStatus.ACTION_TAKEN ? '4 4' : undefined
                }}
                radius={SEVERITY_RADIUS[pothole.severity] || 300}
              />
              <Marker position={[pothole.location.latitude, pothole.location.longitude]}>
                <Popup className="custom-popup">
                  <div className="p-1 space-y-2 min-w-[200px]">
                    <img
                      src={pothole.imageUrl}
                      alt="Pothole"
                      className="w-full h-24 object-cover"
                    />
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Area {pothole.busRouteId}
                      </span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 font-mono font-bold uppercase"
                        style={{
                          color: SEVERITY_COLORS[pothole.severity] || '#3b82f6',
                          border: `1px solid ${SEVERITY_COLORS[pothole.severity] || '#3b82f6'}`
                        }}
                      >
                        {pothole.severity}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase"
                        style={{ color }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {pothole.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[9px] font-mono font-bold">
                        {(pothole.confidence * 100).toFixed(0)}% CONF
                      </span>
                    </div>

                    {/* Confidence bar */}
                    <div className="h-1.5 border border-brand-text bg-white">
                      <div
                        className="h-full"
                        style={{ width: `${pothole.confidence * 100}%`, backgroundColor: color }}
                      />
                    </div>

                    <p className="text-[10px] text-slate-500">
                      {new Date(pothole.timestamp).toLocaleString('en-IN')}
                    </p>
                    <p className="text-[9px] font-mono text-slate-400">
                      {pothole.location.latitude.toFixed(5)}, {pothole.location.longitude.toFixed(5)}
                    </p>

                    {pothole.locationLink && (
                      <a
                        href={pothole.locationLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[10px] text-sky-700 underline"
                      >
                        Open Shared Location ↗
                      </a>
                    )}
                    {pothole.busId === 'FIELD-UPLOAD' && (
                      <div className="mt-1 px-2 py-1 bg-slate-100 text-[9px] font-mono uppercase tracking-widest text-slate-700">
                        Uploaded Detection
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
        <RecenterControl />
      </MapContainer>

      {/* Filter Panel Overlay */}
      <div className="absolute top-4 left-4 z-[20] w-[220px] border border-brand-text bg-brand-bg shadow-[4px_4px_0_#141414]">
        <div className="flex items-center justify-between px-3 py-2 bg-brand-text text-brand-bg font-mono text-[9px] font-bold uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Filter size={10} />
            Layer Controls
          </span>
          <button
            onClick={() => setShowFilters(s => !s)}
            className="hover:opacity-60 transition-opacity"
            aria-label="Toggle filters"
          >
            {showFilters ? <X size={10} /> : <span className="text-[8px]">SHOW</span>}
          </button>
        </div>

        {showFilters && (
          <div className="p-3 space-y-4">
            {/* Status */}
            <div>
              <div className="font-serif italic text-[9px] uppercase opacity-50 tracking-widest mb-2">Status</div>
              <div className="flex flex-wrap gap-1">
                {ALL_STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`px-1.5 py-1 border font-mono text-[8px] font-bold uppercase transition-colors ${
                      statusFilter.has(s)
                        ? 'border-brand-text bg-brand-text text-brand-bg'
                        : 'border-brand-text/40 bg-white text-brand-text/50 hover:border-brand-text'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div>
              <div className="font-serif italic text-[9px] uppercase opacity-50 tracking-widest mb-2">Severity</div>
              <div className="flex flex-wrap gap-1">
                {ALL_SEVERITIES.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleSeverity(s)}
                    className={`px-1.5 py-1 border font-mono text-[8px] font-bold uppercase transition-colors ${
                      severityFilter.has(s)
                        ? 'border-brand-text bg-brand-text text-brand-bg'
                        : 'border-brand-text/40 bg-white text-brand-text/50 hover:border-brand-text'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-brand-text/10 space-y-2">
              <div className="font-serif italic text-[9px] uppercase opacity-50 tracking-widest">Status Legend</div>
              {ALL_STATUSES.map(s => (
                <div key={s} className="flex items-center gap-2 font-mono text-[8px] uppercase">
                  <span
                    className="w-2.5 h-2.5 border border-brand-text/40"
                    style={{ backgroundColor: STATUS_COLORS[s] }}
                  />
                  <span className="opacity-70">{s.replace(/_/g, ' ')}</span>
                </div>
              ))}
              <div className="font-serif italic text-[9px] uppercase opacity-50 tracking-widest pt-2">Radius = Severity</div>
              <div className="flex items-center gap-2 font-mono text-[8px] uppercase">
                <span className="w-2.5 h-2.5 rounded-full border border-brand-text/40" style={{ backgroundColor: SEVERITY_COLORS[PotholeSeverity.LARGE] }} />
                <span className="opacity-70">LARGE</span>
                <span className="w-2 h-2 rounded-full border border-brand-text/40 ml-1" style={{ backgroundColor: SEVERITY_COLORS[PotholeSeverity.MEDIUM] }} />
                <span className="opacity-70">MEDIUM</span>
                <span className="w-1.5 h-1.5 rounded-full border border-brand-text/40 ml-1" style={{ backgroundColor: SEVERITY_COLORS[PotholeSeverity.SMALL] }} />
                <span className="opacity-70">SMALL</span>
              </div>
            </div>

            {/* Node count */}
            <div className="flex items-center justify-between pt-2 border-t border-brand-text/10">
              <span className="flex items-center gap-1.5 font-mono text-[8px] font-bold uppercase">
                <Radio size={9} className={filtered.length > 0 ? 'animate-pulse text-green-700' : ''} />
                {filtered.length}/{potholes.length} nodes
              </span>
              {(statusFilter.size < ALL_STATUSES.length || severityFilter.size < ALL_SEVERITIES.length) && (
                <button
                  onClick={clearFilters}
                  className="font-mono text-[8px] font-bold uppercase underline hover:opacity-60 transition-opacity"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
