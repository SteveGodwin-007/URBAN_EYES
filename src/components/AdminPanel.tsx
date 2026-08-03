import React, { useState } from 'react';
import { Pothole, PotholeStatus } from '../types';
import { ShieldCheck, MessageSquare, Save, History, Search, BrainCircuit, Loader2 } from 'lucide-react';
import { analyzePothole } from '../services/geminiService';

export default function AdminPanel({ potholes, onUpdate }: { potholes: Pothole[], onUpdate: (id: string, updates: Partial<Pothole>) => void | Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState<PotholeStatus>(PotholeStatus.VIEWED);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedPothole = potholes.find(p => p.id === selectedId);

  const handleSave = async () => {
    if (selectedId) {
      setIsSaving(true);
      await onUpdate(selectedId, { status, remarks });
      setAiInsight(null);
      setIsSaving(false);
    }
  };

  const handleGetAiInsight = async () => {
    if (selectedPothole) {
      setIsAnalyzing(true);
      try {
        const insight = await analyzePothole(selectedPothole);
        setAiInsight(insight);
      } catch (err) {
        setAiInsight("AI Engine returned null or error.");
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const filteredPotholes = potholes.filter(p => 
    p.busRouteId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-140px)]">
      {/* List Area */}
      <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden lg:h-full">
        <div className="border border-brand-text bg-white p-3 flex items-center gap-3">
          <Search className="opacity-40" size={16} />
          <input 
            type="text" 
            placeholder="FILTER_COMMAND_NODE..." 
            className="flex-1 bg-transparent border-none outline-none text-xs font-mono font-bold uppercase placeholder:opacity-20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex-1 border border-brand-text bg-white flex flex-col overflow-hidden min-h-[400px] lg:min-h-0">
          <div className="p-3 border-b border-brand-text flex items-center justify-between bg-brand-text text-brand-bg font-mono text-[10px] uppercase font-bold">
            <span className="flex items-center gap-2">
              <History size={12} />
              Detection Registry
            </span>
            <span>{filteredPotholes.length} NODES</span>
          </div>
          <div className="flex-1 divide-y divide-brand-text/10 overflow-y-auto">
            {filteredPotholes.map((p) => (
              <div 
                key={p.id} 
                onClick={() => {
                  setSelectedId(p.id!);
                  setRemarks(p.remarks || '');
                  setStatus(p.status as PotholeStatus);
                  setAiInsight(null);
                }}
                className={`p-3 hover:bg-brand-bg transition-all cursor-pointer flex items-center justify-between group ${selectedId === p.id ? 'bg-brand-accent/30' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-8 border border-brand-text overflow-hidden bg-brand-bg">
                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" referrerPolicy="no-referrer" />
                  </div>
                  <div className="font-mono text-[10px]">
                    <div className="flex items-center gap-2 leading-none mb-1">
                      <span className="font-bold">AREA_{p.busRouteId}</span>
                      <span className={`px-1 border ${p.severity === 'LARGE' ? 'border-red-600 text-red-600' : 'border-brand-text/30'} text-[8px]`}>{p.severity}</span>
                    </div>
                    <div className="opacity-50 uppercase">{new Date(p.timestamp).toLocaleTimeString('en-IN', { hour12: false })}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end font-mono text-[9px]">
                  <span className={`font-bold ${p.status === 'ACTION_TAKEN' ? 'opacity-30 line-through' : ''}`}>{p.status}</span>
                  <span className="opacity-20">ID_{p.id?.slice(-6).toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Area */}
      <div className="flex flex-col gap-4">
        <div className={`flex-1 border border-brand-text bg-white flex flex-col overflow-hidden ${selectedId ? 'ring-2 ring-brand-text ring-inset' : 'opacity-40'}`}>
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <ShieldCheck size={32} className="opacity-20 mb-4" />
              <div className="font-serif italic text-[11px] opacity-40 uppercase">Awaiting Selection</div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="p-3 border-b border-brand-text bg-brand-text text-brand-bg font-mono text-[10px] font-bold uppercase">
                COMMAND_CENTER_V2
              </div>
              <div className="p-4 space-y-6 flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <div className="aspect-video border border-brand-text bg-brand-bg overflow-hidden relative">
                     <img src={selectedPothole?.imageUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                     <div className="absolute top-2 left-2 bg-brand-text text-brand-bg px-2 py-0.5 text-[8px] font-mono">LIVE_FRAME</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-serif italic text-[10px] opacity-50 uppercase tracking-widest">AI Agent Analysis</label>
                      <button 
                        onClick={handleGetAiInsight}
                        disabled={isAnalyzing}
                        className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase bg-brand-accent/20 px-2 py-1 border border-brand-text/20 hover:bg-brand-accent/40 transition-all disabled:opacity-50"
                      >
                        {isAnalyzing ? <Loader2 size={10} className="animate-spin" /> : <BrainCircuit size={10} />}
                        Invoke_Gemini
                      </button>
                    </div>
                    {aiInsight && (
                      <div className="p-3 border border-brand-text bg-brand-accent/5 font-mono text-[9px] animate-in fade-in slide-in-from-top-2 duration-300">
                        {aiInsight}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="font-serif italic text-[10px] opacity-50 uppercase tracking-widest">Target Status</label>
                    <div className="grid grid-cols-1 gap-1">
                      {[
                        PotholeStatus.DETECTED,
                        PotholeStatus.SENT_TO_GCC,
                        PotholeStatus.VIEWED,
                        PotholeStatus.ACTION_TAKEN,
                      ].map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(s as PotholeStatus)}
                          className={`py-2 px-3 border text-[10px] font-mono font-bold uppercase transition-all ${
                            status === s 
                              ? 'bg-brand-text border-brand-text text-brand-bg' 
                              : 'bg-white border-brand-text text-brand-text hover:bg-brand-bg'
                          }`}
                        >
                          {s.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="font-serif italic text-[10px] opacity-50 uppercase tracking-widest flex items-center gap-1.5">
                      <MessageSquare size={10} />
                      Field Observations
                    </label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="w-full h-32 p-3 font-mono text-[10px] bg-brand-bg border border-brand-text outline-none focus:bg-white transition-all resize-none font-bold placeholder:opacity-20"
                      placeholder="ENTER_DATA_STRING..."
                    />
                  </div>

                  {/* Activity Log */}
                  <div className="pt-4 border-t border-brand-text/10 space-y-3">
                    <label className="font-serif italic text-[10px] opacity-50 uppercase tracking-widest flex items-center gap-1.5">
                      <History size={10} />
                      Lifecycle Registry
                    </label>
                    <div className="space-y-3">
                      {selectedPothole?.history && selectedPothole.history.length > 0 ? (
                        [...selectedPothole.history].reverse().map((log, i) => (
                          <div key={i} className="relative pl-4 border-l border-brand-text/20 py-1">
                            <div className="absolute -left-[4.5px] top-2 w-2 h-2 rounded-full bg-brand-text"></div>
                            <div className="font-mono text-[9px]">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-bold">{log.status}</span>
                                <span className="opacity-40">{new Date(log.timestamp).toLocaleString('en-IN', { hour12: false })}</span>
                              </div>
                              <p className="opacity-70 leading-relaxed italic">"{log.remarks}"</p>
                              <div className="mt-1 opacity-30 uppercase text-[7px] font-bold">BY: {log.actionBy}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="font-mono text-[9px] opacity-30 italic py-2">
                          NO_HISTORICAL_NODES_FOUND
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-brand-text bg-brand-accent/20">
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full py-3 bg-brand-text text-brand-bg hover:bg-white hover:text-brand-text border border-brand-text font-mono font-bold text-[11px] uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {isSaving ? 'Updating_Node' : 'Execute_Update'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
