import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  ListOrdered, 
  AlertCircle, 
  Settings, 
  CheckCircle2, 
  Eye, 
  Bus,
  ChevronRight,
  Plus,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Dashboard from './components/Dashboard';
import PotholeMap from './components/PotholeMap';
import PotholeList from './components/PotholeList';
import AdminPanel from './components/AdminPanel';
import Logo from './components/Logo';
import { Pothole, Stats, PotholeSeverity, PotholeStatus } from './types';

type View = 'dashboard' | 'map' | 'list' | 'admin';

const LOCAL_UPDATE_STORAGE_KEY = 'urban-eyes-local-pothole-updates';

const baseDetectedPotholes: Pothole[] = [
  {
    id: 'LOCAL-TNAGAR-01',
    location: { latitude: 13.0418, longitude: 80.2341 },
    imageUrl: '/pothole-tnagar.jpg',
    confidence: 0.91,
    timestamp: '2026-08-03T09:10:00+05:30',
    busRouteId: 'T.Nagar',
    busId: 'FIELD-UPLOAD',
    status: PotholeStatus.DETECTED,
    severity: PotholeSeverity.LARGE,
    locationLink: 'https://www.google.com/maps/search/?api=1&query=T.Nagar%2C%20Chennai',
    remarks: 'Pothole detected in T.Nagar from uploaded field image.',
    updatedAt: '2026-08-03T09:10:00+05:30',
  },
  {
    id: 'LOCAL-SAIDAPET-02',
    location: { latitude: 13.0213, longitude: 80.2231 },
    imageUrl: '/pothole-saidapet.jpg',
    confidence: 0.88,
    timestamp: '2026-08-03T09:18:00+05:30',
    busRouteId: 'Saidapet',
    busId: 'FIELD-UPLOAD',
    status: PotholeStatus.DETECTED,
    severity: PotholeSeverity.MEDIUM,
    locationLink: 'https://www.google.com/maps/search/?api=1&query=Saidapet%2C%20Chennai',
    remarks: 'Pothole detected in Saidapet from uploaded field image.',
    updatedAt: '2026-08-03T09:18:00+05:30',
  },
  {
    id: 'LOCAL-VADAPALANI-03',
    location: { latitude: 13.0522, longitude: 80.2120 },
    imageUrl: '/pothole-vadapalani.jpg',
    confidence: 0.94,
    timestamp: '2026-08-03T09:25:00+05:30',
    busRouteId: 'Vadapalani',
    busId: 'FIELD-UPLOAD',
    status: PotholeStatus.DETECTED,
    severity: PotholeSeverity.LARGE,
    locationLink: 'https://www.google.com/maps/search/?api=1&query=Vadapalani%2C%20Chennai',
    remarks: 'Multiple potholes detected in Vadapalani from uploaded field image.',
    updatedAt: '2026-08-03T09:25:00+05:30',
  },
  {
    id: 'LOCAL-KOLATHUR-04',
    location: { latitude: 13.1240, longitude: 80.2121 },
    imageUrl: '/pothole-kolathur.jpg',
    confidence: 0.9,
    timestamp: '2026-08-03T09:33:00+05:30',
    busRouteId: 'Kolathur',
    busId: 'FIELD-UPLOAD',
    status: PotholeStatus.DETECTED,
    severity: PotholeSeverity.LARGE,
    locationLink: 'https://www.google.com/maps/search/?api=1&query=Kolathur%2C%20Chennai',
    remarks: 'Water-filled potholes detected in Kolathur from uploaded field image.',
    updatedAt: '2026-08-03T09:33:00+05:30',
  },
  {
    id: 'LOCAL-KODAMBAKKAM-05',
    location: { latitude: 13.0481, longitude: 80.2214 },
    imageUrl: '/pothole-kodambakkam.jpg',
    confidence: 0.86,
    timestamp: '2026-08-03T09:41:00+05:30',
    busRouteId: 'Kodambakkam',
    busId: 'FIELD-UPLOAD',
    status: PotholeStatus.DETECTED,
    severity: PotholeSeverity.MEDIUM,
    locationLink: 'https://www.google.com/maps/search/?api=1&query=Kodambakkam%2C%20Chennai',
    remarks: 'Pothole detected in Kodambakkam from uploaded field image.',
    updatedAt: '2026-08-03T09:41:00+05:30',
  },
];

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [localUpdates, setLocalUpdates] = useState<Record<string, Partial<Pothole>>>(() => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_UPDATE_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const detectedPotholes = useMemo(
    () => baseDetectedPotholes.map((p) => ({ ...p, ...(localUpdates[p.id!] || {}) })),
    [localUpdates]
  );

  const mergeDetectedPotholes = (fetched: Pothole[]) => {
    const existingIds = new Set(fetched.map((p) => p.id));
    return [
      ...detectedPotholes.filter((p) => !existingIds.has(p.id)),
      ...fetched,
    ];
  };

  const mergeDetectedStats = (base: Stats): Stats => {
    const statsWithDetected = {
      ...base,
      byRoute: { ...base.byRoute },
      bySeverity: { ...base.bySeverity },
    };

    detectedPotholes.forEach((p) => {
      statsWithDetected.total += 1;
      if (p.status === PotholeStatus.SENT_TO_GCC) statsWithDetected.sentToGcc += 1;
      if (p.status === PotholeStatus.VIEWED) statsWithDetected.viewed += 1;
      if (p.status === PotholeStatus.ACTION_TAKEN) statsWithDetected.resolved += 1;
      statsWithDetected.byRoute[p.busRouteId] = (statsWithDetected.byRoute[p.busRouteId] || 0) + 1;
      statsWithDetected.bySeverity[p.severity] = (statsWithDetected.bySeverity[p.severity] || 0) + 1;
    });

    return statsWithDetected;
  };

  const getEmptyStats = (): Stats => ({
    total: 0,
    sentToGcc: 0,
    viewed: 0,
    resolved: 0,
    byRoute: {},
    bySeverity: {
      [PotholeSeverity.SMALL]: 0,
      [PotholeSeverity.MEDIUM]: 0,
      [PotholeSeverity.LARGE]: 0,
    },
  });

  const buildStatsFromPotholes = (items: Pothole[]): Stats => {
    const nextStats = getEmptyStats();

    items.forEach((p) => {
      nextStats.total += 1;
      if (p.status === PotholeStatus.SENT_TO_GCC) nextStats.sentToGcc += 1;
      if (p.status === PotholeStatus.VIEWED) nextStats.viewed += 1;
      if (p.status === PotholeStatus.ACTION_TAKEN) nextStats.resolved += 1;
      nextStats.byRoute[p.busRouteId] = (nextStats.byRoute[p.busRouteId] || 0) + 1;
      nextStats.bySeverity[p.severity] = (nextStats.bySeverity[p.severity] || 0) + 1;
    });

    return nextStats;
  };

  const fetchData = async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/potholes'),
        fetch('/api/stats')
      ]);

      let mergedPotholes = detectedPotholes;

      if (pRes.ok) {
        const pData = await pRes.json();
        const fetched = Array.isArray(pData) ? pData : [];
        mergedPotholes = mergeDetectedPotholes(fetched);
      }

      setPotholes(mergedPotholes);

      if (sRes.ok) {
        const sData = await sRes.json();
        setStats(mergeDetectedStats(sData));
      } else {
        setStats(buildStatsFromPotholes(mergedPotholes));
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
      setPotholes(detectedPotholes);
      setStats(buildStatsFromPotholes(detectedPotholes));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Polling for updates
    return () => clearInterval(interval);
  }, [detectedPotholes]);

  const handleStatusUpdate = async (id: string, updates: Partial<Pothole>) => {
    const timestamp = new Date().toISOString();
    const selectedPothole = potholes.find((p) => p.id === id);
    const historyEntry = {
      status: updates.status || selectedPothole?.status || PotholeStatus.VIEWED,
      remarks: updates.remarks || 'Manual update',
      timestamp,
      actionBy: 'GCC_ADMIN_UNIT_01',
    };
    const nextUpdates = {
      ...updates,
      updatedAt: timestamp,
      history: [...(selectedPothole?.history || []), historyEntry],
    };
    const isLocalDetection = id.startsWith('LOCAL-');

    setPotholes((current) => {
      const next = current.map((p) => p.id === id ? { ...p, ...nextUpdates } : p);
      setStats(buildStatsFromPotholes(next));
      return next;
    });

    if (isLocalDetection) {
      setLocalUpdates((current) => {
        const next = {
          ...current,
          [id]: {
            ...(current[id] || {}),
            ...nextUpdates,
          },
        };
        localStorage.setItem(LOCAL_UPDATE_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      return;
    }

    try {
      const res = await fetch(`/api/potholes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) {
        throw new Error(`Update failed with status ${res.status}`);
      }
      fetchData();
    } catch (err) {
      console.error('Update failed', err);
    }
  };

  const simulateDetection = async () => {
    // Generate a random location in Chennai
    const chennaiBounds = {
      lat: [12.9, 13.15],
      lng: [80.15, 80.3]
    };
    const lat = Math.random() * (chennaiBounds.lat[1] - chennaiBounds.lat[0]) + chennaiBounds.lat[0];
    const lng = Math.random() * (chennaiBounds.lng[1] - chennaiBounds.lng[0]) + chennaiBounds.lng[0];
    const routes = ['19B', '21G', '5C', '11', 'M70'];
    const bboxSize = Math.random() * 30000;

    try {
      await fetch('/api/potholes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          confidence: Math.random() * 0.2 + 0.75,
          busRouteId: routes[Math.floor(Math.random() * routes.length)],
          bboxSize
        })
      });
      fetchData();
    } catch (err) {
      console.error('Simulation failed', err);
    }
  };

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text font-sans selection:bg-brand-text selection:text-brand-bg relative">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-[1900] lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-[2000] w-[240px] border-r border-brand-text flex flex-col bg-brand-bg h-full overflow-hidden transition-transform duration-300 lg:static lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="px-4 py-5 border-b border-brand-text flex flex-col items-center text-center bg-brand-text text-brand-bg relative">
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-4 right-4 lg:hidden text-brand-bg"
          >
            <X size={20} />
          </button>
          <Logo className="w-full max-w-[180px] h-24 lg:max-w-[196px] lg:h-28 mb-3" />
          <div className="font-serif italic text-[10px] uppercase tracking-widest opacity-60 mb-1">GCC Partnered</div>
          <h1 className="text-lg lg:text-xl font-bold leading-none tracking-tighter uppercase">Urban Eyes</h1>
          <div className="text-[9px] font-mono mt-1 opacity-50">SMART CHENNAI SURVEY</div>
        </div>

        <nav className="flex-1 p-4 space-y-6 lg:space-y-8 overflow-y-auto">
          <section>
            <span className="font-serif italic text-[11px] uppercase opacity-50 block mb-3">Navigation</span>
            <div className="space-y-1">
              <NavItem 
                icon={<LayoutDashboard size={14} />} 
                label="Global Dashboard" 
                active={activeView === 'dashboard'} 
                onClick={() => { setActiveView('dashboard'); setIsMobileMenuOpen(false); }}
              />
              <NavItem 
                icon={<MapIcon size={14} />} 
                label="Geospatial Map" 
                active={activeView === 'map'} 
                onClick={() => { setActiveView('map'); setIsMobileMenuOpen(false); }}
              />
              <NavItem 
                icon={<ListOrdered size={14} />} 
                label="Live Detection Feed" 
                active={activeView === 'list'} 
                onClick={() => { setActiveView('list'); setIsMobileMenuOpen(false); }}
              />
              <NavItem 
                icon={<Settings size={14} />} 
                label="GCC Command Center" 
                active={activeView === 'admin'} 
                onClick={() => { setActiveView('admin'); setIsMobileMenuOpen(false); }}
              />
            </div>
          </section>

          <section className="hidden lg:block">
            <span className="font-serif italic text-[11px] uppercase opacity-50 block mb-3">System Metrics</span>
            <div className="space-y-2">
              <div className="text-[10px] font-mono border border-brand-text p-2 bg-white/50">
                <div className="opacity-50 mb-1 leading-none">UPTIME</div>
                <div className="font-bold">99.98% / STABLE</div>
              </div>
              <div className="text-[10px] font-mono border border-brand-text p-2 bg-white/50">
                <div className="opacity-50 mb-1 leading-none">ACTIVE NODES</div>
                <div className="font-bold">42 EDGE DEVICES</div>
              </div>
            </div>
          </section>
        </nav>

        <div className="p-4 border-t border-brand-text bg-brand-accent/50 space-y-3">
          <button 
            onClick={() => { simulateDetection(); setIsMobileMenuOpen(false); }}
            className="w-full h-10 border border-brand-text bg-brand-text text-brand-bg hover:bg-brand-bg hover:text-brand-text text-[10px] font-mono font-bold uppercase transition-all flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            Simulate Edge Trigger
          </button>
          <div className="flex justify-between font-mono text-[9px] opacity-40">
            <span>V_1.0.4</span>
            <span>GCC_ROOT_01</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-brand-text flex items-center justify-between px-4 lg:px-8 bg-white/30 backdrop-blur-sm sticky top-0 z-[1500]">
          <div className="flex items-center gap-3 lg:gap-12">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 border border-brand-text bg-brand-bg"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex flex-col">
              <span className="text-[10px] font-serif italic opacity-50 uppercase">Network Status</span>
              <span className="text-xs font-bold font-mono text-green-700 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                EDGE_LINK_STABLE
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-serif italic opacity-50 uppercase leading-none mb-1">Session</span>
              <span className="text-[10px] sm:text-xs font-mono font-bold">{new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit' })} IST</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <h2 className="text-[9px] sm:text-[10px] font-mono font-bold bg-brand-text text-brand-bg px-2 sm:px-3 py-1.5 uppercase tracking-wider whitespace-nowrap">
              {activeView.replace(/_/g, ' ')}
            </h2>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="h-full"
            >
              {activeView === 'dashboard' && <Dashboard stats={stats} potholes={potholes} />}
              {activeView === 'map' && <PotholeMap potholes={potholes} />}
              {activeView === 'list' && <PotholeList potholes={potholes} />}
              {activeView === 'admin' && <AdminPanel potholes={potholes} onUpdate={handleStatusUpdate} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-mono font-bold uppercase transition-all border ${
        active 
          ? 'bg-brand-text text-brand-bg border-brand-text shadow-none' 
          : 'text-brand-text/60 border-transparent hover:border-brand-text hover:text-brand-text'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        {label}
      </div>
      {active && <span className="text-[9px] bg-brand-bg text-brand-text px-1 leading-none py-0.5">ACTIVE</span>}
    </button>
  );
}
