import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import MarkdownRenderer from './MarkdownRenderer';
import { API_BASE_URL } from '../config/api';
import './css/AIChatReports.css';

export default function AIChatReports() {
    const { user, isAdmin, isStaff } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [promptInput, setPromptInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [expandedSteps, setExpandedSteps] = useState({});

    const chatEndRef = useRef(null);
    const textareaRef = useRef(null);

    // Initial load: fetch role-specific suggestion chips
    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const token = localStorage.getItem('garage_auth_token');
                const res = await fetch(`${API_BASE_URL}/ai/suggestions`, {
                    headers: {
                        Authorization: token ? `Bearer ${token}` : '',
                    },
                });
                if (res.ok) {
                    const data = await res.json();
                    setSuggestions(data.suggestions || []);
                }
            } catch (err) {
                console.warn('Could not load AI suggestions:', err);
            }
        };

        fetchSuggestions();
    }, []);

    // Auto-scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading, statusMessage]);

    // Send AI Prompt
    const handleSendMessage = async (textToSend) => {
        const queryText = (textToSend || promptInput).trim();
        if (!queryText || isLoading) return;

        const userMsg = {
            id: 'msg_user_' + Date.now(),
            role: 'user',
            content: queryText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setPromptInput('');
        setIsLoading(true);
        setStatusMessage('Precision AI is analyzing your inquiry...');

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        try {
            const token = localStorage.getItem('garage_auth_token');

            // Format previous history for context
            const chatHistory = messages.map((m) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
            }));

            const response = await fetch(`${API_BASE_URL}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : '',
                },
                body: JSON.stringify({
                    prompt: queryText,
                    chatHistory: chatHistory,
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}: Failed to process AI inquiry.`);
            }

            const data = await response.json();

            const aiMsg = {
                id: 'msg_ai_' + Date.now(),
                role: 'assistant',
                content: data.answer || 'Completed inquiry.',
                isSevere: Boolean(data.isSevere),
                steps: data.steps || [],
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            setMessages([...newMessages, aiMsg]);
        } catch (err) {
            const errorMsg = {
                id: 'msg_err_' + Date.now(),
                role: 'assistant',
                content: `⚠️ **Error**: ${err.message || 'An unexpected error occurred while communicating with the AI assistant.'}`,
                isSevere: true,
                steps: [],
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages([...newMessages, errorMsg]);
        } finally {
            setIsLoading(false);
            setStatusMessage('');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleTextareaInput = (e) => {
        setPromptInput(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
    };

    const handleCopyContent = (text, idx) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2500);
    };

    const toggleSteps = (msgId) => {
        setExpandedSteps((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
    };

    const handleClearChat = () => {
        if (window.confirm('Are you sure you want to clear this conversation history?')) {
            setMessages([]);
        }
    };

    // If staff somehow arrives on this page
    if (isStaff) {
        return (
            <div className="ai-chat-layout">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <div className="ai-chat-wrapper">
                    <div className="staff-blocked-card">
                        <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#f87171' }}>
                            lock_person
                        </span>
                        <h2>Access Restricted</h2>
                        <p>Staff accounts do not have access permissions for the Precision AI Assistant.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ai-chat-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="ai-chat-wrapper">
                {/* Header Bar */}
                <header className="ai-chat-header">
                    <div className="ai-header-left">
                        <button
                            className="mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open Menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>

                        <div className="ai-brand-badge">
                            <span className="material-symbols-outlined ai-brand-icon">auto_awesome</span>
                            <div className="ai-brand-text">
                                <h1>{isAdmin ? 'Precision AI Data & Analytics Hub' : 'Precision AI Car Advisor'}</h1>
                                <span className="ai-brand-sub">
                                    {isAdmin
                                        ? 'Operational Insights, Cross-Table Analytics & Natural Language Database Reports'
                                        : `Personal Vehicle Insights & Service History for Customer Account (${user?.owner_id || 'Owner'})`}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="ai-header-actions">
                        <div className="ai-status-indicator online">
                            <span className="status-dot"></span>
                            <span className="status-label font-mono">AI ONLINE</span>
                        </div>

                        {messages.length > 0 && (
                            <button
                                type="button"
                                className="ai-clear-btn"
                                onClick={handleClearChat}
                                title="Clear conversation history"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete_sweep</span>
                                <span>Clear Chat</span>
                            </button>
                        )}
                    </div>
                </header>

                {/* Main Chat Content Area */}
                <main className="ai-chat-main">
                    <div className="ai-chat-container">
                        {/* Initial Welcome Hero Card when chat is empty */}
                        {messages.length === 0 && (
                            <div className="ai-welcome-card">
                                <div className="welcome-glow-icon">
                                    <span className="material-symbols-outlined">psychology</span>
                                </div>
                                <h2>
                                    {isAdmin
                                        ? 'Welcome to Precision Garage Super Intelligence'
                                        : `Hello, ${user?.name || user?.full_name || 'Valued Customer'}!`}
                                </h2>
                                <p className="welcome-desc">
                                    {isAdmin
                                        ? 'Ask complex questions, generate financial summaries, review technician productivity, or inspect low-stock inventory directly from our live PostgreSQL database in plain English.'
                                        : 'I am your dedicated vehicle maintenance assistant. Ask me anything about your registered cars, past repair jobs, itemized part replacements, inspection photos, and invoice billing breakdown.'}
                                </p>

                                <div className="welcome-security-pill">
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#10b981' }}>
                                        verified_user
                                    </span>
                                    <span>
                                        {isAdmin
                                            ? '🛡️ Full Administrative Scope: Access live reports across work orders, inventory, billing, and scheduling.'
                                            : `🔒 Strict Data Isolation: Queries are securely sandboxed to your customer account (${user?.owner_id || 'Verified Owner'}).`}
                                    </span>
                                </div>

                                {/* Preset Suggestions Grid */}
                                {suggestions.length > 0 && (
                                    <div className="welcome-suggestions-section">
                                        <span className="suggestions-title">💡 Quick Start Prompt Recommendations:</span>
                                        <div className="suggestions-grid">
                                            {suggestions.map((item, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    className="suggestion-chip-btn"
                                                    onClick={() => handleSendMessage(item.prompt)}
                                                >
                                                    <span className="suggestion-label">{item.label}</span>
                                                    <span className="suggestion-prompt-preview">{item.prompt}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Message Stream */}
                        <div className="ai-messages-list">
                            {messages.map((msg, idx) => (
                                <div key={msg.id || idx} className={`ai-message-row ${msg.role}`}>
                                    <div className="message-avatar">
                                        {msg.role === 'user' ? (
                                            <span className="material-symbols-outlined">person</span>
                                        ) : (
                                            <span className="material-symbols-outlined">auto_awesome</span>
                                        )}
                                    </div>

                                    <div className="message-content-wrapper">
                                        <div className="message-meta-header">
                                            <span className="sender-name">
                                                {msg.role === 'user'
                                                    ? isAdmin ? 'Garage Administrator' : 'Customer Account'
                                                    : 'Precision AI Assistant'}
                                            </span>
                                            <span className="message-time font-mono">{msg.timestamp}</span>

                                            {msg.isSevere && (
                                                <span className="severe-badge font-mono">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>shield</span>
                                                    <span>SECURITY NOTICE</span>
                                                </span>
                                            )}
                                        </div>

                                        {/* Severe Policy Warning Alert Box if triggered */}
                                        {msg.isSevere && (
                                            <div className="severe-alert-banner">
                                                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#f87171' }}>
                                                    gpp_bad
                                                </span>
                                                <div className="severe-alert-txt">
                                                    <strong>Access / Scope Policy Triggered:</strong>
                                                    <span> This request was assessed and restricted to safeguard system privacy and unauthorized data boundaries.</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Formatted Markdown Body */}
                                        <div className="message-body">
                                            <MarkdownRenderer content={msg.content} />
                                        </div>

                                        {/* Collapsible Tool / SQL Execution Steps Drawer */}
                                        {msg.steps && msg.steps.length > 0 && (
                                            <div className="msg-steps-drawer">
                                                <button
                                                    type="button"
                                                    className="toggle-steps-btn"
                                                    onClick={() => toggleSteps(msg.id)}
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                                                        {expandedSteps[msg.id] ? 'expand_less' : 'expand_more'}
                                                    </span>
                                                    <span>
                                                        {expandedSteps[msg.id] ? 'Hide' : 'Inspect'} Database Operations ({msg.steps.length} {msg.steps.length === 1 ? 'step' : 'steps'})
                                                    </span>
                                                </button>

                                                {expandedSteps[msg.id] && (
                                                    <div className="steps-container-inner">
                                                        {msg.steps.map((step, sIdx) => (
                                                            <div key={step.id || sIdx} className={`step-item-card ${step.status}`}>
                                                                <div className="step-header">
                                                                    <span className="step-type-pill font-mono">
                                                                        {step.type === 'sql_query' ? 'SQL SELECT' : step.type}
                                                                    </span>
                                                                    <span className={`step-status-pill ${step.status}`}>
                                                                        {step.status}
                                                                    </span>
                                                                    {step.rowCount !== undefined && (
                                                                        <span className="step-rows-pill font-mono">
                                                                            {step.rowCount} {step.rowCount === 1 ? 'row' : 'rows'}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {step.query && (
                                                                    <pre className="step-sql-pre">
                                                                        <code>{step.query}</code>
                                                                    </pre>
                                                                )}

                                                                {step.error && (
                                                                    <div className="step-error-msg font-mono">
                                                                        ⚠️ {step.error}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Message Actions */}
                                        {msg.role === 'assistant' && (
                                            <div className="message-action-row">
                                                <button
                                                    type="button"
                                                    className="msg-copy-btn"
                                                    onClick={() => handleCopyContent(msg.content, idx)}
                                                    title="Copy response markdown to clipboard"
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                                                        {copiedIndex === idx ? 'check' : 'content_copy'}
                                                    </span>
                                                    <span>{copiedIndex === idx ? 'Copied!' : 'Copy Report'}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Loading Indicator with Live Status */}
                            {isLoading && (
                                <div className="ai-message-row assistant is-loading-row">
                                    <div className="message-avatar">
                                        <span className="material-symbols-outlined spinning-icon">sync</span>
                                    </div>
                                    <div className="message-content-wrapper">
                                        <div className="message-meta-header">
                                            <span className="sender-name">Precision AI Assistant</span>
                                            <span className="status-live-tag font-mono">ANALYZING</span>
                                        </div>
                                        <div className="loading-speech-bubble">
                                            <div className="typing-dots">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                            <span className="status-live-text">{statusMessage || 'Processing inquiry...'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={chatEndRef} />
                        </div>
                    </div>
                </main>

                {/* Bottom Interactive Query Input */}
                <footer className="ai-chat-input-footer">
                    <div className="input-container-inner">
                        {/* Quick Prompts Bar above input */}
                        {suggestions.length > 0 && messages.length > 0 && (
                            <div className="mini-suggestions-strip">
                                {suggestions.slice(0, 4).map((s, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        className="mini-chip"
                                        onClick={() => handleSendMessage(s.prompt)}
                                        disabled={isLoading}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="input-box-wrapper">
                            <textarea
                                ref={textareaRef}
                                className="ai-prompt-textarea"
                                placeholder={
                                    isAdmin
                                        ? "Ask anything about revenue, inventory, work orders, staff, or vehicle records..."
                                        : "Ask anything about your cars, repair history, parts replaced, or billing invoices..."
                                }
                                rows={1}
                                value={promptInput}
                                onChange={handleTextareaInput}
                                onKeyDown={handleKeyDown}
                                disabled={isLoading}
                            />

                            <button
                                type="button"
                                className="ai-send-btn"
                                onClick={() => handleSendMessage()}
                                disabled={!promptInput.trim() || isLoading}
                                title="Send message (Enter)"
                            >
                                <span className="material-symbols-outlined">send</span>
                            </button>
                        </div>

                        <div className="input-footer-hints">
                            <span>Press <kbd>Enter</kbd> to send • <kbd>Shift + Enter</kbd> for new line</span>
                            <span>🔒 Enterprise RBAC & Security Enforced</span>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
