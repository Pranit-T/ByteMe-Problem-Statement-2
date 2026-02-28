import React, { useState, useRef, useEffect } from 'react';
import {
    Send, Paperclip, UserCircle, Bot, Sparkles, ChevronLeft, ChevronRight,
    Plus, FolderOpen, MessageSquare, LogOut, Settings, User, X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { askExpert, checkHealth } from './api';
import './index.css';

function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [backendReady, setBackendReady] = useState(false);
    const [question, setQuestion] = useState('');
    const [selectedExpert, setSelectedExpert] = useState('SoftwareEngineer');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showAgentModal, setShowAgentModal] = useState(false); // Pop-up state
    const [expertResponse, setExpertResponse] = useState(null);
    const [geminiResponse, setGeminiResponse] = useState(null);
    const endOfMessagesRef = useRef(null);

    // Heartbeat for Backend Connection
    useEffect(() => {
        const verifyConnection = async () => {
            try {
                const health = await checkHealth();
                setBackendReady(health && health.status === 'ok');
            } catch (err) {
                setBackendReady(false);
            }
        };
        verifyConnection();
        const interval = setInterval(verifyConnection, 10000);
        return () => clearInterval(interval);
    }, []);

    // Scroll to bottom on new responses
    const scrollToBottom = () => endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    useEffect(() => scrollToBottom(), [expertResponse, geminiResponse]);

    // NEW CHAT: Reset System
    const handleNewChat = () => {
        setQuestion('');
        setExpertResponse(null);
        setGeminiResponse(null);
        setIsSubmitting(false);
    };

    const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsSubmitting(true);
    setExpertResponse({ status: 'loading' });
    setGeminiResponse({ status: 'loading' });

    try {
        // Step 1: Query the Expert FIRST
        const expertData = await askExpert(question, selectedExpert);
        setExpertResponse({ status: 'success', data: expertData });

        // Step 2: WAIT 500ms (This prevents the 500 Internal Error)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Step 3: Query Gemini SECOND
        const geminiData = await askExpert(question, 'none');
        setGeminiResponse({ status: 'success', data: geminiData });

        setQuestion('');
    } catch (err) {
        setExpertResponse({ status: 'error', error: "System collision detected." });
    } finally {
        setIsSubmitting(false);
    }
    };

    const renderResponseContent = (response, type) => {
        if (!response) return (
            <div className="flex flex-col items-center justify-center h-full text-white/20">
                <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm">Awaiting query...</p>
            </div>
        );

        if (response.status === 'loading') return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="glass-loader"></div>
                <p className="text-purple-300/50 animate-pulse text-xs tracking-tighter">PROCESSING...</p>
            </div>
        );

        if (response.status === 'error') return (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {response.error}
            </div>
        );

        const { answer, citations } = response.data;
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="prose prose-invert max-w-none text-white/90 text-sm leading-relaxed">
                    <ReactMarkdown>{answer}</ReactMarkdown>
                </div>
                {type === 'expert' && citations && citations.length > 0 && (
                    <div className="pt-4 border-t border-purple-500/10">
                        <p className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest mb-2">Verified Sources</p>
                        <div className="flex flex-wrap gap-2">
                            {citations.map((c, i) => (
                                <span key={i} className="text-[9px] px-2 py-1 bg-white/5 border border-white/10 rounded text-white/60">{c}</span>
                            ))}
                        </div>
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div className="h-screen w-full flex overflow-hidden text-white relative bg-[#08040f]">
            <div className="absolute inset-0 bg-grid pointer-events-none z-0"></div>
            
            {/* AGENT SELECTION POP-UP */}
            <AnimatePresence>
                {showAgentModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass-panel p-8 rounded-3xl border border-purple-500/30 max-w-md w-full relative">
                            <button onClick={() => setShowAgentModal(false)} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-5 h-5"/></button>
                            <h3 className="text-xl font-bold mb-6 text-fuchsia-400">Select Expert Agent</h3>
                            <div className="space-y-3">
                                {['SoftwareEngineer', 'BusinessConsultant', 'AgricultureExpert', 'CivilEngineer', 'Educator'].map(agent => (
                                    <button 
                                        key={agent}
                                        onClick={() => { setSelectedExpert(agent); setShowAgentModal(false); }}
                                        className={`w-full p-4 rounded-xl border text-left transition-all ${selectedExpert === agent ? 'bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-300' : 'bg-white/5 border-white/10 hover:border-purple-500'}`}
                                    >
                                        <span className="font-semibold">{agent.replace(/([A-Z])/g, ' $1').trim()}</span>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <AnimatePresence initial={false}>
                {sidebarOpen && (
                    <motion.aside initial={{ width: 0 }} animate={{ width: 280 }} exit={{ width: 0 }} className="h-full glass-panel border-r border-white/5 z-10 flex flex-col">
                        <div className="p-6 flex items-center space-x-3"><Bot className="text-fuchsia-500 w-6 h-6" /><h2 className="font-bold tracking-widest uppercase text-xs">Byte Expert</h2></div>
                        <div className="p-4 flex-1">
                            <button onClick={handleNewChat} className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 p-3 rounded-xl shadow-lg border border-white/10 hover:brightness-110 transition-all">
                                <Plus className="w-4 h-4" /><span className="text-xs font-bold uppercase tracking-wider">New Analysis</span>
                            </button>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Main */}
            <main className="flex-1 flex flex-col h-full relative z-10 pt-4">
                <header className="h-[72px] flex items-center justify-between px-8">
                    <div className="flex items-center space-x-6">
                        <h1 className="font-bold text-2xl">Dashboard</h1>
                        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                            <div className={`w-2 h-2 rounded-full ${backendReady ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`}></div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{backendReady ? 'Online' : 'Offline'}</span>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-hidden p-8 gap-6 flex flex-col lg:flex-row max-w-[1600px] mx-auto w-full">
                    <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-white/5 overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest">SME Expert Routing</h3>
                            {/* ACCURACY COUNTER */}
                            <div className={`px-2 py-1 rounded text-[9px] font-bold border ${expertResponse?.accuracy > 70 ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20'}`}>
                                {expertResponse?.accuracy ? `+${expertResponse.accuracy}% ACCURACY` : 'CALCULATING...'}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{renderResponseContent(expertResponse, 'expert')}</div>
                    </div>
                    <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-white/5 overflow-hidden">
                        <div className="p-4 border-b border-white/5"><h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest">Base Model (Gemini)</h3></div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{renderResponseContent(geminiResponse, 'gemini')}</div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 max-w-[1600px] mx-auto w-full">
                    <form onSubmit={handleSubmit} className="flex items-center bg-[#120a21]/90 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-3xl">
                        <button type="button" onClick={() => setShowAgentModal(true)} className="px-4 py-3 text-xs font-bold text-fuchsia-400 hover:text-white transition-colors bg-white/5 rounded-xl border border-white/5 ml-1 mr-2">
                            {selectedExpert.replace(/([A-Z])/g, ' $1').trim()}
                        </button>
                        <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Query the experts..." className="flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-white/10" />
                        <button type="submit" disabled={isSubmitting || !question.trim()} className="bg-gradient-to-r from-purple-600 to-fuchsia-600 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-20">
                            {isSubmitting ? 'Analysing...' : 'Send Query'}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}

export default App;