"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { UploadCloud, FileText, Send, LogOut, Clock, Loader2, MessageSquare } from 'lucide-react';

interface HistoryItem {
    id: number;
    question: string;
    answer: string;
    created_at: string;
}

export default function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    const [file, setFile] = useState<File | null>(null);
    const [docId, setDocId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const [question, setQuestion] = useState('');
    const [asking, setAsking] = useState(false);
    const [currentChat, setCurrentChat] = useState<{ q: string, a: string } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

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
        // We try to fetch from our backend API for consistency if possible, 
        // but for now we'll fetch directly since the backend supports it and we want realtime updates.
        // Replace with backend API call once backend is running on known port.
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${API_URL}/api/history/${userId}`);
            if (res.ok) {
                const data = await res.json();
                setHistory(data.history || []);
            }
        } catch (e) {
            console.error("Failed to fetch history API", e);
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
            setCurrentChat(null);

            const formData = new FormData();
            formData.append('file', selectedFile);

            try {
                const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const res = await fetch(`${API_URL}/api/upload`, {
                    method: 'POST',
                    body: formData,
                });

                if (!res.ok) throw new Error("Upload failed");

                const data = await res.json();
                setDocId(data.doc_id);
            } catch (err) {
                alert("Failed to process PDF. Make sure the backend is running.");
                console.error(err);
            } finally {
                setUploading(false);
            }
        }
    };

    const handleAskQuestion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim() || !docId || !user) return;

        const q = question;
        setQuestion('');
        setAsking(true);
        setCurrentChat({ q, a: '' });

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${API_URL}/api/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doc_id: docId,
                    question: q,
                    user_id: user.id
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to get answer");
            }

            const data = await res.json();
            setCurrentChat({ q, a: data.answer });

            // Refresh history sidebar
            fetchHistory(user.id);
        } catch (err: any) {
            alert("Error generating answer: " + err.message);
            setCurrentChat(null);
        } finally {
            setAsking(false);
        }
    };

    if (!user) {
        return (
            <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <Loader2 className="spinner" style={{ width: '40px', height: '40px', color: 'var(--primary)' }} />
            </div>
        );
    }

    return (
        <div className="app-container">
            {/* Sidebar History */}
            <div className="sidebar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                    <div style={{ padding: '8px', background: 'var(--primary)', borderRadius: '8px' }}>
                        <FileText size={24} color="white" />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Ask PDF</h2>
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
                <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>

                    {/* Header/Upload Section */}
                    <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', textAlign: 'center' }}>
                        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Document Intelligence</h1>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Upload a PDF and ask questions directly to it.</p>

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
                            disabled={uploading}
                        >
                            {uploading ? <Loader2 className="spinner" size={20} /> : <UploadCloud size={20} />}
                            {uploading ? 'Processing PDF...' : file ? `Uploaded: ${file.name}` : 'Upload PDF Document'}
                        </button>

                        {docId && (
                            <div style={{ marginTop: '1rem' }} className="alert alert-success">
                                PDF successfully analyzed and loaded into memory.
                            </div>
                        )}
                    </div>

                    {/* Chat Interface */}
                    <div style={{ flex: 1, background: 'var(--glass-bg)', borderRadius: '16px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                        {/* Chat Messages */}
                        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                            {!currentChat ? (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                    <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                    <p>Upload a document and ask a question to begin</p>
                                </div>
                            ) : (
                                <>
                                    <div className="chat-message user">
                                        <strong>You:</strong>
                                        <div style={{ marginTop: '0.5rem' }}>{currentChat.q}</div>
                                    </div>

                                    <div className="chat-message bot">
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ color: 'var(--primary)' }}>AI Assistant</span>
                                        </strong>
                                        <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                                            {asking ? <Loader2 className="spinner" size={20} color="var(--primary)" /> : currentChat.a}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Input Area */}
                        <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--glass-border)' }}>
                            <form onSubmit={handleAskQuestion} style={{ display: 'flex', gap: '1rem' }}>
                                <input
                                    type="text"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    placeholder={docId ? "Ask a question about your PDF..." : "Please upload a PDF first..."}
                                    disabled={!docId || asking}
                                    style={{ flex: 1, border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem 1.5rem' }}
                                />
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={!docId || asking || !question.trim()}
                                    style={{ borderRadius: '12px', padding: '0 1.5rem' }}
                                >
                                    <Send size={20} />
                                </button>
                            </form>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
