"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { UploadCloud, FileText, Send, LogOut, Clock, Loader2, MessageSquare, Zap, Menu, X } from 'lucide-react';

interface HistoryItem {
    id: number;
    question: string;
    answer: string;
    created_at: string;
}

interface ChatMessage {
    role: 'user' | 'bot';
    text: string;
    loading?: boolean;
}

interface ChatHistoryItem {
    question: string;
    answer: string;
}

// Rate limit config (must match backend)
const UPLOAD_LIMIT = 5;      // per minute
const QUESTION_LIMIT = 10;   // per minute
const WINDOW_MS = 60_000;    // 1 minute

export default function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [file, setFile] = useState<File | null>(null);
    const [docId, setDocId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const [question, setQuestion] = useState('');
    const [asking, setAsking] = useState(false);

    // Accumulating chat messages
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

    // Rate limit tracking — timestamps of recent requests
    const uploadTimestamps = useRef<number[]>([]);
    const questionTimestamps = useRef<number[]>([]);
    const [uploadsUsed, setUploadsUsed] = useState(0);
    const [questionsUsed, setQuestionsUsed] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);

    // Prune timestamps older than 1 minute and return count within window
    const getUsedCount = (timestamps: number[]): number => {
        const now = Date.now();
        const recent = timestamps.filter(t => now - t < WINDOW_MS);
        timestamps.splice(0, timestamps.length, ...recent);
        return recent.length;
    };

    // Refresh displayed counters every second
    useEffect(() => {
        const interval = setInterval(() => {
            setUploadsUsed(getUsedCount(uploadTimestamps.current));
            setQuestionsUsed(getUsedCount(questionTimestamps.current));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Auto-scroll to bottom when messages update
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/');
            } else {
                setUser(session.user);
                fetchHistory(session.user.id);
            }
        };
        checkUser();
    }, [router]);

    const fetchHistory = async (userId: string) => {
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${API_URL}/api/history/${userId}`);
            if (res.ok) {
                const data = await res.json();
                setHistory(data.history || []);
            }
        } catch (e) {
            console.error("Failed to fetch history", e);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setUploading(true);
            setDocId(null);
            setChatMessages([]);

            const formData = new FormData();
            formData.append('file', selectedFile);

            try {
                const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const res = await fetch(`${API_URL}/api/upload`, {
                    method: 'POST',
                    body: formData,
                });

                if (!res.ok) {
                    if (res.status === 429) {
                        alert("Upload rate limit reached (5/min). Please wait a moment.");
                    } else {
                        throw new Error("Upload failed");
                    }
                    return;
                }

                const data = await res.json();
                setDocId(data.doc_id);

                // Track upload for rate limit display
                uploadTimestamps.current.push(Date.now());
                setUploadsUsed(getUsedCount(uploadTimestamps.current));
            } catch (err) {
                alert("Failed to process PDF. Make sure the backend is running.");
                console.error(err);
            } finally {
                setUploading(false);
            }
        }
    };

    // Build the last 10 Q&A pairs from chatMessages for context
    const buildChatHistory = useCallback((): ChatHistoryItem[] => {
        const pairs: ChatHistoryItem[] = [];
        const messages = chatMessages.filter(m => !m.loading);

        for (let i = 0; i < messages.length - 1; i++) {
            if (messages[i].role === 'user' && messages[i + 1].role === 'bot') {
                pairs.push({
                    question: messages[i].text,
                    answer: messages[i + 1].text,
                });
                i++; // skip the bot message we just consumed
            }
        }
        // Return last 10 pairs
        return pairs.slice(-10);
    }, [chatMessages]);

    const handleAskQuestion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim() || !docId || !user || asking) return;

        const q = question.trim();
        setQuestion('');
        setAsking(true);

        // Append user message and loading bot placeholder
        setChatMessages(prev => [
            ...prev,
            { role: 'user', text: q },
            { role: 'bot', text: '', loading: true },
        ]);

        const chatHistory = buildChatHistory();

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${API_URL}/api/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doc_id: docId,
                    question: q,
                    user_id: user.id,
                    chat_history: chatHistory,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (res.status === 429) {
                    // Replace loading placeholder with rate limit error
                    setChatMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { role: 'bot', text: '⚠️ Question limit reached (10/min). Please wait before asking again.' };
                        return updated;
                    });
                    return;
                }
                throw new Error(errData.detail || "Failed to get answer");
            }

            const data = await res.json();

            // Replace loading placeholder with actual answer
            setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'bot', text: data.answer };
                return updated;
            });

            // Track question for rate limit display
            questionTimestamps.current.push(Date.now());
            setQuestionsUsed(getUsedCount(questionTimestamps.current));

            // Refresh history sidebar
            fetchHistory(user.id);
        } catch (err: any) {
            setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'bot', text: `❌ Error: ${err.message}` };
                return updated;
            });
        } finally {
            setAsking(false);
        }
    };

    const uploadsLeft = Math.max(0, UPLOAD_LIMIT - uploadsUsed);
    const questionsLeft = Math.max(0, QUESTION_LIMIT - questionsUsed);

    if (!user) {
        return (
            <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <Loader2 className="spinner" style={{ width: '40px', height: '40px', color: 'var(--primary)' }} />
            </div>
        );
    }

    return (
        <div className="app-container">
            {/* Menu Toggle Button */}
            <button 
                className="menu-toggle"
                onClick={() => setIsSidebarOpen(true)}
                title="Open Sidebar"
            >
                <Menu size={24} />
            </button>

            {/* Sidebar Overlay */}
            {isSidebarOpen && (
                <div 
                    className="sidebar-overlay" 
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '8px', background: 'var(--primary)', borderRadius: '8px' }}>
                            <FileText size={24} color="white" />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Ask PDF</h2>
                    </div>
                    <button 
                        onClick={() => setIsSidebarOpen(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Rate limit display in sidebar */}
                <div className="rate-limit-sidebar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        <Zap size={12} /> Limits (per min)
                    </div>
                    <div className="rate-limit-row">
                        <span>📤 Uploads</span>
                        <span className={uploadsLeft === 0 ? 'limit-exhausted' : uploadsLeft <= 1 ? 'limit-warning' : 'limit-ok'}>
                            {uploadsLeft}/{UPLOAD_LIMIT} left
                        </span>
                    </div>
                    <div className="rate-limit-progress">
                        <div className="rate-limit-fill" style={{ width: `${(uploadsUsed / UPLOAD_LIMIT) * 100}%`, background: uploadsLeft === 0 ? 'var(--danger)' : 'var(--primary)' }} />
                    </div>
                    <div className="rate-limit-row" style={{ marginTop: '0.5rem' }}>
                        <span>💬 Questions</span>
                        <span className={questionsLeft === 0 ? 'limit-exhausted' : questionsLeft <= 2 ? 'limit-warning' : 'limit-ok'}>
                            {questionsLeft}/{QUESTION_LIMIT} left
                        </span>
                    </div>
                    <div className="rate-limit-progress">
                        <div className="rate-limit-fill" style={{ width: `${(questionsUsed / QUESTION_LIMIT) * 100}%`, background: questionsLeft === 0 ? 'var(--danger)' : questionsLeft <= 2 ? '#f59e0b' : 'var(--primary)' }} />
                    </div>
                </div>

                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={14} /> History
                </h3>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {history.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem' }}>
                            No history found
                        </p>
                    ) : (
                        history.map((item) => (
                            <div key={item.id} className="history-item">
                                <div className="question">{item.question}</div>
                                <div className="answer">{item.answer}</div>
                            </div>
                        ))
                    )}
                </div>

                <button
                    onClick={handleLogout}
                    className="btn"
                    style={{
                        marginTop: '1rem',
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-main)',
                        width: '100%'
                    }}
                >
                    <LogOut size={18} /> Sign Out
                </button>
            </div>

            {/* Main Content Area */}
            <div className="main-content">
                <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    {/* Header/Upload Section */}
                    <div className="glass-panel" style={{ padding: '1.5rem 2rem', textAlign: 'center', flexShrink: 0 }}>
                        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Document Intelligence</h1>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>Upload a PDF and ask questions directly to it.</p>

                        <input
                            type="file"
                            accept=".pdf"
                            style={{ display: 'none' }}
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                        />

                        <button
                            className="btn btn-primary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading || uploadsLeft === 0}
                        >
                            {uploading ? <Loader2 className="spinner" size={20} /> : <UploadCloud size={20} />}
                            {uploading ? 'Processing PDF...' : file ? `📄 ${file.name}` : 'Upload PDF Document'}
                        </button>

                        {docId && (
                            <div style={{ marginTop: '0.75rem' }} className="alert alert-success">
                                ✅ PDF ready — ask anything below!
                            </div>
                        )}
                        {uploadsLeft === 0 && (
                            <div style={{ marginTop: '0.75rem' }} className="alert alert-error">
                                Upload limit reached. Resets in &lt;1 minute.
                            </div>
                        )}
                    </div>

                    {/* Chat Interface — fills remaining height */}
                    <div className="chat-container-adjusted">
                        {/* Floating rate limit bar */}
                        <div className="rate-limit-bar-floating">
                            <Zap size={14} className="limit-pulse" style={{ color: questionsLeft === 0 ? 'var(--danger)' : 'var(--success)' }} />
                            <span className={questionsLeft === 0 ? 'limit-exhausted' : questionsLeft <= 2 ? 'limit-warning' : 'limit-ok'} style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                {questionsLeft}/{QUESTION_LIMIT} questions left
                            </span>
                            {chatMessages.filter(m => m.role === 'user').length > 0 && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', borderLeft: '1px solid var(--glass-border)', paddingLeft: '0.8rem' }}>
                                    {Math.min(chatMessages.filter(m => m.role === 'user').length, 10)} Q&As Context
                                </span>
                            )}
                        </div>

                        {/* Chat Messages */}
                        <div className="chat-scroll-area">
                            {chatMessages.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                    <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                    <p style={{ fontSize: '0.95rem' }}>Upload a document and ask your first question</p>
                                </div>
                            ) : (
                                <div className="chat-messages-list">
                                    {chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`chat-bubble-wrapper ${msg.role}`}>
                                            {msg.role === 'bot' && (
                                                <div className="chat-avatar bot-avatar">AI</div>
                                            )}
                                            <div className={`chat-bubble ${msg.role}`}>
                                                {msg.loading ? (
                                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 0' }}>
                                                        <span className="typing-dot" />
                                                        <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                                                        <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
                                                    </div>
                                                ) : (
                                                    <span style={{ whiteSpace: 'pre-wrap', lineHeight: '1.65' }}>{msg.text}</span>
                                                )}
                                            </div>
                                            {msg.role === 'user' && (
                                                <div className="chat-avatar user-avatar">You</div>
                                            )}
                                        </div>
                                    ))}
                                    {/* Scroll anchor */}
                                    <div ref={chatBottomRef} />
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="chat-input-area">

                            <form onSubmit={handleAskQuestion} className="chat-input-form">
                                <input
                                    type="text"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    placeholder={
                                        !docId ? "Upload a PDF first..." :
                                        questionsLeft === 0 ? "Rate limit reached. Wait a moment..." :
                                        "Ask anything about your PDF..."
                                    }
                                    disabled={!docId || asking || questionsLeft === 0}
                                    style={{
                                        flex: 1,
                                        border: 'none',
                                        background: 'rgba(255,255,255,0.06)',
                                        borderRadius: '12px',
                                        padding: '0.9rem 1.25rem',
                                        fontSize: '0.95rem',
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            if (!asking && docId && question.trim() && questionsLeft > 0) {
                                                handleAskQuestion(e as any);
                                            }
                                        }
                                    }}
                                />
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={!docId || asking || !question.trim() || questionsLeft === 0}
                                    style={{ borderRadius: '12px', padding: '0 1.25rem', height: '48px' }}
                                >
                                    {asking ? <Loader2 className="spinner" size={18} /> : <Send size={18} />}
                                </button>
                            </form>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
