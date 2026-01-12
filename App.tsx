
import React, { useState, useRef, useEffect } from 'react';
import { analyzeWithGemini } from './services/geminiService';
import { AnalysisBatch } from './types';
import { ProcessingStep } from './components/ProcessingStep';

const loadPdfJs = async () => {
  const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
  return pdfjs;
};

const LS_KEY = 'MEDIVISION_GEMINI_KEY';

const App: React.FC = () => {
  const [manualKey, setManualKey] = useState<string>('');
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [hasValidatedKey, setHasValidatedKey] = useState<boolean>(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [batches, setBatches] = useState<AnalysisBatch[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'idle' | 'converting' | 'analyzing' | 'completed' | 'paused'>('idle');
  const [finalMarkdown, setFinalMarkdown] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [processedPages, setProcessedPages] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for environment key or stored key on mount
  useEffect(() => {
    const envKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
    const storedKey = localStorage.getItem(LS_KEY);

    if (envKey) {
      setHasValidatedKey(true);
    } else if (storedKey) {
      setManualKey(storedKey);
      setHasValidatedKey(true);
    }
  }, []);

  const handleManualKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualKey.trim().length > 10) {
      localStorage.setItem(LS_KEY, manualKey.trim());
      setHasValidatedKey(true);
      setShowKeyInput(false);
      setError(null);
      if (step === 'paused') resumeProcess();
    } else {
      setError("Lütfen geçerli bir API Anahtarı girin.");
    }
  };

  const clearCredentials = () => {
    localStorage.removeItem(LS_KEY);
    setManualKey('');
    setHasValidatedKey(false);
    setShowKeyInput(false);
    setBatches([]);
    setFile(null);
    setFinalMarkdown('');
    setStep('idle');
  };

  const triggerPlatformKey = async () => {
    // @ts-ignore
    if (window.aistudio?.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Even if the platform popup is empty/broken, we mark as key found
      // and allow the user to fallback to manual if it fails.
      setHasValidatedKey(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === 'application/pdf') {
      setFile(selected);
      setError(null);
      setStep('idle');
      setBatches([]);
      setFinalMarkdown('');
      setProcessedPages(new Set());
    }
  };

  const processPDF = async () => {
    if (!file) return;
    try {
      setIsProcessing(true);
      setError(null);
      setStep('converting');

      const pdfjs = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      const imageUrls: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        // Reduced scale from 2.0 to 1.5 to optimize memory usage for GitHub Pages/Mobile
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (context) {
          await page.render({ canvasContext: context, viewport }).promise;
          imageUrls.push(canvas.toDataURL('image/jpeg', 0.8));
        }
      }

      const initialBatches: AnalysisBatch[] = imageUrls.map((url, i) => ({
        id: `page-${i + 1}`,
        pageIndices: [i],
        imageUrls: [url],
        status: 'pending'
      }));
      
      setBatches(initialBatches);
      setStep('analyzing');
      setFinalMarkdown(`# 🩺 MediVision Akademik Sınav Analizi\n\n**Dosya:** ${file.name}\n\n---\n\n`);
      
      await runAnalysisLoop(initialBatches);
    } catch (err: any) {
      setError(`Sistem Hatası: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const resumeProcess = async () => {
    setStep('analyzing');
    setIsProcessing(true);
    await runAnalysisLoop(batches);
  };

  const runAnalysisLoop = async (currentBatches: AnalysisBatch[]) => {
    const updated = [...currentBatches];
    for (let i = 0; i < updated.length; i++) {
      if (processedPages.has(i)) continue;
      updated[i].status = 'processing';
      setBatches([...updated]);

      try {
        const result = await analyzeWithGemini(updated[i].imageUrls[0], manualKey);
        updated[i].status = 'completed';
        updated[i].result = result;
        setFinalMarkdown(prev => prev + `### 📍 SAYFA ${i + 1} ANALİZİ\n\n${result}\n\n---\n\n`);
        setProcessedPages(prev => new Set(prev).add(i));
        setBatches([...updated]);
      } catch (err: any) {
        const errType = err.message;
        if (errType === "QUOTA_EXCEEDED" || errType === "INVALID_KEY" || errType === "API_KEY_REQUIRED") {
          updated[i].status = 'pending';
          setBatches([...updated]);
          setError(errType === "QUOTA_EXCEEDED" ? "API Kotası Doldu." : "API Anahtarı Geçersiz veya Eksik.");
          setStep('paused');
          setIsProcessing(false);
          setShowKeyInput(true); // Automatically show manual input on key error
          return;
        } else {
          updated[i].status = 'error';
          setError(`Hata: ${err.message}`);
          setStep('paused');
          setIsProcessing(false);
          return;
        }
      }
    }
    setStep('completed');
    setIsProcessing(false);
  };

  const wordCount = finalMarkdown ? finalMarkdown.trim().split(/\s+/).length : 0;
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(finalMarkdown);
    alert("Rapor panoya kopyalandı!");
  };

  // Onboarding Screen with Manual Override
  if (!hasValidatedKey || showKeyInput) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 font-sans">
        <div className="max-w-xl w-full bg-white rounded-[3rem] p-16 shadow-2xl border border-slate-200 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
          
          <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-10 ring-8 ring-blue-50/30">
            <svg className="h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A10.003 10.003 0 0012 3c1.32 0 2.57.254 3.715.719m1.44 1.44a10.003 10.003 0 011.667 9.841" /></svg>
          </div>
          
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-4 text-center">Engine Access</h2>
          <p className="text-slate-500 text-center mb-10 font-medium">
            Tıbbi analiz motorunu başlatmak için API anahtarınızı doğrulayın.
          </p>

          <form onSubmit={handleManualKeySubmit} className="space-y-6">
            <div className="relative">
              <input 
                type="password"
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                placeholder="API Anahtarınızı Buraya Yapıştırın (AIZA...)"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-sm font-mono focus:outline-none focus:border-blue-600 transition-all placeholder:text-slate-300"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg uppercase">Secure Key</div>
            </div>
            
            <div className="flex space-x-4">
                <button 
                type="submit"
                className="flex-1 bg-slate-900 hover:bg-black text-white py-5 rounded-2xl font-black text-lg shadow-xl transition-all active:scale-95"
                >
                MOTORU AKTİF ET
                </button>
                {hasValidatedKey && (
                     <button 
                     type="button"
                     onClick={() => setShowKeyInput(false)}
                     className="px-6 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all"
                     >
                     İptal
                     </button>
                )}
            </div>
          </form>

          <div className="mt-8 flex items-center justify-center space-x-4">
             <div className="h-px bg-slate-100 flex-1"></div>
             <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">veya</span>
             <div className="h-px bg-slate-100 flex-1"></div>
          </div>

          <button 
            onClick={triggerPlatformKey}
            className="w-full mt-8 text-blue-600 hover:text-blue-800 font-black text-xs uppercase tracking-widest border-2 border-blue-50 py-4 rounded-2xl hover:bg-blue-50 transition-all"
          >
            Google AI Studio Anahtarı Seç
          </button>
          
          {error && <p className="mt-6 text-rose-600 text-center text-xs font-bold bg-rose-50 p-4 rounded-xl border border-rose-100 animate-shake">⚠️ {error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-20 selection:bg-blue-100">
      <header className="glass sticky top-0 z-50 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-[#1e293b] p-2.5 rounded-2xl shadow-xl">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-tight uppercase">MediVision <span className="text-blue-600">Exam Pro</span></h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center">
              Gemini 3 Pro Engine • 
              <span className="text-emerald-600 ml-1.5 flex items-center">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-1 animate-pulse"></span>
                Ready
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={clearCredentials}
            className="px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all bg-white text-rose-500 border border-rose-100 hover:bg-rose-50 hover:border-rose-200 shadow-sm uppercase"
          >
            Disconnect Key
          </button>
          {wordCount > 0 && <span className="text-xs font-black bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg">{wordCount.toLocaleString()} WORDS</span>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="bg-white border border-slate-200 rounded-[3rem] p-12 shadow-sm">
          {!file ? (
            <div className="border-4 border-dashed border-slate-100 rounded-[2.5rem] p-24 text-center cursor-pointer hover:border-blue-100 transition-all group" onClick={() => fileInputRef.current?.click()}>
              <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-8 group-hover:scale-110 transition-transform duration-300">
                <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <p className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Yükle: Tıbbi Sınav / PDF</p>
              <p className="text-slate-400 mt-2 font-medium">Soru Analizi & Etimolojik Köken Motoru</p>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="flex items-center justify-between p-10 bg-[#0f172a] rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="font-black text-2xl tracking-tight">{file.name}</p>
                  <div className="flex items-center mt-2 space-x-3">
                    <p className="text-xs text-blue-400 font-bold uppercase tracking-widest">{processedPages.size} / {batches.length} SAYFA ANALİZ EDİLDİ</p>
                    <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{Math.round((processedPages.size / batches.length) * 100) || 0}% TAMAMLANDI</p>
                  </div>
                </div>
                {!isProcessing && step !== 'completed' && (
                  <button 
                    onClick={step === 'paused' ? resumeProcess : processPDF} 
                    className="relative z-10 bg-blue-600 hover:bg-blue-500 text-white px-12 py-6 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all"
                  >
                    {step === 'paused' ? 'ANALİZE DEVAM ET' : 'ANALİZİ BAŞLAT'}
                  </button>
                )}
                {isProcessing && (
                  <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    <span className="font-bold text-sm tracking-widest animate-pulse">DERİN ANALİZ SÜRÜYOR...</span>
                  </div>
                )}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:scale-125 transition-transform duration-700" />
              </div>

              {error && (
                <div className="p-8 bg-rose-50 border-2 border-rose-200 text-rose-900 rounded-[2.5rem] text-sm flex flex-col space-y-4 shadow-xl shadow-rose-100/50">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center"><svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> {error}</span>
                    <button onClick={() => setShowKeyInput(true)} className="bg-rose-600 text-white px-8 py-3 rounded-2xl text-xs font-black shadow-lg shadow-rose-200 hover:bg-rose-700 transition-colors uppercase">Yeni Anahtar Gir</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <ProcessingStep label="Görüntü İşleme" status={step === 'converting' ? 'loading' : (step !== 'idle' ? 'completed' : 'pending')} description="PDF Sayfaları Görsel Matrise Dönüştürülüyor" />
                <ProcessingStep label="Medikal Analiz" status={step === 'analyzing' ? 'loading' : (step === 'completed' ? 'completed' : 'pending')} description="Gemini 3 Pro ile Etimolojik İnceleme" />
              </div>

              <div className="flex flex-wrap gap-3">
                {batches.map((b, i) => (
                  <div key={b.id} className={`w-12 h-12 rounded-xl flex items-center justify-center border-4 transition-all duration-300 ${b.status === 'completed' ? 'bg-emerald-500 border-emerald-400 scale-100 shadow-lg shadow-emerald-500/20' : b.status === 'processing' ? 'bg-blue-600 border-blue-400 animate-pulse scale-110' : 'bg-slate-50 border-slate-100'}`}>
                    <span className={`text-xs font-black ${b.status !== 'pending' ? 'text-white' : 'text-slate-300'}`}>{i+1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {finalMarkdown.length > 50 && (
          <div className="mt-20">
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">📊 Sınav Analiz Raporu</h3>
              <div className="flex items-center space-x-4">
                <button 
                    onClick={copyToClipboard}
                    className="text-xs font-black text-slate-500 hover:text-slate-800 tracking-widest border-b-2 border-slate-300 pb-1"
                >
                    PANOYA KOPYALA
                </button>
                <button 
                    onClick={() => {
                    const blob = new Blob([finalMarkdown], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `MediVision_Analiz_${new Date().toISOString().slice(0,10)}.md`;
                    a.click();
                    }}
                    className="text-xs font-black text-blue-600 hover:text-blue-800 tracking-widest border-b-2 border-blue-600 pb-1"
                >
                    İNDİR (.MD)
                </button>
              </div>
            </div>
            <div className="bg-white rounded-[3rem] p-16 shadow-2xl border border-slate-100">
              <div className="prose max-w-none text-slate-800 font-sans text-base leading-[1.8] whitespace-pre-wrap max-h-[1200px] overflow-y-auto custom-scrollbar pr-8">
                {finalMarkdown}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
