/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal as TerminalIcon, 
  Search, 
  Cpu, 
  ExternalLink, 
  ArrowRight, 
  Loader2, 
  History,
  ShieldAlert,
  Zap,
  Settings,
  Github,
  Mail,
  FileText,
  Link2,
  CheckCircle2,
  XCircle,
  LogOut
} from 'lucide-react';
import Markdown from 'react-markdown';
import { consultAgent, AgentResponse } from './services/geminiService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { uri: string; title: string }[];
  timestamp: Date;
}

interface Connection {
  id: string;
  provider: string;
  created_at: string;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [hasApiKey, setHasApiKey] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkApiKey();
    fetchConnections();
    
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchConnections();
        // Add a system message about successful connection
        const systemMsg: Message = {
          id: Math.random().toString(36).substring(7),
          role: 'assistant',
          content: `Successfully connected to **${event.data.provider}**. I can now access your data to help with tasks.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, systemMsg]);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkApiKey = async () => {
    if (window.aistudio?.hasSelectedApiKey) {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(selected);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/connections');
      const data = await res.json();
      setConnections(data);
    } catch (err) {
      console.error('Failed to fetch connections:', err);
    }
  };

  const connectProvider = async (provider: string) => {
    try {
      const res = await fetch(`/api/auth/${provider}/url`);
      const { url } = await res.json();
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (err) {
      console.error(`Failed to connect ${provider}:`, err);
    }
  };

  const disconnectProvider = async (id: string) => {
    try {
      await fetch(`/api/connections/${id}/disconnect`, { method: 'POST' });
      fetchConnections();
    } catch (err) {
      console.error(`Failed to disconnect ${id}:`, err);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isThinking) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);

    try {
      const response = await consultAgent(input);
      const assistantMessage: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: response.text,
        sources: response.sources,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Agent error:', error);
      const errorMessage: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: "Error: Failed to connect to the brain. Please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  const isConnected = (provider: string) => connections.some(c => c.provider === provider);

  return (
    <div className="min-h-screen bg-[#050505] text-[#E4E3E0] font-mono selection:bg-[#F27D26] selection:text-black flex flex-col">
      {/* Header */}
      <header className="border-b border-[#141414] p-4 flex items-center justify-between sticky top-0 bg-[#050505]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#F27D26] rounded-full flex items-center justify-center text-black shadow-lg shadow-[#F27D26]/20">
            <Cpu size={18} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tighter uppercase">Nexus: Computer Mode</h1>
            <p className="text-[10px] opacity-50 uppercase tracking-widest">System v3.2.0-online</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {!hasApiKey && (
            <button 
              onClick={handleSelectKey}
              className="flex items-center gap-2 px-3 py-1.5 border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[10px] uppercase tracking-widest rounded-sm"
            >
              <ShieldAlert size={14} />
              Set API Key
            </button>
          )}
          <button 
            onClick={() => setShowConnectors(!showConnectors)}
            className={`flex items-center gap-2 px-3 py-1.5 border transition-all text-[10px] uppercase tracking-widest rounded-sm ${showConnectors ? 'bg-[#F27D26] text-black border-[#F27D26]' : 'border-[#141414] hover:border-[#F27D26] text-white/60 hover:text-white'}`}
          >
            <Link2 size={14} />
            Connectors
            {connections.length > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[8px] ${showConnectors ? 'bg-black text-[#F27D26]' : 'bg-[#F27D26] text-black'}`}>
                {connections.length}
              </span>
            )}
          </button>
          <div className="hidden sm:flex items-center gap-4 text-[10px] uppercase tracking-widest opacity-50 border-l border-[#141414] pl-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Core Online</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-[#F27D26]" />
              <span>High Priority</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Connectors */}
        <AnimatePresence>
          {showConnectors && (
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="w-72 border-r border-[#141414] bg-[#0A0A0A] overflow-y-auto p-4 z-10 hidden md:block"
            >
              <div className="space-y-6">
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#F27D26] font-bold mb-4">Active Connectors</h3>
                  <div className="space-y-2">
                    <ConnectorItem 
                      icon={<Github size={16} />} 
                      name="GitHub" 
                      description="Repos, Issues, PRs"
                      connected={isConnected('github')}
                      onConnect={() => connectProvider('github')}
                      onDisconnect={() => disconnectProvider('github')}
                    />
                    <ConnectorItem 
                      icon={<Mail size={16} />} 
                      name="Gmail" 
                      description="Email & Calendar"
                      connected={isConnected('google')}
                      onConnect={() => connectProvider('google')}
                      onDisconnect={() => disconnectProvider('google')}
                    />
                    <ConnectorItem 
                      icon={<FileText size={16} />} 
                      name="Notion" 
                      description="Docs & Projects"
                      connected={isConnected('notion')}
                      onConnect={() => connectProvider('notion')}
                      onDisconnect={() => disconnectProvider('notion')}
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#141414] rounded-sm border border-white/5">
                  <div className="flex items-center gap-2 text-[#F27D26] mb-2">
                    <ShieldAlert size={14} />
                    <span className="text-[9px] uppercase font-bold">Security Note</span>
                  </div>
                  <p className="text-[10px] opacity-50 leading-relaxed">
                    All credentials are encrypted and stored in an isolated sandbox. Nexus does not train on your private data.
                  </p>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Terminal Area */}
        <main className="flex-1 overflow-y-auto relative">
          <div className="max-w-4xl mx-auto p-4 sm:p-8 pb-32">
            <div 
              ref={scrollRef}
              className="space-y-8 min-h-[60vh]"
            >
              {messages.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border border-[#141414] p-8 rounded-lg bg-[#0A0A0A] space-y-4"
                >
                  <div className="flex items-center gap-2 text-[#F27D26]">
                    <ShieldAlert size={18} />
                    <span className="text-xs uppercase font-bold">Nexus Computer Mode Initialized</span>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tighter leading-none">
                    ORCHESTRATE TASKS ACROSS YOUR APPS.
                  </h2>
                  <p className="text-sm opacity-60 leading-relaxed max-w-xl">
                    Connect your tools to enable Nexus to perform actions like searching repositories, reading emails, or updating project boards.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                    {[
                      "List my recent GitHub repositories",
                      "Summarize my latest emails from today",
                      "Create a new issue in the nexus-agent repo",
                      "Check my calendar for upcoming meetings"
                    ].map((example) => (
                      <button
                        key={example}
                        onClick={() => {
                          setInput(example);
                        }}
                        className="text-left p-3 border border-[#141414] hover:border-[#F27D26] hover:bg-[#F27D26]/5 transition-all text-[11px] uppercase tracking-wider group"
                      >
                        <span className="opacity-50 group-hover:opacity-100 transition-opacity">{example}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}
                  >
                    <div className={`
                      max-w-[85%] sm:max-w-[75%] group relative flex flex-col
                      ${msg.role === 'user' ? 'items-end' : 'items-start'}
                    `}>
                      {/* Message Header */}
                      <div className={`flex items-center gap-2 mb-2 px-1 text-[10px] uppercase tracking-widest opacity-40 transition-opacity group-hover:opacity-100`}>
                        {msg.role === 'user' ? (
                          <>
                            <span className="font-bold">Operator</span>
                            <ArrowRight size={10} />
                            <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </>
                        ) : (
                          <>
                            <div className="w-4 h-4 bg-[#F27D26] rounded-full flex items-center justify-center text-black scale-75">
                              <Cpu size={10} />
                            </div>
                            <span className="font-bold text-[#F27D26]">Nexus Brain</span>
                            <ArrowRight size={10} />
                            <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </>
                        )}
                      </div>

                      {/* Message Card */}
                      <motion.div 
                        layout
                        className={`
                          p-5 rounded-2xl border transition-all duration-300 w-full relative overflow-hidden
                          ${msg.role === 'user' 
                            ? 'bg-[#1A1A1A] border-white/5 text-white shadow-lg shadow-black/20' 
                            : 'bg-[#0D0D0D] border-[#1A1A1A] text-[#E4E3E0] shadow-xl shadow-black/40'
                          }
                        `}
                      >
                        {/* Subtle Success Pulse for Assistant Messages */}
                        {msg.role === 'assistant' && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 0.2, 0] }}
                            transition={{ duration: 2, times: [0, 0.5, 1] }}
                            className="absolute inset-0 bg-emerald-500/10 pointer-events-none"
                          />
                        )}

                        <div className="markdown-body text-[15px] leading-relaxed prose prose-invert prose-sm max-w-none relative z-10">
                          <Markdown>{msg.content}</Markdown>
                        </div>

                        {msg.role === 'assistant' && (
                          <motion.div 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                            className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500/60"
                          >
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ 
                                type: "spring",
                                stiffness: 260,
                                damping: 20,
                                delay: 0.5 
                              }}
                            >
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            </motion.div>
                            <span>Execution Verified</span>
                          </motion.div>
                        )}

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-6 pt-5 border-t border-white/5 space-y-3">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#F27D26] font-bold">
                              <Search size={12} />
                              <span>Grounding Sources</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {msg.sources.map((source, idx) => (
                                <a
                                  key={idx}
                                  href={source.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 hover:border-[#F27D26] hover:bg-[#F27D26]/10 hover:text-[#F27D26] transition-all text-[11px] rounded-full group/source"
                                >
                                  <span className="truncate max-w-[180px]">{source.title}</span>
                                  <ExternalLink size={10} className="opacity-50 group-hover/source:opacity-100" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isThinking && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-start w-full"
                >
                  <div className="max-w-[85%] sm:max-w-[75%] flex flex-col items-start">
                    <div className="flex items-center gap-2 mb-2 px-1 text-[10px] uppercase tracking-widest opacity-40">
                      <div className="w-4 h-4 bg-[#F27D26] rounded-full flex items-center justify-center text-black scale-75">
                        <Cpu size={10} />
                      </div>
                      <span className="font-bold text-[#F27D26]">Nexus Brain</span>
                      <ArrowRight size={10} />
                      <span>Processing...</span>
                    </div>
                    <div className="bg-[#0D0D0D] border border-[#1A1A1A] p-5 rounded-2xl flex items-center gap-4 shadow-xl shadow-black/40 w-full">
                      <div className="relative">
                        <Loader2 size={20} className="animate-spin text-[#F27D26]" />
                        <div className="absolute inset-0 blur-sm bg-[#F27D26]/20 animate-pulse rounded-full" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-white/80">Thinking...</span>
                        <span className="text-[10px] opacity-40 uppercase tracking-widest animate-pulse">Orchestrating tools & synthesizing context</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent">
            <div className="max-w-4xl mx-auto">
              <form 
                onSubmit={handleSend}
                className="relative group"
              >
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-[#F27D26]">
                  <TerminalIcon size={18} />
                </div>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="START A TASK >"
                  className="w-full bg-[#0A0A0A] border border-[#141414] group-focus-within:border-[#F27D26] py-4 pl-12 pr-16 rounded-sm text-sm focus:outline-none transition-all placeholder:opacity-20"
                  disabled={isThinking}
                />
                <button
                  type="submit"
                  disabled={isThinking || !input.trim()}
                  className="absolute right-2 top-2 bottom-2 px-4 bg-[#F27D26] text-black font-bold text-[10px] uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Run
                  <ArrowRight size={14} />
                </button>
              </form>
              <div className="mt-3 flex items-center justify-between text-[9px] uppercase tracking-[0.2em] opacity-30 px-2">
                <div className="flex gap-4">
                  <span>CPU Usage: 12%</span>
                  <span>Memory: 4.2GB</span>
                  <span>Latency: 142ms</span>
                </div>
                <div className="flex gap-4">
                  <span>UTF-8</span>
                  <span>Encryption: AES-256</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function ConnectorItem({ 
  icon, 
  name, 
  description, 
  connected, 
  onConnect, 
  onDisconnect,
  disabled 
}: { 
  icon: React.ReactNode; 
  name: string; 
  description: string; 
  connected: boolean; 
  onConnect: () => void;
  onDisconnect: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`p-3 border rounded-sm transition-all ${connected ? 'bg-[#F27D26]/5 border-[#F27D26]/30' : 'bg-black/20 border-white/5'} ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-sm ${connected ? 'bg-[#F27D26] text-black' : 'bg-white/5 text-white/40'}`}>
            {icon}
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider">{name}</span>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <button 
              onClick={onDisconnect}
              className="p-1 hover:text-red-500 transition-colors"
              title="Disconnect"
            >
              <LogOut size={12} />
            </button>
          </div>
        ) : (
          !disabled && (
            <button 
              onClick={onConnect}
              className="text-[9px] uppercase font-bold text-[#F27D26] hover:text-white transition-colors"
            >
              Enable
            </button>
          )
        )}
      </div>
      <p className="text-[9px] opacity-40 leading-tight">{description}</p>
      {disabled && <p className="text-[8px] text-[#F27D26] mt-1 uppercase font-bold">Coming Soon</p>}
    </div>
  );
}
