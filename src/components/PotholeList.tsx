import React from 'react';
import { Pothole } from '../types';
import { ExternalLink, Bus, Tag, Clock, CheckCircle2 } from 'lucide-react';

export default function PotholeList({ potholes }: { potholes: Pothole[] }) {
  return (
    <div className="border border-brand-text bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[10px]">
          <thead className="bg-brand-text text-brand-bg uppercase">
            <tr>
              <th className="px-4 py-2 border-r border-brand-bg/20">ID_REF</th>
              <th className="px-4 py-2 border-r border-brand-bg/20">Timestamp</th>
              <th className="px-4 py-2 border-r border-brand-bg/20">Area</th>
              <th className="px-4 py-2 border-r border-brand-bg/20">Coordinates</th>
              <th className="px-4 py-2 border-r border-brand-bg/20">Confidence</th>
              <th className="px-4 py-2 border-r border-brand-bg/20">Severity</th>
              <th className="px-4 py-2 border-r border-brand-bg/20">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-text/10">
            {potholes.map((p) => (
              <tr key={p.id} className="hover:bg-brand-bg cursor-pointer transition-colors group">
                <td className="px-4 py-3 font-bold border-r border-brand-text/10">
                  #{p.id?.slice(-6).toUpperCase()}
                </td>
                <td className="px-4 py-3 border-r border-brand-text/10 opacity-70">
                  {new Date(p.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
                </td>
                <td className="px-4 py-3 border-r border-brand-text/10">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Bus size={10} />
                    {p.busRouteId || 'UNASSIGNED'}
                  </div>
                </td>
                <td className="px-4 py-3 border-r border-brand-text/10 opacity-70">
                  {p.location.latitude.toFixed(4)}, {p.location.longitude.toFixed(4)}
                </td>
                <td className="px-4 py-3 border-r border-brand-text/10 font-bold">
                  {(p.confidence * 100).toFixed(0)}%
                </td>
                <td className="px-4 py-3 border-r border-brand-text/10">
                  <span className={`px-1.5 py-0.5 border ${
                    p.severity === 'LARGE' ? 'border-red-600 text-red-600' :
                    p.severity === 'MEDIUM' ? 'border-amber-600 text-amber-600' :
                    'border-blue-600 text-blue-600'
                  } font-bold`}>
                    {p.severity}
                  </span>
                </td>
                <td className="px-4 py-3 border-r border-brand-text/10">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-right group-hover:bg-brand-text group-hover:text-brand-bg transition-colors">
                  {p.locationLink ? (
                    <a
                      href={p.locationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-bold uppercase underline text-sky-700"
                    >
                      MAP LINK
                    </a>
                  ) : (
                    <span className="italic opacity-60 group-hover:opacity-100">View_Details</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    DETECTED: 'text-red-600 underline decoration-red-600/30',
    SENT_TO_GCC: 'text-amber-600 underline decoration-amber-600/30',
    VIEWED: 'text-blue-600 underline decoration-blue-600/30',
    ACTION_TAKEN: 'text-emerald-700 line-through opacity-50'
  };

  return (
    <span className={`font-bold uppercase tracking-tighter ${styles[status as keyof typeof styles]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
