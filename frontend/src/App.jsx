import React, { useState, useRef, useEffect } from 'react';
import {
    Send, Paperclip, UserCircle, Bot, Sparkles, ChevronLeft, ChevronRight,
    Plus, FolderOpen, MessageSquare, LogOut, Settings, User, X, Clock
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { askExpert, checkHealth, fetchRoleRules, fetchHallucinationAnalysis } from './api';
import './index.css';

function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [backendReady, setBackendReady] = useState(false);
    const [question, setQuestion] = useState('');
    const [selectedExpert, setSelectedExpert] = useState('SoftwareEngineer');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showAgentModal, setShowAgentModal] = useState(false);
    const [expertResponse, setExpertResponse] = useState(null);
    const [geminiResponse, setGeminiResponse] = useState(null);
    const [analysisResponse, setAnalysisResponse] = useState(null);

    // History state
    const [chatHistory, setChatHistory] = useState([]);

    // Pre-fetched role rules state
    const [roleRules, setRoleRules] = useState(null);
    const [rulesLoading, setRulesLoading] = useState(false);

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

    // Fetch role rules whenever selectedExpert changes
    useEffect(() => {
        if (!backendReady) return;

        let cancelled = false;
        const loadRules = async () => {
            setRulesLoading(true);
            try {
                const data = await fetchRoleRules(selectedExpert);
                if (!cancelled) {
                    setRoleRules(data);
                }
            } catch (err) {
                if (!cancelled) setRoleRules(null);
            } finally {
                if (!cancelled) setRulesLoading(false);
            }
        };
        loadRules();
        return () => { cancelled = true; };
    }, [selectedExpert, backendReady]);

    // Scroll to bottom on new responses
    const scrollToBottom = () => endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    useEffect(() => scrollToBottom(), [expertResponse, geminiResponse, analysisResponse]);

    // NEW CHAT: Reset System
    const handleNewChat = () => {
        // Save current chat to history if exists
        if (expertResponse?.data?.answer) {
            setChatHistory(prev => [{
                question: expertResponse.question,
                expert: expertResponse.expert,
                date: new Date().toLocaleTimeString(),
            }, ...prev]);
        }
        setQuestion('');
        setExpertResponse(null);
        setGeminiResponse(null);
        setAnalysisResponse(null);
        setIsSubmitting(false);
    };

    const loadHistoryItem = (item) => {
        // Just plop the question back in the input for now
        setQuestion(item.question);
        setSelectedExpert(item.expert || 'SoftwareEngineer');
    };

    const runQuery = async (queryStr, expertRole) => {
        // If there's an existing chat on screen, archive it first
        if (expertResponse?.data?.answer) {
            setChatHistory(prev => [{
                question: expertResponse.question,
                expert: expertResponse.expert,
                date: new Date().toLocaleTimeString(),
            }, ...prev]);
        }

        setIsSubmitting(true);
        setExpertResponse({ status: 'loading', question: queryStr, expert: expertRole });
        setGeminiResponse({ status: 'loading' });
        setAnalysisResponse(null);

        try {
            // 1. Query Expert
            const expertData = await askExpert(queryStr, expertRole);
            setExpertResponse({ status: 'success', data: expertData, question: queryStr, expert: expertRole });

            await new Promise(resolve => setTimeout(resolve, 500));

            // 2. Query Base Model
            const baseData = await askExpert(queryStr, 'none');
            setGeminiResponse({ status: 'success', data: baseData });

            // 3. Analyze Hallucination
            setAnalysisResponse({ status: 'loading' });
            const analysisData = await fetchHallucinationAnalysis(
                expertData.answer,
                baseData.answer,
                queryStr,
                expertRole
            );
            setAnalysisResponse({ status: 'success', data: analysisData });

            setQuestion('');
        } catch (err) {
            setExpertResponse({ status: 'error', error: "System collision detected." });
            setGeminiResponse({ status: 'error', error: "Failed to generate." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!question.trim()) return;
        await runQuery(question, selectedExpert);
    };

    const handleRunDemo = async () => {
        const demoQuery = "I need to implement a LoRaWAN-based sensor network to monitor soil moisture levels and automatically trigger a fertigation cycle via a cloud dashboard. What is the most critical factor for success?";
        setSelectedExpert('SoftwareEngineer');
        setQuestion(demoQuery);
        await runQuery(demoQuery, 'SoftwareEngineer');
    };

    // Render the pre-fetched rules/roadmap section
    const renderRulesSection = () => {
        if (rulesLoading) {
            return (
                <div className="mt-6 pt-6 border-t border-white/5">
                    <div className="flex items-center space-x-3">
                        <div className="glass-loader" style={{ width: 20, height: 20, borderWidth: 2 }}></div>
                        <p className="text-[10px] text-purple-300/50 animate-pulse tracking-widest uppercase">Loading expert rules…</p>
                    </div>
                </div>
            );
        }

        if (!roleRules) return null;

        const { expert_rules, roadmap } = roleRules;

        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-6 pt-6 border-t border-white/5 space-y-6"
            >
                {expert_rules?.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest mb-3">Expert Guardrails</p>
                        <div className="grid grid-cols-1 gap-2">
                            {expert_rules.map((rule, i) => (
                                <div key={i} className="p-2 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/70">
                                    <span className="text-fuchsia-500 mr-2">◈</span> {rule}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {roadmap?.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3">Implementation Roadmap</p>
                        <div className="space-y-3 ml-2 border-l border-white/10 pl-4">
                            {roadmap.map((item, i) => (
                                <div key={i} className="relative">
                                    <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_#8b5cf6]"></div>
                                    <p className="text-[11px] font-bold text-white/90 uppercase">{item.step || item.title || `Step ${i + 1}`}</p>
                                    <p className="text-[10px] text-white/50">{item.desc || item.description || ''}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </motion.div>
        );
    };

    const renderResponseContent = (response, type) => {
        if (!response) return (
            <div className="flex flex-col items-center justify-center h-full text-white/20">
                <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm">Awaiting query...</p>
                {/* Show pre-loaded rules even before a query is submitted */}
                {type === 'expert' && renderRulesSection()}
            </div>
        );

        if (response.status === 'loading') return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="glass-loader"></div>
                <p className="text-purple-300/50 animate-pulse text-xs tracking-tighter">
                    {type === 'expert' ? 'ROUTING TO SME...' : 'GENERATING BASE RESPONSE...'}
                </p>
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

                {/* Show pre-cached rules/roadmap from background generation */}
                {type === 'expert' && renderRulesSection()}

                {/* ONLY SHOW CITATIONS FOR EXPERT TYPE */}
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
                            <button onClick={() => setShowAgentModal(false)} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
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
                        <div className="p-6 flex items-center space-x-3 border-b border-white/5">
                            <Bot className="text-fuchsia-500 w-6 h-6" />
                            <h2 className="font-bold tracking-widest uppercase text-xs">Byte Expert</h2>
                        </div>
                        <div className="p-4 space-y-3">
                            <button onClick={handleNewChat} className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 p-3 rounded-xl shadow-lg border border-white/10 hover:brightness-110 transition-all">
                                <Plus className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">New Analysis</span>
                            </button>
                            <button onClick={handleRunDemo} className="w-full flex items-center justify-center space-x-2 bg-amber-500/20 text-amber-400 p-3 rounded-xl border border-amber-500/30 hover:bg-amber-500/30 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                                <Sparkles className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">Run Live Demo</span>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
                            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 px-2 flex items-center"><Clock className="w-3 h-3 mr-1" /> History</h3>
                            {chatHistory.length === 0 ? (
                                <p className="text-[10px] text-white/20 px-2 italic">No previous chats.</p>
                            ) : (
                                <div className="space-y-2">
                                    {chatHistory.map((item, idx) => (
                                        <button key={idx} onClick={() => loadHistoryItem(item)} className="w-full text-left p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                                            <p className="text-xs text-white/80 truncate font-medium">{item.question}</p>
                                            <p className="text-[9px] text-white/40 uppercase tracking-wider mt-1">{item.expert.replace(/([A-Z])/g, ' $1').trim()}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Main */}
            <main className="flex-1 flex flex-col h-full relative z-10 pt-4">
                <header className="h-[72px] flex items-center justify-between px-8">
                    <div className="flex items-center space-x-6">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10"><Bot className="w-5 h-5 text-white/60" /></button>
                        <h1 className="font-bold text-2xl">Dashboard</h1>
                        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                            <div className={`w-2 h-2 rounded-full ${backendReady ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`}></div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{backendReady ? 'Online' : 'Offline'}</span>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-hidden p-8 gap-6 flex flex-col lg:flex-row max-w-[1600px] mx-auto w-full">
                    {/* LEFT PANEL: EXPERT */}
                    <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-white/5 overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest">SME Expert Routing</h3>
                                {rulesLoading && <span className="text-[8px] text-purple-400/60 animate-pulse uppercase tracking-widest">● caching rules</span>}
                            </div>
                            <div className={`px-2 py-1 rounded text-[9px] font-bold border ${expertResponse?.data?.accuracy > 70 ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20'}`}>
                                {expertResponse?.data?.accuracy ? `+${expertResponse.data.accuracy}% ACCURACY` : 'CALCULATING...'}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{renderResponseContent(expertResponse, 'expert')}</div>
                    </div>

                    {/* RIGHT PANEL: BASE + ANALYSIS */}
                    <div className="flex-1 flex flex-col space-y-6">
                        {/* Base Model Panel */}
                        <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-white/5 overflow-hidden min-h-0">
                            <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest">Base Model (Groq)</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{renderResponseContent(geminiResponse, 'gemini')}</div>
                        </div>

                        {/* Analysis Panel */}
                        {expertResponse?.status === 'success' && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-48 glass-panel rounded-2xl border border-amber-500/30 overflow-hidden flex flex-col bg-amber-500/5">
                                <div className="p-3 border-b border-amber-500/10 flex items-center justify-between bg-black/20">
                                    <h3 className="text-[10px] font-bold uppercase text-amber-500 tracking-widest flex items-center">
                                        <Sparkles className="w-3 h-3 mr-2" />
                                        Hallucination & Depth Analysis
                                    </h3>
                                    {analysisResponse?.data?.hallucination_score !== undefined && (
                                        <div className={`px-2 py-1 rounded text-[9px] font-bold border border-amber-500/30 text-amber-400 bg-amber-500/10`}>
                                            {analysisResponse.data.hallucination_score}% GENERIC/DRIFT
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar text-sm text-white/80 leading-relaxed">
                                    {!analysisResponse ? (
                                        <div className="flex items-center justify-center h-full text-white/20 italic text-xs">Awaiting models...</div>
                                    ) : analysisResponse.status === 'loading' ? (
                                        <div className="flex flex-col items-center justify-center h-full space-y-3">
                                            <div className="glass-loader" style={{ width: 24, height: 24, borderColor: 'rgba(245, 158, 11, 0.2)', borderBottomColor: '#f59e0b' }}></div>
                                            <p className="text-[10px] text-amber-500/50 animate-pulse uppercase tracking-widest">Analyzing differences...</p>
                                        </div>
                                    ) : (
                                        <ReactMarkdown className="prose prose-invert prose-sm max-w-none prose-p:leading-snug">{analysisResponse.data.analysis}</ReactMarkdown>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 max-w-[1600px] mx-auto w-full pt-0">
                    <form onSubmit={handleSubmit} className="flex items-center bg-[#120a21]/90 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-3xl">
                        <button type="button" onClick={() => setShowAgentModal(true)} className="px-4 py-3 text-xs font-bold text-fuchsia-400 hover:text-white transition-colors bg-white/5 rounded-xl border border-white/5 ml-1 mr-2 whitespace-nowrap">
                            {selectedExpert.replace(/([A-Z])/g, ' $1').trim()}
                        </button>
                        <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Query the experts..." className="flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-white/10" />
                        <button type="submit" disabled={isSubmitting || !question.trim()} className="bg-gradient-to-r from-purple-600 to-fuchsia-600 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-20 whitespace-nowrap">
                            {isSubmitting ? 'Analyzing...' : 'Send Query'}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}

export default App;