import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, Plus, Sparkles, Clock, X, Terminal, Shield, UserCircle, Linkedin, Github, Mail, MessageSquare, Paperclip, FolderOpen, Trash2, Code, Briefcase, Leaf, HardHat, GraduationCap, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { askExpert, checkHealth, fetchRoleRules, fetchHallucinationAnalysis, fetchCustomRoles, saveCustomRole, generateRules, uploadKnowledgeFile, deleteCustomRole } from './api';
const Dither = lazy(() => import('./Dither'));
import './index.css';

class DitherErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(err) { console.warn('Dither background failed:', err); }
    render() {
        if (this.state.hasError) return <div className="absolute inset-0 bg-grid" />;
        return this.props.children;
    }
}

function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true);
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

    // Rate limit cooldown state
    const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
    const rateLimitTimerRef = useRef(null);

    // Interactive roadmap state
    const [expandedRoadmapStep, setExpandedRoadmapStep] = useState(null);
    const [copiedStep, setCopiedStep] = useState(null);

    const endOfMessagesRef = useRef(null);

    // API Modal & Key config state
    const [showApiModal, setShowApiModal] = useState(false);
    const bytemeApiKey = "sk-byteme-beta";
    const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api$/, '');
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

    // Rate limit countdown timer
    useEffect(() => {
        if (rateLimitCountdown <= 0) {
            if (rateLimitTimerRef.current) {
                clearInterval(rateLimitTimerRef.current);
                rateLimitTimerRef.current = null;
            }
            return;
        }
        rateLimitTimerRef.current = setInterval(() => {
            setRateLimitCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(rateLimitTimerRef.current);
                    rateLimitTimerRef.current = null;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (rateLimitTimerRef.current) {
                clearInterval(rateLimitTimerRef.current);
                rateLimitTimerRef.current = null;
            }
        };
    }, [rateLimitCountdown]);

    // Scroll to bottom on new responses
    const scrollToBottom = () => endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    useEffect(() => scrollToBottom(), [expertResponse, geminiResponse, analysisResponse]);

    // NEW CHAT: Reset System
    const handleNewChat = () => {
        // Save current chat to history if exists
        if (expertResponse?.data?.answer) {
            setChatHistory(prev => {
                if (prev.some(h => h.question === expertResponse.question)) return prev;
                return [{
                    question: expertResponse.question,
                    expert: expertResponse.expert,
                    date: new Date().toLocaleTimeString(),
                    savedExpertResponse: expertResponse,
                    savedGeminiResponse: geminiResponse,
                    savedAnalysisResponse: analysisResponse
                }, ...prev];
            });
        }
        setQuestion('');
        setExpertResponse(null);
        setGeminiResponse(null);
        setAnalysisResponse(null);
        setIsSubmitting(false);
    };

    const handleDeleteCustomRole = async (e, roleName) => {
        e.stopPropagation(); // prevent clicking the button from selecting the agent
        if (!confirm(`Are you sure you want to delete the expert "${roleName}"?`)) return;

        try {
            await deleteCustomRole(roleName);
            // Remove from local list to update UI immediately
            setCustomRoles(prev => prev.filter(r => r.role_name !== roleName));
            if (selectedExpert === roleName) {
                setSelectedExpert('SoftwareEngineer');
            }
        } catch (error) {
            alert("Failed to delete custom role. Check console for details.");
            console.error(error);
        }
    };

    const loadHistoryItem = (item) => {
        // If we have cached full responses, restore them instantly
        if (item.savedExpertResponse) {
            // Un-save the currently active chat before switching
            if (expertResponse?.data?.answer && expertResponse.question !== item.question) {
                setChatHistory(prev => {
                    // Check if current chat is already in history to avoid duplicates
                    if (prev.some(h => h.question === expertResponse.question)) return prev;
                    return [{
                        question: expertResponse.question,
                        expert: expertResponse.expert,
                        date: new Date().toLocaleTimeString(),
                        savedExpertResponse: expertResponse,
                        savedGeminiResponse: geminiResponse,
                        savedAnalysisResponse: analysisResponse
                    }, ...prev];
                });
            }

            setQuestion(item.question);
            setSelectedExpert(item.expert || 'SoftwareEngineer');
            setExpertResponse(item.savedExpertResponse);
            setGeminiResponse(item.savedGeminiResponse);
            setAnalysisResponse(item.savedAnalysisResponse);
        } else {
            // Fallback for older history items without cached responses
            setQuestion(item.question);
            setSelectedExpert(item.expert || 'SoftwareEngineer');
        }
    };

    const runQuery = async (queryStr, expertRole) => {
        // If there's an existing chat on screen, archive it first
        if (expertResponse?.data?.answer) {
            setChatHistory(prev => {
                // Prevent duplicate saving if already in history
                if (prev.some(h => h.question === expertResponse.question)) return prev;
                return [{
                    question: expertResponse.question,
                    expert: expertResponse.expert,
                    date: new Date().toLocaleTimeString(),
                    savedExpertResponse: expertResponse,
                    savedGeminiResponse: geminiResponse,
                    savedAnalysisResponse: analysisResponse
                }, ...prev];
            });
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
            const status = err?.response?.status;
            const expertErr = detail ? `Error: ${detail}` : "System collision detected.";
            const baseErr = detail ? `Error: ${detail}` : "Failed to generate.";
            const isRateLimit = status === 429 || (typeof detail === 'string' && detail.toLowerCase().includes('rate limit'));
            setExpertResponse({ status: 'error', error: expertErr, isRateLimit });
            setGeminiResponse({ status: 'error', error: baseErr, isRateLimit });
            if (isRateLimit) {
                setRateLimitCountdown(60);
            }
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
                        <p className="text-[10px] text-[#00D7D2]/50 animate-pulse tracking-widest uppercase">Loading expert rules…</p>
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
                        <p className="text-[10px] font-bold text-[#00D7D2] uppercase tracking-widest mb-3">Expert Guardrails</p>
                        <div className="grid grid-cols-1 gap-4">
                            {expert_rules.map((rule, i) => (
                                <div key={i} className="p-3 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/70 leading-relaxed border-l-2 border-l-[#00D7D2]/10 rule-inject-anim" style={{ animationDelay: `${i * 0.1}s` }}>
                                    <span className="text-[#0aada9] mr-2 font-bold">◈</span> {rule}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {roadmap?.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold text-[#00D7D2] uppercase tracking-widest mb-3">Implementation Roadmap</p>
                        <div className="space-y-1 ml-2 border-l border-white/10 pl-4">
                            {roadmap.map((item, i) => {
                                const isExpanded = expandedRoadmapStep === i;
                                const stepTitle = item.step || item.title || `Step ${i + 1}`;
                                const stepDesc = item.desc || item.description || '';
                                return (
                                    <div key={i} className="relative">
                                        <div className={`absolute -left-[21px] top-2.5 w-2.5 h-2.5 rounded-full transition-all duration-300 ${isExpanded ? 'bg-[#00D7D2] shadow-[0_0_12px_#00D7D2,0_0_24px_rgba(0,255,65,0.3)] scale-125' : 'bg-[#0aada9] shadow-[0_0_6px_#0aada9]'}`}></div>
                                        <button
                                            onClick={() => setExpandedRoadmapStep(isExpanded ? null : i)}
                                            className={`w-full text-left p-2.5 rounded-lg transition-all ${isExpanded ? 'bg-white/5' : 'hover:bg-white/[0.03]'}`}
                                        >
                                            <p className={`text-[11px] font-bold uppercase transition-colors ${isExpanded ? 'text-[#00D7D2]' : 'text-white/80'}`}>{stepTitle}</p>
                                        </button>
                                        <AnimatePresence>
                                            {isExpanded && stepDesc && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="px-2.5 pb-2.5">
                                                        <p className="text-[10px] text-white/50 leading-relaxed">{stepDesc}</p>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigator.clipboard.writeText(`${stepTitle}: ${stepDesc}`);
                                                                setCopiedStep(i);
                                                                setTimeout(() => setCopiedStep(null), 1500);
                                                            }}
                                                            className="mt-2 flex items-center space-x-1 text-[9px] text-white/30 hover:text-[#00D7D2] transition-colors"
                                                        >
                                                            {copiedStep === i ? <><Check className="w-3 h-3" /><span>Copied!</span></> : <><Copy className="w-3 h-3" /><span>Copy Step</span></>}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </motion.div>
        );
    };

    const renderResponseContent = (response, type) => {
        if (!response) {
            if (type === 'expert') {
                return (
                    <div className="flex flex-col h-full p-2 space-y-6">
                        {/* Welcome Header */}
                        <div className="text-center pt-4">
                            <h2 className="text-xl font-bold text-[#E4E3EC] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>Welcome to <span className="text-[#00D7D2]">ByteMe Expert</span></h2>
                            <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
                                An AI-powered SME routing engine that sends your queries to domain-specific experts with custom guardrails — then audits the response for hallucinations.
                            </p>
                        </div>

                        {/* Feature Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-2">
                            <div className="p-4 rounded-xl bg-[#00D7D2]/5 border border-[#00D7D2]/15">
                                <Shield className="w-5 h-5 text-[#00D7D2] mb-2" />
                                <h4 className="text-xs font-bold text-[#E4E3EC] mb-1">Expert Guardrails</h4>
                                <p className="text-[10px] text-white/40 leading-relaxed">Each SME agent has domain-specific rules injected as system prompts to keep responses focused and accurate.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[#8E72EE]/5 border border-[#8E72EE]/15">
                                <Sparkles className="w-5 h-5 text-[#8E72EE] mb-2" />
                                <h4 className="text-xs font-bold text-[#E4E3EC] mb-1">Hallucination Audit</h4>
                                <p className="text-[10px] text-white/40 leading-relaxed">Responses are cross-checked against a base model and scored for factual drift with a visual gauge.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[#00D7D2]/5 border border-[#00D7D2]/15">
                                <Code className="w-5 h-5 text-[#00D7D2] mb-2" />
                                <h4 className="text-xs font-bold text-[#E4E3EC] mb-1">Multiple Domains</h4>
                                <p className="text-[10px] text-white/40 leading-relaxed">Software Engineering, Business Strategy, Agriculture, Construction, and more — or create your own custom agent.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[#8E72EE]/5 border border-[#8E72EE]/15">
                                <Bot className="w-5 h-5 text-[#8E72EE] mb-2" />
                                <h4 className="text-xs font-bold text-[#E4E3EC] mb-1">Custom Agents</h4>
                                <p className="text-[10px] text-white/40 leading-relaxed">Upload your own knowledge files and rulebooks to create specialized agents for any domain.</p>
                            </div>
                        </div>

                        {/* Getting Started */}
                        <div className="px-4 pb-2">
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">Getting Started</h4>
                                <ol className="space-y-2 text-xs text-white/40">
                                    <li className="flex items-start space-x-2"><span className="text-[#00D7D2] font-bold shrink-0">1.</span><span>Select an expert agent from the bottom bar or sidebar</span></li>
                                    <li className="flex items-start space-x-2"><span className="text-[#00D7D2] font-bold shrink-0">2.</span><span>Type your question in the query box below</span></li>
                                    <li className="flex items-start space-x-2"><span className="text-[#00D7D2] font-bold shrink-0">3.</span><span>View the expert response here, and hover the right panel for the base model comparison & hallucination audit</span></li>
                                </ol>
                            </div>
                        </div>

                        {/* Pre-loaded rules */}
                        {renderRulesSection()}
                    </div>
                );
            }
            return (
                <div className="flex flex-col items-center justify-center h-full text-white/20">
                    <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
                    <p className="text-sm">Awaiting query...</p>
                </div>
            );
        }

        if (response.status === 'loading') return (
            <div className="flex flex-col space-y-4 p-2">
                <div className="skeleton-block h-4 w-3/4"></div>
                <div className="skeleton-block h-4 w-full"></div>
                <div className="skeleton-block h-4 w-5/6"></div>
                <div className="skeleton-block h-3 w-2/3 mt-2"></div>
                <div className="skeleton-block h-20 w-full mt-4"></div>
                <div className="skeleton-block h-3 w-1/2"></div>
                <div className="skeleton-block h-4 w-full"></div>
                <p className="text-[#00D7D2]/40 animate-pulse text-[9px] tracking-widest uppercase mt-4 text-center">
                    {type === 'expert' ? 'ROUTING TO SME...' : 'GENERATING BASE RESPONSE...'}
                </p>
            </div>
        );

        if (response.status === 'error') return (
            <div className="space-y-3">
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                    {response.error}
                </div>
                {response.isRateLimit && rateLimitCountdown > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl bg-[#8E72EE]/5 border border-[#8E72EE]/20 flex items-center space-x-4"
                    >
                        <div className="relative w-12 h-12 flex-shrink-0">
                            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(0,255,65,0.15)" strokeWidth="2.5" />
                                <circle
                                    cx="18" cy="18" r="15.5" fill="none"
                                    stroke="#8E72EE"
                                    strokeWidth="2.5"
                                    strokeDasharray={`${(rateLimitCountdown / 60) * 97.4} 97.4`}
                                    strokeLinecap="round"
                                    className="transition-all duration-1000 ease-linear"
                                    style={{ filter: 'drop-shadow(0 0 4px rgba(0,255,65,0.5))' }}
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[#8E72EE] text-sm font-bold tabular-nums">
                                {rateLimitCountdown}
                            </span>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-[#8E72EE] uppercase tracking-widest">Rate Limit Cooldown</p>
                            <p className="text-[10px] text-white/40 mt-0.5">API quota exceeded. You can retry in <span className="text-[#8E72EE] font-semibold">{rateLimitCountdown}s</span></p>
                        </div>
                    </motion.div>
                )}
                {response.isRateLimit && rateLimitCountdown === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center"
                    >
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Cooldown complete — you can retry your query now</p>
                    </motion.div>
                )}
            </div>
        );

        const { answer, citations, generated_by_model, out_of_scope } = response.data;

        // Out-of-scope guardrail: expert declined the question
        if (out_of_scope && type === 'expert') return (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center h-full space-y-4 text-center px-6">
                <div className="w-14 h-14 rounded-full bg-[#8E72EE]/10 border border-[#8E72EE]/30 flex items-center justify-center shadow-[0_0_20px_rgba(0,255,65,0.2)]">
                    <span className="text-2xl">🚫</span>
                </div>
                <p className="text-[#8E72EE] font-bold text-sm uppercase tracking-widest">Out of Expertise</p>
                <p className="text-white/50 text-xs leading-relaxed max-w-xs">{answer}</p>
                <p className="text-white/20 text-[9px] uppercase tracking-widest">Switch to a different expert or rephrase your question.</p>
            </motion.div>
        );

        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className={`prose prose-invert max-w-none text-white/90 text-sm leading-relaxed p-6 rounded-2xl border backdrop-blur-sm shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] ${type === 'expert' ? 'bg-[#0aada9]/10 border-[#0aada9]/20' : 'bg-black/20 border-white/5'}`}>
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
                    <div className="pt-4 border-t border-[#0aada9]/10">
                        <p className="text-[10px] font-bold text-[#00D7D2] uppercase tracking-widest mb-2">Verified Sources</p>
                        <div className="flex flex-wrap gap-2">
                            {citations.map((c, i) => {
                                const isUrl = /^https?:\/\//i.test(c);
                                const href = isUrl ? c : `https://www.google.com/search?q=${encodeURIComponent(c)}`;
                                return (
                                    <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-[9px] px-2 py-1 bg-white/5 border border-white/10 rounded text-[#00D7D2]/70 hover:text-[#00D7D2] hover:border-[#00D7D2]/30 hover:bg-[#00D7D2]/5 hover:shadow-[0_0_8px_rgba(0,255,65,0.15)] transition-all cursor-pointer">
                                        {isUrl ? new URL(c).hostname.replace('www.', '') : c} ↗
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div className="h-screen w-full flex overflow-hidden text-white relative bg-[#191927]">
            <div className="absolute inset-0 pointer-events-none z-0">
                <DitherErrorBoundary>
                    <Suspense fallback={<div className="absolute inset-0 bg-[#191927]" />}>
                        <Dither
                            waveColor={[0.55, 0.44, 0.93]}
                            disableAnimation={false}
                            enableMouseInteraction={true}
                            mouseRadius={0.3}
                            colorNum={5}
                            waveAmplitude={0.4}
                            waveFrequency={3}
                            waveSpeed={0.05}
                        />
                    </Suspense>
                </DitherErrorBoundary>
            </div>

            {/* AGENT SELECTION POP-UP */}
            <AnimatePresence>
                {showAgentModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass-panel p-8 rounded-3xl border border-[#0aada9]/30 max-w-md w-full relative max-h-[80vh] flex flex-col">
                            <button onClick={() => setShowAgentModal(false)} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-5 h-5 icon-spin-hover" /></button>
                            <h3 className="text-xl font-bold mb-6 text-[#00D7D2]">Select Expert Agent</h3>

                            {/* Tabs */}
                            <div className="flex space-x-2 mb-4 bg-white/5 p-1 rounded-xl shrink-0">
                                <button onClick={() => setActiveAgentTab('system')} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeAgentTab === 'system' ? 'bg-[#0aada9] text-white shadow-[0_0_15px_#0aada9]' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>System</button>
                                <button onClick={() => setActiveAgentTab('custom')} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeAgentTab === 'custom' ? 'bg-[#0aada9] text-white shadow-[0_0_15px_#0aada9]' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>Custom Data</button>
                            </div>

                            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-2 space-y-3">
                                {activeAgentTab === 'system' && (
                                    [{ key: 'SoftwareEngineer', icon: Code, desc: 'Enforcing SOLID principles, system design patterns & code safety' },
                                    { key: 'BusinessConsultant', icon: Briefcase, desc: 'Strategic planning, market analysis & financial modeling' },
                                    { key: 'AgricultureExpert', icon: Leaf, desc: 'Precision agriculture, soil science & yield optimization' },
                                    { key: 'CivilEngineer', icon: HardHat, desc: 'Structural analysis, ASCE compliance & material science' },
                                    { key: 'Educator', icon: GraduationCap, desc: 'Cognitive scaffolding, Bloom\'s Taxonomy & UDL principles' }].map(agent => {
                                        const Icon = agent.icon;
                                        const isActive = selectedExpert === agent.key;
                                        return (
                                            <button
                                                key={agent.key}
                                                onClick={() => { setSelectedExpert(agent.key); setShowAgentModal(false); }}
                                                className={`w-full p-4 rounded-xl border text-left transition-all flex items-start space-x-3 ${isActive ? 'bg-[#0aada9]/20 border-[#0aada9] shadow-[0_0_20px_rgba(0,143,17,0.15)]' : 'bg-white/5 border-white/10 hover:border-[#0aada9]/50 hover:bg-white/[0.07]'}`}
                                            >
                                                <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-[#00D7D2]/20 text-[#00D7D2]' : 'bg-white/5 text-white/40'}`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`font-semibold text-sm ${isActive ? 'text-[#00D7D2]' : 'text-white/80'}`}>{agent.key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                                        {isActive && <span className="text-[8px] font-bold uppercase tracking-widest bg-[#00D7D2]/20 text-[#00D7D2] px-2 py-0.5 rounded-full">Active</span>}
                                                    </div>
                                                    <p className="text-[10px] text-white/40 mt-1 leading-relaxed">{agent.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}

                                {activeAgentTab === 'custom' && (
                                    <>
                                        {customRoles.length === 0 ? (
                                            <div className="text-center py-8 text-white/40 text-sm italic">No custom agents found.</div>
                                        ) : (
                                            customRoles.map(role => {
                                                const isActive = selectedExpert === role.role_name;
                                                return (
                                                    <div key={role.role_name} className="group relative">
                                                        <button
                                                            onClick={() => { setSelectedExpert(role.role_name); setShowAgentModal(false); }}
                                                            className={`w-full min-w-0 p-4 rounded-xl border text-left transition-all overflow-hidden flex items-start space-x-3 ${isActive ? 'bg-[#0aada9]/20 border-[#0aada9] shadow-[0_0_20px_rgba(0,143,17,0.15)]' : 'bg-white/5 border-white/10 hover:border-[#0aada9]/50 hover:bg-white/[0.07]'}`}
                                                        >
                                                            <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-[#00D7D2]/20 text-[#00D7D2]' : 'bg-white/5 text-white/40'}`}>
                                                                <FolderOpen className="w-4 h-4" />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center justify-between pr-6">
                                                                    <span className={`font-semibold text-sm ${isActive ? 'text-[#00D7D2]' : 'text-white/80'}`}>{role.role_name}</span>
                                                                    {isActive && <span className="text-[8px] font-bold uppercase tracking-widest bg-[#00D7D2]/20 text-[#00D7D2] px-2 py-0.5 rounded-full">Active</span>}
                                                                </div>
                                                                <p className="text-[10px] text-white/40 mt-1 truncate pr-6">{role.core_directive}</p>
                                                                <span className="inline-flex items-center mt-2 text-[8px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">📄 Custom Rulebook</span>
                                                            </div>
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeleteCustomRole(e, role.role_name)}
                                                            className="absolute top-3 right-3 p-1.5 rounded-lg text-red-500/70 hover:bg-red-500/20 hover:text-red-300 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                            title="Delete Custom Agent"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                        <button
                                            onClick={() => { setShowAgentModal(false); setShowCreateAgentModal(true); }}
                                            className="w-full mt-4 p-4 rounded-xl border border-dashed border-[#0aada9]/50 text-[#00D7D2] hover:bg-[#0aada9]/10 transition-all flex items-center justify-center space-x-2 shadow-[0_0_20px_rgba(0,143,17,0.1)]"
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
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass-panel p-8 rounded-3xl border border-[#0aada9]/30 max-w-md w-full relative flex flex-col items-center">
                            <button onClick={() => { setShowCreateAgentModal(false); setShowAgentModal(true); setNewAgentName(''); setCustomFile(null); setCreatingAgentStatus(''); }} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-5 h-5 icon-spin-hover" /></button>

                            <Sparkles className="w-12 h-12 text-[#00D7D2] mb-4 animate-pulse" />
                            <h3 className="text-xl font-bold mb-2 text-[#00D7D2] text-center">AI Agent Generator</h3>
                            <p className="text-xs text-white/50 text-center mb-6">Type a job title and upload optional strict rules. The AI will generate a strict persona configuration.</p>

                            <input
                                type="text"
                                value={newAgentName}
                                onChange={(e) => setNewAgentName(e.target.value)}
                                placeholder="e.g. Senior Theoretical Physicist"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#0aada9] mb-4 text-center"
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
                                    className={`w-full flex items-center justify-center space-x-2 border border-dashed rounded-xl p-4 cursor-pointer transition-all ${customFile ? 'border-[#00D7D2]/50 bg-[#0aada9]/10 text-[#00D7D2]' : 'border-white/20 hover:border-[#00D7D2]/40 text-white/50 hover:bg-white/5'} ${creatingAgentStatus !== '' && creatingAgentStatus !== 'error' ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    <Paperclip className="w-4 h-4" />
                                    <span className="text-xs font-medium truncate max-w-[200px]">{customFile ? customFile.name : 'Attach Rule Data (.pdf, .txt, .docx)'}</span>
                                </label>
                            </div>

                            <button
                                onClick={autoGenerateRules}
                                disabled={!newAgentName.trim() || (creatingAgentStatus !== '' && creatingAgentStatus !== 'error')}
                                className="w-full bg-gradient-to-r from-[#0aada9] to-[#00D7D2] px-6 py-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center shadow-[0_0_20px_rgba(0,143,17,0.3)]"
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
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-[#12121f] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                                <h2 className="text-sm font-bold flex items-center">
                                    <Terminal className="w-4 h-4 mr-2 text-[#00D7D2]" />
                                    Developer & API Configuration
                                </h2>
                                <button onClick={() => setShowApiModal(false)} className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 icon-spin-hover" /></button>
                            </div>
                            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col space-y-8 text-sm text-white/80">

                                {/* Custom API Keys Config */}
                                <div className="border border-white/10 rounded-xl bg-black/20 p-5 space-y-4">
                                    <h3 className="text-xs font-bold uppercase text-[#00D7D2] tracking-widest flex items-center border-b border-white/10 pb-3">
                                        <Settings className="w-4 h-4 mr-2" /> Custom AI Provider Keys
                                    </h3>
                                    <p className="text-xs text-white/50 leading-relaxed font-medium">
                                        By default, Byte Expert runs on the server's backend quota. Input your own API keys below to bypass server rate limits. These keys are stored safely and strictly in your browser's local storage.
                                    </p>
                                    <div className="space-y-4 pt-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-2">Groq API Key (Llama 3.1)</label>
                                            <input type="password" value={localGroqKey} onChange={(e) => setLocalGroqKey(e.target.value)} placeholder="gsk_..." className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs outline-none focus:border-[#0aada9]/50 transition-all font-mono shadow-inner" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-2">OpenAI API Key (GPT-4o Mini)</label>
                                            <input type="password" value={localOpenAIKey} onChange={(e) => setLocalOpenAIKey(e.target.value)} placeholder="sk-proj-..." className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xs outline-none focus:border-[#0aada9]/50 transition-all font-mono shadow-inner" />
                                        </div>
                                        <div className="pt-2 border-t border-white/5">
                                            <button onClick={handleSaveKeys} className={`px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${saveKeysStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[#0aada9]/20 text-[#00D7D2] border border-[#0aada9]/30 hover:bg-[#0aada9]/40'}`}>
                                                {saveKeysStatus === 'success' ? 'Saved Successfully ✓' : 'Save Keys to Local Storage'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* API-as-a-Service docs */}
                                <div>
                                    <h3 className="text-xs font-bold uppercase text-[#00D7D2] tracking-widest flex items-center border-b border-white/10 pb-3 mb-4">
                                        <Bot className="w-4 h-4 mr-2" /> API-as-a-Service (Headless)
                                    </h3>
                                    <p className="mb-2 text-xs leading-relaxed">Use your custom agents in Cursor, LangChain, Flowise, or any external tool that supports OpenAI's API format.</p>
                                    <p className="mb-4">Simply set the Base URL to your ByteMe server and use the API Key below. For the <strong>model</strong> parameter, pass the precise name of the Custom Agent you created.</p>

                                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
                                        <div>
                                            <span className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">Base URL</span>
                                            <code className="text-[#8E72EE] bg-[#8E72EE]/10 px-2 py-1 rounded text-xs">{apiBaseUrl}/api/v1</code>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">API Key (Demo)</span>
                                            <div className="flex items-center space-x-2">
                                                <code className="text-[#00D7D2] bg-[#0aada9]/10 px-2 py-1 rounded text-xs flex-1">{bytemeApiKey}</code>
                                                <button onClick={() => navigator.clipboard.writeText(bytemeApiKey)} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">Copy</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest mb-2">cURL Example</h3>
                                    <pre className="bg-black/60 border border-white/10 rounded-xl p-4 overflow-x-auto text-[11px] text-white/70 leading-relaxed custom-scrollbar">
                                        {`curl ${apiBaseUrl}/api/v1/chat/completions \\
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
                                    className={`w-full flex items-center justify-center space-x-2 border border-dashed rounded-xl p-4 cursor-pointer transition-all ${chatUploadFile ? 'border-[#00D7D2]/50 bg-[#0aada9]/10 text-[#00D7D2]' : 'border-white/20 hover:border-[#00D7D2]/40 text-white/50 hover:bg-white/5'} ${chatUploadingStatus !== '' && chatUploadingStatus !== 'error' ? 'opacity-50 pointer-events-none' : ''}`}
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
                    <motion.aside
                        initial={{ width: 64 }}
                        animate={{ width: sidebarCollapsed ? 64 : 280 }}
                        exit={{ width: 0 }}
                        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                        onMouseEnter={() => setSidebarCollapsed(false)}
                        onMouseLeave={() => setSidebarCollapsed(true)}
                        className="fixed md:relative h-full glass-panel border-r border-white/5 z-50 md:z-10 flex flex-col overflow-hidden shadow-2xl md:shadow-none"
                    >
                        {/* Mobile Close Button */}
                        <div className="md:hidden absolute top-4 right-4 z-50">
                            <button onClick={() => setSidebarOpen(false)} className="p-2 bg-white/10 rounded-full text-white/60 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Header / Logo */}
                        <div className={`p-4 flex items-center border-b border-white/5 pt-8 md:pt-4 ${sidebarCollapsed ? 'justify-center px-3' : 'px-5'}`}>
                            {sidebarCollapsed ? (
                                <span style={{ fontFamily: '"Press Start 2P", monospace' }} className="text-[#00D7D2] text-sm drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]">B</span>
                            ) : (
                                <h2 style={{ fontFamily: '"Press Start 2P", monospace', WebkitTextStroke: '1px #00D7D2' }} className="text-transparent uppercase text-lg drop-shadow-[0_0_8px_rgba(0,255,65,0.8)] mt-1 tracking-widest whitespace-nowrap">BYTE EXPERT</h2>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className={`p-3 space-y-2 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
                            <button onClick={handleNewChat} className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-2'} p-3 bg-gradient-to-r from-[#0aada9] to-[#00D7D2] rounded-xl shadow-lg border border-white/10 hover:brightness-110 transition-all`} title="New Analysis">
                                <Plus className="w-4 h-4 shrink-0" />
                                {!sidebarCollapsed && <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">New Analysis</span>}
                            </button>
                            <button onClick={handleRunDemo} className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-2'} p-3 bg-[#8E72EE]/20 text-[#8E72EE] rounded-xl border border-[#8E72EE]/30 hover:bg-[#8E72EE]/30 transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)]`} title="Run Live Demo">
                                <Sparkles className="w-4 h-4 shrink-0" />
                                {!sidebarCollapsed && <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">Run Live Demo</span>}
                            </button>
                        </div>

                        {/* History */}
                        <div className={`flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-4 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
                            {sidebarCollapsed ? (
                                <div className="flex justify-center pt-2">
                                    <Clock className="w-4 h-4 text-white/30" />
                                </div>
                            ) : (
                                <>
                                    <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 px-2 flex items-center whitespace-nowrap"><Clock className="w-3 h-3 mr-1 shrink-0" /> History</h3>
                                    {chatHistory.length === 0 ? (
                                        <p className="text-[10px] text-white/20 px-2 italic whitespace-nowrap">No previous chats.</p>
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
                                </>
                            )}
                        </div>

                        {/* Developer Info Profile Footer */}
                        <div className={`mt-auto border-t border-[#0aada9]/20 bg-[#191927]/50 backdrop-blur-md ${sidebarCollapsed ? 'p-2 flex flex-col items-center space-y-2' : 'p-4'}`}>
                            {sidebarCollapsed ? (
                                <>
                                    <a href="https://www.linkedin.com/in/pranit-tiwari/" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-white/40 hover:text-[#00D7D2] hover:bg-[#00D7D2]/10 transition-all" title="LinkedIn"><Linkedin className="w-4 h-4" /></a>
                                    <a href="https://github.com/Pranit-T" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-white/40 hover:text-[#00D7D2] hover:bg-[#00D7D2]/10 transition-all" title="GitHub"><Github className="w-4 h-4" /></a>
                                    <a href="mailto:iam.pranit.tiwari@gmail.com" className="p-2 rounded-lg text-white/40 hover:text-[#00D7D2] hover:bg-[#00D7D2]/10 transition-all" title="Email"><Mail className="w-4 h-4" /></a>
                                </>
                            ) : (
                                <>
                                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 flex items-center whitespace-nowrap">
                                        <UserCircle className="w-3 h-3 mr-1 shrink-0" /> About Developer
                                    </p>
                                    <div className="flex flex-col space-y-2">
                                        <a href="https://www.linkedin.com/in/pranit-tiwari/" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-[11px] font-medium text-white/60 hover:text-[#00D7D2] hover:bg-[#00D7D2]/10 px-3 py-2 rounded-lg transition-all group whitespace-nowrap">
                                            <Linkedin className="w-4 h-4 shrink-0 text-white/40 group-hover:text-[#00D7D2] transition-colors" />
                                            <span>Pranit Tiwari</span>
                                        </a>
                                        <a href="https://github.com/Pranit-T" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-[11px] font-medium text-white/60 hover:text-[#00D7D2] hover:bg-[#00D7D2]/10 px-3 py-2 rounded-lg transition-all group whitespace-nowrap">
                                            <Github className="w-4 h-4 shrink-0 text-white/40 group-hover:text-[#00D7D2] transition-colors" />
                                            <span>GitHub Profile</span>
                                        </a>
                                        <a href="mailto:iam.pranit.tiwari@gmail.com" className="flex items-center space-x-2 text-[11px] font-medium text-white/60 hover:text-[#00D7D2] hover:bg-[#00D7D2]/10 px-3 py-2 rounded-lg transition-all group whitespace-nowrap">
                                            <Mail className="w-4 h-4 shrink-0 text-white/40 group-hover:text-[#00D7D2] transition-colors" />
                                            <span>Email Me</span>
                                        </a>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Main */}
            <main className="flex-1 flex flex-col h-full relative z-10 pt-4 w-full md:w-auto overflow-x-hidden">
                <header className="min-h-[72px] flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-8 py-2 gap-4 md:gap-0">
                    <div className="flex items-center space-x-3 md:space-x-6 w-full md:w-auto">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10"><Bot className="w-5 h-5 text-white/60" /></button>
                        <h1 className="font-bold text-xl md:text-2xl mr-2 md:mr-4 shrink-0">Dashboard</h1>
                        <button onClick={() => setShowApiModal(true)} className="flex items-center space-x-2 bg-[#0aada9]/10 text-[#00D7D2] border border-[#0aada9]/20 px-3 py-1.5 rounded-full hover:bg-[#0aada9]/20 transition-colors ml-auto md:ml-0">
                            <Terminal className="w-3 h-3 icon-anim" />
                            <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Developer API</span>
                        </button>
                        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full hidden sm:flex">
                            <div className={`w-2 h-2 rounded-full ${backendReady ? 'bg-teal-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`}></div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{backendReady ? 'Online' : 'Offline'}</span>
                        </div>
                    </div>

                    {/* CURRENT PROMPT PANEL */}
                    <div className="flex-1 w-full md:max-w-2xl md:ml-6 ml-0 mt-2 md:mt-0 group px-4 md:px-0">
                        <div className="glass-panel rounded-xl border border-white/5 px-4 py-3 flex items-start space-x-3 transition-all duration-300 ease-in-out group-hover:max-w-none group-hover:border-[#0aada9]/20 group-hover:shadow-[0_0_20px_rgba(0,143,17,0.1)] cursor-default">
                            <div className="flex-shrink-0 mt-0.5">
                                <MessageSquare className={`w-4 h-4 transition-all duration-300 ${expertResponse?.question ? 'text-[#00D7D2] group-hover:scale-110' : 'text-white/20'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1 transition-colors duration-300 group-hover:text-[#00D7D2]/60">Current Prompt</p>
                                {expertResponse?.question ? (
                                    <p className="text-xs text-white/80 leading-relaxed line-clamp-2 md:group-hover:line-clamp-none transition-all duration-300 break-words w-full">{expertResponse.question}</p>
                                ) : (
                                    <p className="text-xs text-white/20 italic">No active query</p>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 gap-6 flex flex-col max-w-[1600px] mx-auto w-full">
                    {/* EXPERT PANEL — Full Width */}
                    <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-white/5 overflow-hidden panel-dynamic panel-dynamic-expert">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest panel-header-label">SME Expert Routing</h3>
                                {rulesLoading && <span className="text-[8px] text-[#00D7D2]/60 animate-pulse uppercase tracking-widest">● caching rules</span>}
                            </div>
                            <div className={`px-2 py-1 rounded text-[9px] font-bold border ${expertResponse?.data?.accuracy > 70 ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' : 'bg-[#0aada9]/10 text-[#00D7D2] border-[#0aada9]/20'}`}>
                                {expertResponse?.data?.accuracy ? `+${expertResponse.data.accuracy}% ACCURACY` : 'CALCULATING...'}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar prose-readable">{renderResponseContent(expertResponse, 'expert')}</div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 md:p-8 max-w-[1600px] mx-auto w-full pt-0">
                    <form onSubmit={handleSubmit} className="flex flex-col md:flex-row items-stretch md:items-center bg-[#12121f]/90 border border-white/10 rounded-2xl p-2 md:p-2 shadow-2xl backdrop-blur-3xl gap-2 md:gap-0">
                        <button type="button" onClick={() => setShowAgentModal(true)} className="px-4 py-3 text-xs font-bold text-[#00D7D2] hover:text-white transition-colors bg-white/5 rounded-xl border border-white/5 md:ml-1 md:mr-2 whitespace-nowrap w-full md:w-auto mt-1 md:mt-0">
                            {selectedExpert.replace(/([A-Z])/g, ' $1').trim()}
                        </button>
                        <div className="flex bg-black/40 md:bg-transparent rounded-xl md:rounded-none border border-white/5 md:border-none p-1 md:p-0 flex-1 w-full relative">
                            <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Query the experts..." className="flex-1 bg-transparent px-4 py-3 md:py-0 text-sm outline-none placeholder:text-white/10 w-full" />
                            <button type="button" onClick={() => setShowChatUploadModal(true)} className="p-3 absolute right-1 top-1 md:static md:right-auto md:top-auto text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10">
                                <Paperclip className="w-5 h-5 icon-anim" />
                            </button>
                        </div>
                        <button type="submit" disabled={isSubmitting || !question.trim()} className="bg-gradient-to-r from-[#0aada9] to-[#00D7D2] px-6 py-4 md:py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-20 whitespace-nowrap w-full md:w-auto mt-2 md:mt-0">
                            {isSubmitting ? 'Analyzing...' : 'Send Query'}
                        </button>
                    </form>
                </div>
            </main>

            {/* Right Sidebar — Base Model & Analysis */}
            <motion.aside
                initial={{ width: 64 }}
                animate={{ width: rightSidebarCollapsed ? 64 : 340 }}
                transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                onMouseEnter={() => setRightSidebarCollapsed(false)}
                onMouseLeave={() => setRightSidebarCollapsed(true)}
                className="hidden md:flex h-full glass-panel border-l border-white/5 flex-col overflow-hidden z-20 relative"
            >
                {/* Header */}
                <div className={`p-4 flex items-center border-b border-white/5 ${rightSidebarCollapsed ? 'justify-center px-3' : 'px-5'}`}>
                    {rightSidebarCollapsed ? (
                        <Bot className="w-4 h-4 text-white/40" />
                    ) : (
                        <h2 className="text-[10px] font-bold uppercase text-white/40 tracking-widest whitespace-nowrap">Comparison & Analysis</h2>
                    )}
                </div>

                {/* Base Model Section */}
                <div className={`border-b border-white/5 ${rightSidebarCollapsed ? '' : 'flex-1 min-h-0 flex flex-col'}`}>
                    {rightSidebarCollapsed ? (
                        <div className="p-3 flex flex-col items-center space-y-1">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center" title="Base Model">
                                <MessageSquare className="w-4 h-4 text-white/30" />
                            </div>
                            <span className="text-[7px] text-white/20 uppercase tracking-wider">Base</span>
                        </div>
                    ) : (
                        <>
                            <div className="p-3 flex justify-between items-center border-b border-white/5">
                                <h3 className="text-[10px] font-bold uppercase text-white/40 tracking-widest panel-header-label whitespace-nowrap">Base Model</h3>
                                <div className="flex bg-black/40 border border-white/10 rounded-lg p-0.5">
                                    <button onClick={() => setModelProvider('groq')} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md ${modelProvider === 'groq' ? 'bg-[#8E72EE] text-[#191927] shadow-[0_0_10px_rgba(0,255,65,0.5)]' : 'text-white/40 hover:text-white'}`}>Groq</button>
                                    <button onClick={() => setModelProvider('openai')} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md ${modelProvider === 'openai' ? 'bg-[#0aada9] text-white shadow-[0_0_10px_rgba(0,143,17,0.5)]' : 'text-white/40 hover:text-white'}`}>OpenAI</button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar prose-readable">{renderResponseContent(geminiResponse, 'gemini')}</div>
                        </>
                    )}
                </div>

                {/* Analysis Section */}
                <div className={`${rightSidebarCollapsed ? '' : 'flex-1 min-h-0 flex flex-col'}`}>
                    {rightSidebarCollapsed ? (
                        <div className="p-3 flex flex-col items-center space-y-1">
                            <div className="w-8 h-8 rounded-lg bg-[#8E72EE]/10 flex items-center justify-center" title="Hallucination Analysis">
                                <Sparkles className="w-4 h-4 text-[#8E72EE]/40" />
                            </div>
                            <span className="text-[7px] text-[#8E72EE]/30 uppercase tracking-wider">Audit</span>
                        </div>
                    ) : expertResponse?.status === 'success' ? (
                        <>
                            <div className="p-3 border-b border-[#8E72EE]/10 flex items-center justify-between bg-black/20">
                                <h3 className="text-[10px] font-bold uppercase text-[#8E72EE] tracking-widest flex items-center panel-header-label whitespace-nowrap">
                                    <Sparkles className="w-3 h-3 mr-2 shrink-0" />
                                    Hallucination & Depth
                                </h3>
                                {analysisResponse?.data?.hallucination_score !== undefined && (() => {
                                    const score = analysisResponse.data.hallucination_score;
                                    const gaugeColor = score <= 30 ? '#22c55e' : score <= 60 ? '#f59e0b' : '#ef4444';
                                    const riskLabel = score <= 30 ? 'Low' : score <= 60 ? 'Medium' : 'High';
                                    const circumference = 2 * Math.PI * 18;
                                    const dashOffset = circumference - (score / 100) * circumference;
                                    return (
                                        <div className="flex items-center space-x-2">
                                            <div className="relative w-10 h-10">
                                                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 44 44">
                                                    <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                                                    <motion.circle
                                                        cx="22" cy="22" r="18" fill="none"
                                                        stroke={gaugeColor}
                                                        strokeWidth="3"
                                                        strokeLinecap="round"
                                                        strokeDasharray={circumference}
                                                        initial={{ strokeDashoffset: circumference }}
                                                        animate={{ strokeDashoffset: dashOffset }}
                                                        transition={{ duration: 1.2, ease: 'easeOut' }}
                                                        style={{ filter: `drop-shadow(0 0 4px ${gaugeColor}80)` }}
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className="text-[9px] font-bold tabular-nums" style={{ color: gaugeColor }}>{score}%</span>
                                                </div>
                                            </div>
                                            <div className="hidden sm:block">
                                                <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: gaugeColor }}>{riskLabel} Drift</p>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar text-sm text-white/80 leading-relaxed">
                                {!analysisResponse ? (
                                    <div className="flex items-center justify-center h-full text-white/20 italic text-xs">Awaiting models...</div>
                                ) : analysisResponse.status === 'loading' ? (
                                    <div className="flex flex-col items-center justify-center h-full space-y-3">
                                        <div className="glass-loader" style={{ width: 24, height: 24, borderColor: 'rgba(0, 215, 210, 0.2)', borderBottomColor: '#8E72EE' }}></div>
                                        <p className="text-[10px] text-[#8E72EE]/50 animate-pulse uppercase tracking-widest whitespace-nowrap">Analyzing differences...</p>
                                    </div>
                                ) : (
                                    <div className="bg-[#8E72EE]/5 rounded-xl p-4 border border-[#8E72EE]/10 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
                                        <ReactMarkdown className="prose prose-invert prose-sm max-w-none prose-p:leading-snug">{analysisResponse.data.analysis}</ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="p-4 text-[10px] text-white/20 italic whitespace-nowrap">Awaiting expert response...</div>
                    )}
                </div>
            </motion.aside>
        </div >
    );
}

export default App;
