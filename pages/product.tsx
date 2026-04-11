"use client"

import { useState, FormEvent, useRef } from 'react';
import jsPDF from 'jspdf';
import { useAuth } from '@clerk/nextjs';
import DatePicker from 'react-datepicker';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { Protect, PricingTable, UserButton } from '@clerk/nextjs';



function ConsultationForm() {
    const { getToken } = useAuth();

    // Pre-built templates for common conditions
    const templates = [
        { label: 'Select a template...', value: '' },
        { label: 'Hypertension Follow-up', value: 'Patient presents for hypertension follow-up. Blood pressure readings at home have been elevated. No chest pain, shortness of breath, or vision changes.' },
        { label: 'Diabetes Check', value: 'Routine diabetes check. Patient reports good medication adherence. No hypoglycemic episodes. Recent labs pending.' },
        { label: 'Pediatric Well Visit', value: 'Child here for annual well visit. No acute complaints. Growth and development on track.' },
        { label: 'Depression Management', value: 'Patient seen for depression management. Mood improved with current therapy. No suicidal ideation.' },
        // Add more templates as needed
    ];

    // Form state
    const [patientName, setPatientName] = useState('');
    const [visitDate, setVisitDate] = useState<Date | null>(new Date());
    const [notes, setNotes] = useState('');
    // Specialty and urgency
    const [specialty, setSpecialty] = useState('general practice');
    const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('routine');

    // Voice input state
    const [isDictating, setIsDictating] = useState(false);
    const recognitionRef = useRef<any>(null);

    const handleStartDictation = () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            alert('Speech recognition is not supported in this browser.');
            return;
        }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setNotes(prev => prev ? prev + ' ' + transcript : transcript);
        };
        recognition.onend = () => setIsDictating(false);
        recognition.onerror = () => setIsDictating(false);
        recognitionRef.current = recognition;
        setIsDictating(true);
        recognition.start();
    };

    const handleStopDictation = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsDictating(false);
        }
    };

    // Streaming state
    const [output, setOutput] = useState('');
    const [loading, setLoading] = useState(false);

    // Ref for markdown content
    const markdownRef = useRef<HTMLDivElement>(null);

    // Export to PDF
    const handleExportPDF = () => {
        if (!output) return;
        const doc = new jsPDF();
        doc.text(output.replace(/\n/g, '\n'), 10, 10);
        doc.save('consultation-summary.pdf');
    };

    // Copy email section
    const handleCopyEmail = () => {
        if (!output) return;
        // Copy from 'Subject:' (including the line) until the next 'Notes' line or end
        const match = output.match(/(Subject:[ \t]*[\s\S]*?)(?:\nNotes|$)/i);
        const emailText = match ? match[1].trim() : '';
        if (emailText) {
            navigator.clipboard.writeText(emailText);
            alert('Email draft copied to clipboard!');
        } else {
            alert('Email section not found.');
        }
    };

    // Analytics state
    const [analytics, setAnalytics] = useState(() => {
        if (typeof window !== 'undefined') {
            const data = localStorage.getItem('consultation_analytics');
            return data ? JSON.parse(data) : { count: 0, totalTime: 0 };
        }
        return { count: 0, totalTime: 0 };
    });
    const [startTime, setStartTime] = useState<number | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setOutput('');
        setLoading(true);
        setStartTime(Date.now());

        const jwt = await getToken();
        if (!jwt) {
            setOutput('Authentication required');
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        let buffer = '';

        await fetchEventSource('/api/consultation', {
            signal: controller.signal,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
                patient_name: patientName,
                date_of_visit: visitDate?.toISOString().slice(0, 10),
                notes,
                specialty,
                urgency,
            }),
            onmessage(ev) {
                buffer += ev.data;
                setOutput(buffer);
            },
            onclose() {
                setLoading(false);
                if (startTime) {
                    const elapsed = Math.round((Date.now() - startTime) / 1000); // seconds
                    // Assume 5 min (300s) saved per consult as a placeholder
                    const timeSaved = 300;
                    const newAnalytics = {
                        count: analytics.count + 1,
                        totalTime: analytics.totalTime + timeSaved,
                    };
                    setAnalytics(newAnalytics);
                    localStorage.setItem('consultation_analytics', JSON.stringify(newAnalytics));
                }
            },
            onerror(err) {
                console.error('SSE error:', err);
                controller.abort();
                setLoading(false);
            },
        });
    }

    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-8">
                Consultation Notes
            </h1>

            <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <div className="space-y-2">
                    <label htmlFor="patient" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Patient Name
                    </label>
                    <input
                        id="patient"
                        type="text"
                        required
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        placeholder="Enter patient's full name"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Date of Visit
                    </label>
                    <DatePicker
                        id="date"
                        selected={visitDate}
                        onChange={(d: Date | null) => setVisitDate(d)}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select date"
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="template" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Template Library
                    </label>
                    <select
                        id="template"
                        value=""
                        onChange={e => {
                            const val = e.target.value;
                            if (val) setNotes(val);
                        }}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    >
                        {templates.map(t => (
                            <option key={t.label} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Consultation Notes
                    </label>
                    <div className="flex gap-2 items-center">
                        <textarea
                            id="notes"
                            required
                            rows={8}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder="Enter detailed consultation notes..."
                        />
                        <button
                            type="button"
                            onClick={isDictating ? handleStopDictation : handleStartDictation}
                            className={`ml-2 px-3 py-2 rounded-lg font-semibold transition-colors ${isDictating ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white'}`}
                            aria-label={isDictating ? 'Stop dictation' : 'Start dictation'}
                        >
                            {isDictating ? 'Stop' : '🎤 Dictate'}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label htmlFor="specialty" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Specialty
                    </label>
                    <select
                        id="specialty"
                        value={specialty}
                        onChange={e => setSpecialty(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    >
                        <option value="general practice">General Practice</option>
                        <option value="cardiology">Cardiology</option>
                        <option value="pediatrics">Pediatrics</option>
                        <option value="psychiatry">Psychiatry</option>
                        {/* Add more specialties as needed */}
                    </select>
                </div>

                <div className="space-y-2">
                    <label htmlFor="urgency" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Urgency Level
                    </label>
                    <select
                        id="urgency"
                        value={urgency}
                        onChange={e => setUrgency(e.target.value as 'routine' | 'urgent' | 'emergency')}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    >
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="emergency">Emergency</option>
                    </select>
                </div>

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
                >
                    {loading ? 'Generating Summary...' : 'Generate Summary'}
                </button>
            </form>

            {output && (
                <section className="mt-8 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-lg p-8">
                    <div className="flex gap-4 mb-4">
                        <button
                            onClick={handleExportPDF}
                            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                        >
                            Export to PDF
                        </button>
                        <button
                            onClick={handleCopyEmail}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                        >
                            Copy Email
                        </button>
                    </div>
                    {/* Structured output rendering */}
                    {(() => {
                        let parsed: any = null;
                        try {
                            parsed = JSON.parse(output);
                        } catch {
                            // Not JSON, fallback to markdown
                        }
                        if (parsed && typeof parsed === 'object' && (parsed.summary || parsed.next_steps || parsed.draft_email)) {
                            return (
                                <div className="space-y-6">
                                    {parsed.summary && (
                                        <div>
                                            <h3 className="text-lg font-bold mb-1">Summary of Visit</h3>
                                            <div className="prose prose-blue dark:prose-invert max-w-none">
                                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{parsed.summary}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}
                                    {parsed.next_steps && (
                                        <div>
                                            <h3 className="text-lg font-bold mb-1">Next Steps</h3>
                                            <div className="prose prose-blue dark:prose-invert max-w-none">
                                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{parsed.next_steps}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}
                                    {parsed.draft_email && (
                                        <div>
                                            <h3 className="text-lg font-bold mb-1">Draft Email</h3>
                                            <div className="prose prose-blue dark:prose-invert max-w-none">
                                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{parsed.draft_email}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        // Fallback: render as markdown
                        return (
                            <div ref={markdownRef} className="markdown-content prose prose-blue dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                    {output}
                                </ReactMarkdown>
                            </div>
                        );
                    })()}
                </section>
            )}

            {/* Analytics Section */}
            <section className="mt-8 bg-white dark:bg-gray-900 rounded-xl shadow p-6 flex flex-col items-center">
                <h2 className="text-lg font-bold mb-2">Consultation Analytics</h2>
                <p className="mb-1">Total consultations: <span className="font-semibold">{analytics.count}</span></p>
                <p className="mb-1">Estimated time saved: <span className="font-semibold">{Math.round(analytics.totalTime / 60)} min</span></p>
                <p className="text-xs text-gray-500">(Assumes 5 min saved per consult)</p>
            </section>
        </div>
    );
}

export default function Product() {
    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
            {/* User Menu in Top Right */}
            <div className="absolute top-4 right-4">
                <UserButton showName={true} />
            </div>

            {/* Subscription Protection */}
            <Protect
                plan="premium_subscription"
                fallback={
                    <div className="container mx-auto px-4 py-12">
                        <header className="text-center mb-12">
                            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                                Healthcare Professional Plan
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 text-lg mb-8">
                                Streamline your patient consultations with AI-powered summaries
                            </p>
                        </header>
                        <div className="max-w-4xl mx-auto">
                            <PricingTable />
                        </div>
                    </div>
                }
            >
                <ConsultationForm />
            </Protect>
        </main>
    );
}