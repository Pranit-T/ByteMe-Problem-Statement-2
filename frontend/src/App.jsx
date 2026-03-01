import React, { useState, useRef, useEffect } from 'react';
import {
    Send, Paperclip, UserCircle, Bot, Sparkles, ChevronLeft, ChevronRight,
    Plus, FolderOpen, MessageSquare, LogOut, Settings, User, X, Clock, Terminal
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { askExpert, checkHealth, fetchRoleRules, fetchHallucinationAnalysis, fetchCustomRoles, saveCustomRole, generateRules, uploadKnowledgeFile } from './api';
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
    const [modelProvider, setModelProvider] = useState('groq');

    // History state
    const [chatHistory, setChatHistory] = useState([]);

    // Pre-fetched role rules state
    const [roleRules, setRoleRules] = useState(null);
    const [rulesLoading, setRulesLoading] = useState(false);

    // Custom Roles State
    const [customRoles, setCustomRoles] = useState([]);
    const [activeAgentTab, setActiveAgentTab] = useState('system'); // system, custom
    const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
    const [newAgentName, setNewAgentName] = useState('');
    const [customFile, setCustomFile] = useState(null);
    const [creatingAgentStatus, setCreatingAgentStatus] = useState(''); // '', 'extracting', 'generating', 'saving', 'error'

    // Chat Upload State
    const [showChatUploadModal, setShowChatUploadModal] = useState(false);
    const [chatUploadFile, setChatUploadFile] = useState(null);
    const [chatUploadingStatus, setChatUploadingStatus] = useState(''); // '', 'extracting', 'generating', 'saving', 'error', 'success'

    const endOfMessagesRef = useRef(null);

    // API Modal & Key config state
    const [showApiModal, setShowApiModal] = useState(false);
    const bytemeApiKey = "sk-byteme-beta";
    const [localGroqKey, setLocalGroqKey] = useState(localStorage.getItem('groqKey') || '');
    const [localOpenAIKey, setLocalOpenAIKey] = useState(localStorage.getItem('openaiKey') || '');
    const [saveKeysStatus, setSaveKeysStatus] = useState('');

    const handleSaveKeys = () => {
        setSaveKeysStatus('saving');
        localStorage.setItem('groqKey', localGroqKey.trim());
        localStorage.setItem('openaiKey', localOpenAIKey.trim());
        setTimeout(() => setSaveKeysStatus('success'), 400);
        setTimeout(() => setSaveKeysStatus(''), 2000);
    };

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

    // Fetch custom roles
    useEffect(() => {
        if (!backendReady) return;
        fetchCustomRoles().then(data => {
            if (data?.roles) setCustomRoles(data.roles);
        }).catch(err => console.error(err));
    }, [backendReady, showCreateAgentModal]);

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
            const expertData = await askExpert(queryStr, expertRole, modelProvider);
            setExpertResponse({ status: 'success', data: expertData, question: queryStr, expert: expertRole });

            await new Promise(resolve => setTimeout(resolve, 500));

            // 2. Query Base Model
            const baseData = await askExpert(queryStr, 'none', modelProvider);
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
            const detail = err?.response?.data?.detail;
            const expertErr = detail ? `Error: ${detail}` : "System collision detected.";
            const baseErr = detail ? `Error: ${detail}` : "Failed to generate.";
            setExpertResponse({ status: 'error', error: expertErr });
            setGeminiResponse({ status: 'error', error: baseErr });
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

    const autoGenerateRules = async () => {
        if (!newAgentName.trim()) return;
        setCreatingAgentStatus('extracting');
        try {
            let extractedText = null;
            if (customFile) {
                const extractionRes = await uploadKnowledgeFile(customFile);
                if (extractionRes?.text) extractedText = extractionRes.text;
            }

            setCreatingAgentStatus('generating');
            const rules = await generateRules(newAgentName, extractedText, modelProvider);

            setCreatingAgentStatus('saving');
            await saveCustomRole({
                role_name: newAgentName,
                core_directive: rules.core_directive,
                expert_rules: rules.expert_rules,
                roadmap: rules.roadmap,
                knowledge_base: extractedText
            });
            const updated = await fetchCustomRoles();
            if (updated?.roles) setCustomRoles(updated.roles);
            setCreatingAgentStatus('success');
            setTimeout(() => {
                setShowCreateAgentModal(false);
                setNewAgentName('');
                setCustomFile(null);
                setCreatingAgentStatus('');
                setActiveAgentTab('custom');
                setShowAgentModal(true);
            }, 1000);
        } catch (err) {
            setCreatingAgentStatus('error');
        }
    };

    const handleChatUpload = async () => {
        if (!chatUploadFile) return;
        setChatUploadingStatus('extracting');
        try {
            const extractionRes = await uploadKnowledgeFile(chatUploadFile);
            let extractedText = '';
            if (extractionRes?.text) extractedText = extractionRes.text;

            const nameWithoutExt = chatUploadFile.name.replace(/\.[^/.]+$/, "");

            setChatUploadingStatus('generating');
            const rules = await generateRules(nameWithoutExt, extractedText, modelProvider);

            setChatUploadingStatus('saving');
            await saveCustomRole({
                role_name: nameWithoutExt,
                core_directive: rules.core_directive,
                expert_rules: rules.expert_rules,
                roadmap: rules.roadmap,
                knowledge_base: extractedText
            });
            const updated = await fetchCustomRoles();
            if (updated?.roles) setCustomRoles(updated.roles);

            setChatUploadingStatus('success');

            // Auto-select immediately
            setSelectedExpert(nameWithoutExt);

            setTimeout(() => {
                setShowChatUploadModal(false);
                setChatUploadFile(null);
                setChatUploadingStatus('');
            }, 1000);
        } catch (err) {
            console.error("====== CHAT UPLOAD FAILED ======");
            console.error("The error object:", err);
            console.error("Response data if any:", err?.response?.data);
            setChatUploadingStatus('error');
        }
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
                        <div className="grid grid-cols-1 gap-4">
                            {expert_rules.map((rule, i) => (
                                <div key={i} className="p-3 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/70 leading-relaxed">
                                    <span className="text-fuchsia-500 mr-2 font-bold">◈</span> {rule}
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

        const { answer, citations, generated_by_model, out_of_scope } = response.data;

        // Out-of-scope guardrail: expert declined the question
        if (out_of_scope && type === 'expert') return (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center h-full space-y-4 text-center px-6">
                <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                    <span className="text-2xl">🚫</span>
                </div>
                <p className="text-amber-400 font-bold text-sm uppercase tracking-widest">Out of Expertise</p>
                <p className="text-white/50 text-xs leading-relaxed max-w-xs">{answer}</p>
                <p className="text-white/20 text-[9px] uppercase tracking-widest">Switch to a different expert or rephrase your question.</p>
            </motion.div>
        );

        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className={`prose prose-invert max-w-none text-white/90 text-sm leading-relaxed p-6 rounded-2xl border backdrop-blur-sm shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] ${type === 'expert' ? 'bg-fuchsia-900/10 border-fuchsia-500/20' : 'bg-black/20 border-white/5'}`}>
                    <ReactMarkdown>{answer}</ReactMarkdown>
                </div>

                {/* Show Model Badge for Base Model */}
                {type === 'gemini' && generated_by_model && (
                    <div className="flex justify-end pr-2 -mt-2 fade-in-up">
                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest border border-white/10 px-2 py-1 rounded bg-black/40">
                            Generated by {generated_by_model}
                        </span>
                    </div>
                )}

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
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass-panel p-8 rounded-3xl border border-purple-500/30 max-w-md w-full relative max-h-[80vh] flex flex-col">
                            <button onClick={() => setShowAgentModal(false)} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-5 h-5 icon-spin-hover" /></button>
                            <h3 className="text-xl font-bold mb-6 text-fuchsia-400">Select Expert Agent</h3>

                            {/* Tabs */}
                            <div className="flex space-x-2 mb-4 bg-white/5 p-1 rounded-xl shrink-0">
                                <button onClick={() => setActiveAgentTab('system')} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeAgentTab === 'system' ? 'bg-fuchsia-500 text-white shadow-[0_0_15px_#d946ef]' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>System</button>
                                <button onClick={() => setActiveAgentTab('custom')} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeAgentTab === 'custom' ? 'bg-purple-500 text-white shadow-[0_0_15px_#a855f7]' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>Custom Data</button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                                {activeAgentTab === 'system' && (
                                    ['SoftwareEngineer', 'BusinessConsultant', 'AgricultureExpert', 'CivilEngineer', 'Educator'].map(agent => (
                                        <button
                                            key={agent}
                                            onClick={() => { setSelectedExpert(agent); setShowAgentModal(false); }}
                                            className={`w-full p-4 rounded-xl border text-left transition-all ${selectedExpert === agent ? 'bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-300' : 'bg-white/5 border-white/10 hover:border-purple-500'}`}
                                        >
                                            <span className="font-semibold">{agent.replace(/([A-Z])/g, ' $1').trim()}</span>
                                        </button>
                                    ))
                                )}

                                {activeAgentTab === 'custom' && (
                                    <>
                                        {customRoles.length === 0 ? (
                                            <div className="text-center py-8 text-white/40 text-sm italic">No custom agents found.</div>
                                        ) : (
                                            customRoles.map(role => (
                                                <button
                                                    key={role.role_name}
                                                    onClick={() => { setSelectedExpert(role.role_name); setShowAgentModal(false); }}
                                                    className={`w-full p-4 rounded-xl border text-left transition-all ${selectedExpert === role.role_name ? 'bg-purple-500/20 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:border-purple-500'}`}
                                                >
                                                    <span className="font-semibold block">{role.role_name}</span>
                                                    <span className="text-[10px] text-white/50 block mt-1 truncate">{role.core_directive}</span>
                                                </button>
                                            ))
                                        )}
                                        <button
                                            onClick={() => { setShowAgentModal(false); setShowCreateAgentModal(true); }}
                                            className="w-full mt-4 p-4 rounded-xl border border-dashed border-purple-500/50 text-purple-400 hover:bg-purple-500/10 transition-all flex items-center justify-center space-x-2 shadow-[0_0_20px_rgba(168,85,247,0.1)]"
                                        >
                                            <Plus className="w-5 h-5" />
                                            <span className="font-bold">Create New Expert</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* CREATE CUSTOM AGENT POP-UP */}
            <AnimatePresence>
                {showCreateAgentModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass-panel p-8 rounded-3xl border border-purple-500/30 max-w-md w-full relative flex flex-col items-center">
                            <button onClick={() => { setShowCreateAgentModal(false); setShowAgentModal(true); setNewAgentName(''); setCustomFile(null); setCreatingAgentStatus(''); }} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-5 h-5 icon-spin-hover" /></button>

                            <Sparkles className="w-12 h-12 text-fuchsia-400 mb-4 animate-pulse" />
                            <h3 className="text-xl font-bold mb-2 text-fuchsia-400 text-center">AI Agent Generator</h3>
                            <p className="text-xs text-white/50 text-center mb-6">Type a job title and upload optional strict rules. The AI will generate a strict persona configuration.</p>

                            <input
                                type="text"
                                value={newAgentName}
                                onChange={(e) => setNewAgentName(e.target.value)}
                                placeholder="e.g. Senior Theoretical Physicist"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500 mb-4 text-center"
                                disabled={creatingAgentStatus !== '' && creatingAgentStatus !== 'error'}
                            />

                            <div className="w-full mb-6 relative">
                                <input
                                    type="file"
                                    id="file-upload"
                                    className="hidden"
                                    accept=".pdf,.txt,.docx"
                                    onChange={(e) => setCustomFile(e.target.files[0])}
                                    disabled={creatingAgentStatus !== '' && creatingAgentStatus !== 'error'}
                                />
                                <label
                                    htmlFor="file-upload"
                                    className={`w-full flex items-center justify-center space-x-2 border border-dashed rounded-xl p-4 cursor-pointer transition-all ${customFile ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300' : 'border-white/20 hover:border-fuchsia-500/40 text-white/50 hover:bg-white/5'} ${creatingAgentStatus !== '' && creatingAgentStatus !== 'error' ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    <Paperclip className="w-4 h-4" />
                                    <span className="text-xs font-medium truncate max-w-[200px]">{customFile ? customFile.name : 'Attach Rule Data (.pdf, .txt, .docx)'}</span>
                                </label>
                            </div>

                            <button
                                onClick={autoGenerateRules}
                                disabled={!newAgentName.trim() || (creatingAgentStatus !== '' && creatingAgentStatus !== 'error')}
                                className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 px-6 py-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                            >
                                {creatingAgentStatus === '' || creatingAgentStatus === 'error' ? 'Generate & Save Expert' : null}
                                {creatingAgentStatus === 'extracting' ? <><span className="animate-pulse">Reading File...</span></> : null}
                                {creatingAgentStatus === 'generating' ? <><span className="animate-pulse">Building AI Rules...</span></> : null}
                                {creatingAgentStatus === 'saving' ? <><span className="animate-pulse">Saving to Supabase...</span></> : null}
                                {creatingAgentStatus === 'success' ? <span className="text-green-300">Success!</span> : null}
                            </button>
                            {creatingAgentStatus === 'error' && <p className="text-red-400 text-xs mt-3">Failed to generate agent. Try again.</p>}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* API MODAL */}
            <AnimatePresence>
                {showApiModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowApiModal(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-[#1a0f2e] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                                <h2 className="text-sm font-bold flex items-center">
                                    <Terminal className="w-4 h-4 mr-2 text-fuchsia-400" />
                                    Developer & API Configuration
                                </h2>
                                <button onClick={() => setShowApiModal(false)} className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 icon-spin-hover" /></button>
                            </div>
                            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col space-y-8 text-sm text-white/80">

                                {/* Custom API Keys Config */}
                                <div className="border border-white/10 rounded-xl bg-black/20 p-5 space-y-4">
                                    <h3 className="text-xs font-bold uppercase text-fuchsia-400 tracking-widest flex items-center border-b border-white/10 pb-3">
                                        <Settings className="w-4 h-4 mr-2" /> Custom AI Provider Keys
                                    </h3>
                                    <p className="text-xs text-white/50 leading-relaxed font-medium">
                                        By default, Byte Expert runs on the server's backend quota. Input your own API keys below to bypass server rate limits. These keys are stored safely and strictly in your browser's local storage.
                                    </p>
                                    <div className="space-y-4 pt-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-2">Groq API Key (Llama 3.1)</label>
                                            <input type="password" value={localGroqKey} onChange={(e) => setLocalGroqKey(e.target.value)} placeholder="gsk_..." className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs outline-none focus:border-fuchsia-500/50 transition-all font-mono shadow-inner" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-2">OpenAI API Key (GPT-4o Mini)</label>
                                            <input type="password" value={localOpenAIKey} onChange={(e) => setLocalOpenAIKey(e.target.value)} placeholder="sk-proj-..." className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs outline-none focus:border-purple-500/50 transition-all font-mono shadow-inner" />
                                        </div>
                                        <div className="pt-2 border-t border-white/5">
                                            <button onClick={handleSaveKeys} className={`px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${saveKeysStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-600/40'}`}>
                                                {saveKeysStatus === 'success' ? 'Saved Successfully ✓' : 'Save Keys to Local Storage'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* API-as-a-Service docs */}
                                <div>
                                    <h3 className="text-xs font-bold uppercase text-purple-400 tracking-widest flex items-center border-b border-white/10 pb-3 mb-4">
                                        <Bot className="w-4 h-4 mr-2" /> API-as-a-Service (Headless)
                                    </h3>
                                    <p className="mb-2 text-xs leading-relaxed">Use your custom agents in Cursor, LangChain, Flowise, or any external tool that supports OpenAI's API format.</p>
                                    <p className="mb-4">Simply set the Base URL to your ByteMe server and use the API Key below. For the <strong>model</strong> parameter, pass the precise name of the Custom Agent you created.</p>

                                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
                                        <div>
                                            <span className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">Base URL</span>
                                            <code className="text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded text-xs">http://localhost:8000/api/v1</code>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">API Key (Demo)</span>
                                            <div className="flex items-center space-x-2">
                                                <code className="text-fuchsia-400 bg-fuchsia-400/10 px-2 py-1 rounded text-xs flex-1">{bytemeApiKey}</code>
                                                <button onClick={() => navigator.clipboard.writeText(bytemeApiKey)} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">Copy</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest mb-2">cURL Example</h3>
                                    <pre className="bg-black/60 border border-white/10 rounded-xl p-4 overflow-x-auto text-[11px] text-white/70 leading-relaxed custom-scrollbar">
                                        {`curl http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${bytemeApiKey}" \\
  -d '{
    "model": "SoftwareEngineer",
    "messages": [
      {
        "role": "user",
        "content": "How do I secure a JWT token system?"
      }
    ],
    "temperature": 0.7
  }'`}
                                    </pre>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* CHAT QUICK UPLOAD POP-UP */}
            <AnimatePresence>
                {showChatUploadModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="p-8 rounded-3xl border border-dashed border-white/20 bg-white/5 backdrop-blur-xl max-w-sm w-full relative flex flex-col items-center shadow-2xl">
                            <button onClick={() => { setShowChatUploadModal(false); setChatUploadFile(null); setChatUploadingStatus(''); }} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-5 h-5 icon-spin-hover" /></button>

                            <Paperclip className="w-10 h-10 text-white/50 mb-3" />
                            <h3 className="text-lg font-bold mb-4 text-white text-center">Upload Agent Rulebook</h3>

                            <div className="w-full mb-6 relative">
                                <input
                                    type="file"
                                    id="chat-file-upload"
                                    className="hidden"
                                    accept=".pdf,.txt,.docx"
                                    onChange={(e) => {
                                        setChatUploadFile(e.target.files[0]);
                                    }}
                                    disabled={chatUploadingStatus !== '' && chatUploadingStatus !== 'error'}
                                />
                                <label
                                    htmlFor="chat-file-upload"
                                    className={`w-full flex items-center justify-center space-x-2 border border-dashed rounded-xl p-4 cursor-pointer transition-all ${chatUploadFile ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300' : 'border-white/20 hover:border-fuchsia-500/40 text-white/50 hover:bg-white/5'} ${chatUploadingStatus !== '' && chatUploadingStatus !== 'error' ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    <FolderOpen className="w-4 h-4 icon-anim" />
                                    <span className="text-xs font-medium truncate max-w-[200px]">{chatUploadFile ? chatUploadFile.name : 'Select File (.pdf, .txt, .docx)'}</span>
                                </label>
                            </div>

                            <button
                                onClick={handleChatUpload}
                                disabled={!chatUploadFile || (chatUploadingStatus !== '' && chatUploadingStatus !== 'error')}
                                className="w-full bg-white text-black px-6 py-3 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center shadow-lg hover:bg-white/90"
                            >
                                {chatUploadingStatus === '' || chatUploadingStatus === 'error' ? 'Generate & Save Agent' : null}
                                {chatUploadingStatus === 'extracting' ? <><span className="animate-pulse">Reading File...</span></> : null}
                                {chatUploadingStatus === 'generating' ? <><span className="animate-pulse">Analyzing Rulebook...</span></> : null}
                                {chatUploadingStatus === 'saving' ? <><span className="animate-pulse">Saving Agent...</span></> : null}
                                {chatUploadingStatus === 'success' ? <span className="text-green-600">Success!</span> : null}
                            </button>
                            {chatUploadingStatus === 'error' && <p className="text-red-400 text-xs mt-3">Failed to upload agent. Try again.</p>}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <AnimatePresence initial={false}>
                {sidebarOpen && (
                    <motion.aside initial={{ width: 0 }} animate={{ width: 280 }} exit={{ width: 0 }} transition={{ duration: 0.3, ease: 'easeInOut' }} className="h-full glass-panel border-r border-white/5 z-10 flex flex-col overflow-hidden whitespace-nowrap">
                        <div className="p-6 flex items-center space-x-3 border-b border-white/5">
                            <Bot className="text-fuchsia-500 w-6 h-6" />
                            <h2 className="font-bold tracking-widest uppercase text-xs">Byte Expert</h2>
                        </div>
                        <div className="p-4 space-y-3">
                            <button onClick={handleNewChat} className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 p-3 rounded-xl shadow-lg border border-white/10 hover:brightness-110 transition-all">
                                <Plus className="w-4 h-4 icon-anim" />
                                <span className="text-xs font-bold uppercase tracking-wider">New Analysis</span>
                            </button>
                            <button onClick={handleRunDemo} className="w-full flex items-center justify-center space-x-2 bg-amber-500/20 text-amber-400 p-3 rounded-xl border border-amber-500/30 hover:bg-amber-500/30 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                                <Sparkles className="w-4 h-4 icon-anim" />
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
                        <h1 className="font-bold text-2xl mr-4">Dashboard</h1>
                        <button onClick={() => setShowApiModal(true)} className="flex items-center space-x-2 bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 px-3 py-1.5 rounded-full hover:bg-fuchsia-500/20 transition-colors">
                            <Terminal className="w-3 h-3 icon-anim" />
                            <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Developer API</span>
                        </button>
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
                                <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest">Base Model</h3>
                                <div className="flex bg-black/40 border border-white/10 rounded-lg p-0.5">
                                    <button onClick={() => setModelProvider('groq')} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md ${modelProvider === 'groq' ? 'bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'text-white/40 hover:text-white'}`}>Groq</button>
                                    <button onClick={() => setModelProvider('openai')} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md ${modelProvider === 'openai' ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'text-white/40 hover:text-white'}`}>OpenAI</button>
                                </div>
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
                                        <div className="bg-amber-900/10 rounded-xl p-4 border border-amber-500/10 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
                                            <ReactMarkdown className="prose prose-invert prose-sm max-w-none prose-p:leading-snug">{analysisResponse.data.analysis}</ReactMarkdown>
                                        </div>
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
                        <button type="button" onClick={() => setShowChatUploadModal(true)} className="p-3 mr-2 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10">
                            <Paperclip className="w-5 h-5 icon-anim" />
                        </button>
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