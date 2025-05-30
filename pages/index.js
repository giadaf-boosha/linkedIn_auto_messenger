import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Send, RotateCcw, PlusCircle, Loader2, Trash2, Edit3, CheckCircle2, XCircle, Info } from 'lucide-react';

export default function Home() {
  const [cookies, setCookies] = useState('');
  const [criteria, setCriteria] = useState('');
  const [template, setTemplate] = useState('');
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [step, setStep] = useState(1);
  const [previewResults, setPreviewResults] = useState([]);
  const [selected, setSelected] = useState({});
  const [editedMessages, setEditedMessages] = useState({});
  const [newProfileUrl, setNewProfileUrl] = useState('');
  const [processing, setProcessing] = useState(false); // Per stati di caricamento generici
  const [errorDetails, setErrorDetails] = useState(null); // Per mostrare errori più dettagliati

  useEffect(() => {
    // Logica per inizializzazione se necessaria, es. caricare valori da localStorage
  }, []);

  const handleGeneratePreview = async (e) => {
    e?.preventDefault();
    if (!cookies || !criteria || !template) {
      toast.error("Compila tutti i campi obbligatori: Cookie, Criteri e Modello.");
      return;
    }
    setProcessing(true);
    setErrorDetails(null);
    toast.loading('Generazione anteprima... Potrebbe volerci un momento.', { id: 'preview-toast' });
    try {
      const res = await fetch('/api/previewMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, criteria, template }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Generazione anteprima fallita');
      
      const results = data.results;
      if (!Array.isArray(results) || results.length === 0) {
        toast.info("Nessun profilo trovato corrispondente ai tuoi criteri.", { id: 'preview-toast' });
        setPreviewResults([]);
      } else {
        if (!requireConfirmation) {
          toast.loading('Anteprima generata. Invio messaggi automatico...', { id: 'preview-toast' });
          // Direttamente invio se la conferma non è richiesta
          await handleDirectSend(results);
      } else {
        setPreviewResults(results);
        const initSel = {};
        const initEdits = {};
        results.forEach(r => {
          initSel[r.profileUrl] = true;
          initEdits[r.profileUrl] = r.message;
        });
        setSelected(initSel);
        setEditedMessages(initEdits);
        setStep(2);
          toast.success('Anteprima generata con successo!', { id: 'preview-toast' });
        }
      }
    } catch (err) {
      console.error("Errore Anteprima:", err);
      setErrorDetails(err.message);
      toast.error(`Errore Anteprima: ${err.message}`, { id: 'preview-toast', duration: 8000 });
    } finally {
      setProcessing(false);
    }
  };

  const handleDirectSend = async (profilesToProcess) => {
    setProcessing(true);
    setErrorDetails(null);
    try {
      const itemsToAutoSend = profilesToProcess.map(r => ({ profileUrl: r.profileUrl, message: r.message }));
      const sendRes = await fetch('/api/sendMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, items: itemsToAutoSend }),
      });
      const sendData = await sendRes.json();
      if (!sendData.success) throw new Error(sendData.error || 'Operazione di invio fallita');
      setPreviewResults(sendData.results); // Usiamo previewResults per mostrare i risultati dell'invio
      setStep(3);
      toast.success('Messaggi inviati con successo (modalità invio automatico)!', { id: 'preview-toast' });
    } catch (err) {
      console.error("Errore Invio Diretto:", err);
      setErrorDetails(err.message);
      toast.error(`Errore Invio: ${err.message}`, { id: 'preview-toast', duration: 8000 });
      // Anche se c'è un errore, potremmo voler passare allo step 3 per vedere i risultati parziali
      // O gestire diversamente, es. rimanere allo step 1
      setStep(3); // Vai comunque al report per vedere cosa è successo
      setPreviewResults(err.results || []); // Mostra risultati parziali se disponibili nell'errore
    }
    finally {
      setProcessing(false);
    }
  };

  const handleAddProfile = async () => {
    if (!newProfileUrl.trim() || !cookies || !template) {
      toast.error("URL Profilo, Cookie e Modello sono obbligatori per aggiungere un profilo.");
      return;
    }
    setProcessing(true);
    toast.loading('Aggiunta profilo e generazione messaggio...', { id: 'add-profile-toast' });
    try {
      const res = await fetch('/api/previewMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, profileUrl: newProfileUrl.trim(), template }),
      });
      const data = await res.json();
      if (!data.success || !data.results || data.results.length === 0) throw new Error(data.error || 'Impossibile aggiungere e visualizzare anteprima profilo');
      const newItem = data.results[0];
      setPreviewResults(prev => [...prev, newItem]);
      setSelected(prev => ({ ...prev, [newItem.profileUrl]: true }));
      setEditedMessages(prev => ({ ...prev, [newItem.profileUrl]: newItem.message }));
      setNewProfileUrl('');
      toast.success('Profilo aggiunto e messaggio generato!', { id: 'add-profile-toast' });
    } catch (err) {
      console.error("Errore Aggiunta Profilo:", err);
      toast.error(`Errore Aggiunta Profilo: ${err.message}`, { id: 'add-profile-toast', duration: 8000 });
    } finally {
      setProcessing(false);
    }
  };

  const handleSendSelected = async () => {
    const itemsToSend = previewResults
      .filter(r => selected[r.profileUrl])
      .map(r => ({ profileUrl: r.profileUrl, message: editedMessages[r.profileUrl] }));

    if (itemsToSend.length === 0) {
      toast.warning("Nessun profilo selezionato a cui inviare messaggi.");
      return;
    }
    setProcessing(true);
    setErrorDetails(null);
    toast.loading('Invio messaggi selezionati...', { id: 'send-selected-toast' });
    try {
      const res = await fetch('/api/sendMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, items: itemsToSend }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Operazione di invio fallita');
      setPreviewResults(data.results); // Aggiorna con i risultati dell'invio
      setStep(3);
      toast.success('Messaggi selezionati inviati con successo!', { id: 'send-selected-toast' });
    } catch (err) {
      console.error("Errore Invio Selezionati:", err);
      setErrorDetails(err.message);
      toast.error(`Errore Invio: ${err.message}`, { id: 'send-selected-toast', duration: 8000 });
      setStep(3); // Vai comunque al report
      setPreviewResults(err.results || itemsToSend.map(item => ({...item, status: 'error', error: 'Errore di invio sconosciuto'})));
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setCookies('');
    setCriteria('');
    setTemplate('');
    setRequireConfirmation(true);
    setStep(1);
    setPreviewResults([]);
    setSelected({});
    setEditedMessages({});
    setNewProfileUrl('');
    setProcessing(false);
    setErrorDetails(null);
    toast.info("Il modulo è stato resettato.");
  };

  const searchUrl = criteria ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(criteria)}` : '#';

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 flex flex-col items-center p-4 md:p-8">
        <header className="w-full max-w-4xl mb-8 md:mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
            LinkedIn Auto Messenger AI
          </h1>
          <p className="text-slate-400 mt-2 text-lg">
            Automatizza l'invio di messaggi LinkedIn personalizzati con la potenza dell'IA.
          </p>
        </header>

        <main className="w-full max-w-4xl">
      {step === 1 && (
            <Card className="bg-slate-800/70 border-slate-700 shadow-2xl shadow-purple-500/10">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold text-slate-100">Configura la Tua Campagna</CardTitle>
                <CardDescription className="text-slate-400">Inserisci i dettagli LinkedIn e i criteri del messaggio.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="cookies" className="text-slate-300">Cookie di LinkedIn (JSON)</Label>
                  <Textarea
                    id="cookies"
                    rows={5}
                    className="bg-slate-700/50 border-slate-600 text-slate-200 focus:ring-purple-500 focus:border-purple-500"
                value={cookies}
                onChange={e => setCookies(e.target.value)}
                    placeholder='Incolla qui i tuoi cookie di LinkedIn (es., [{ "name": "li_at", "value": "...", ... }])'
                required
              />
            </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="criteria" className="text-slate-300">Criteri di Ricerca (Parole Chiave)</Label>
                    <Input
                      id="criteria"
                type="text"
                      className="bg-slate-700/50 border-slate-600 text-slate-200 focus:ring-purple-500 focus:border-purple-500"
                value={criteria}
                onChange={e => setCriteria(e.target.value)}
                      placeholder="es., Software Engineer a Milano"
                required
              />
            </div>
                  <div className="space-y-2">
                    <Label htmlFor="template" className="text-slate-300">Modello Messaggio Base</Label>
                    <Textarea
                      id="template"
                      rows={3}
                      className="bg-slate-700/50 border-slate-600 text-slate-200 focus:ring-purple-500 focus:border-purple-500"
                value={template}
                onChange={e => setTemplate(e.target.value)}
                      placeholder="es., Ciao {name}, ho visto il tuo profilo..."
                required
              />
            </div>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    id="requireConfirmation"
                  checked={requireConfirmation}
                    onCheckedChange={setRequireConfirmation}
                    className="data-[state=checked]:bg-purple-500"
                />
                  <Label htmlFor="requireConfirmation" className="text-slate-300 cursor-pointer">Richiedi conferma prima di inviare i messaggi</Label>
            </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button 
                  onClick={handleGeneratePreview} 
                  disabled={processing}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-8 py-3 rounded-lg shadow-lg transform transition-all duration-150 hover:scale-105 active:scale-95"
                >
                  {processing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                  {requireConfirmation ? 'Genera Anteprima' : 'Trova e Invia Direttamente'}
                </Button>
              </CardFooter>
            </Card>
      )}

      {step === 2 && (
            <Card className="bg-slate-800/70 border-slate-700 shadow-2xl shadow-pink-500/10">
              <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="text-2xl font-semibold text-slate-100">Anteprima e Modifica Messaggi</CardTitle>
                        <CardDescription className="text-slate-400">
                            Controlla i profili e personalizza i messaggi. URL Ricerca LinkedIn:
                            <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-purple-400 hover:text-purple-300 underline inline-flex items-center">
                                {searchUrl} <ExternalLink className="ml-1 h-4 w-4" />
                            </a>
                        </CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => setStep(1)} className="text-slate-300 border-slate-600 hover:bg-slate-700 hover:text-slate-100">
                        <Edit3 className="mr-2 h-4 w-4" /> Modifica Configurazione
                    </Button>
          </div>
              </CardHeader>
              <CardContent>
                <div className="mb-6 p-4 border border-slate-700 rounded-lg bg-slate-700/30">
                    <Label htmlFor="newProfileUrl" className="text-slate-300 block mb-2">Aggiungi URL Profilo Specifico (Opzionale)</Label>
                    <div className="flex gap-2">
                        <Input
                        id="newProfileUrl"
                        type="url"
                        className="flex-grow bg-slate-600/50 border-slate-500 text-slate-200 focus:ring-pink-500 focus:border-pink-500"
                value={newProfileUrl}
                onChange={e => setNewProfileUrl(e.target.value)}
                        placeholder="https://www.linkedin.com/in/il-tuo-profilo-target/"
              />
                        <Button onClick={handleAddProfile} disabled={processing || !newProfileUrl.trim()} variant="secondary" className="bg-pink-600 hover:bg-pink-700 text-white">
                            {processing && newProfileUrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />} Aggiungi Profilo
                        </Button>
            </div>
          </div>
                
                {previewResults.length > 0 ? (
                    <div className="overflow-x-auto">
                    <Table className="text-slate-300">
                        <TableHeader>
                        <TableRow className="border-slate-700 hover:bg-slate-700/30">
                            <TableHead className="w-[50px]"><Checkbox 
                                checked={previewResults.every(r => selected[r.profileUrl]) || (previewResults.some(r => selected[r.profileUrl]) && 'indeterminate')} 
                                onCheckedChange={(checked) => {
                                    const newSelected = {};
                                    if (checked) {
                                        previewResults.forEach(r => newSelected[r.profileUrl] = true);
                                    } // else uncheck all
                                    setSelected(newSelected);
                                }}
                                aria-label="Seleziona tutte le righe"
                                className="data-[state=checked]:bg-purple-500 border-slate-500"
                            /></TableHead>
                            <TableHead>Profilo</TableHead>
                            <TableHead className="w-1/3">Info Contatto</TableHead>
                            <TableHead className="w-1/2">Messaggio Generato</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {previewResults.map((r, index) => (
                            <TableRow key={r.profileUrl || index} className="border-slate-700 hover:bg-slate-700/30">
                            <TableCell>
                                <Checkbox 
                                checked={!!selected[r.profileUrl]}
                                onCheckedChange={() => setSelected(prev => ({ ...prev, [r.profileUrl]: !prev[r.profileUrl] }))}
                                aria-label={`Seleziona riga per ${r.profileData?.name || 'profilo'}`}
                                className="data-[state=checked]:bg-purple-500 border-slate-500"
                                />
                            </TableCell>
                            <TableCell>
                                <a href={r.profileUrl} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 hover:underline font-medium inline-flex items-center">
                                {r.profileData?.name || r.profileUrl.split('/').filter(Boolean).pop()} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                                </a>
                            </TableCell>
                            <TableCell className="text-sm">
                                {r.profileData ? (
                                <div className="space-y-1">
                                    {r.profileData.name && <p className="font-semibold text-slate-100">{r.profileData.name}</p>}
                                    {r.profileData.headline && <p className="text-slate-400 text-xs">{r.profileData.headline}</p>}
                                    {r.profileData.location && <p className="text-slate-500 text-xs">{r.profileData.location}</p>}
                                    {r.profileData.jobTitle && r.profileData.companyName && <p className="text-slate-500 text-xs">{r.profileData.jobTitle} at {r.profileData.companyName}</p>}
                                    {r.profileData.error && <p className="text-red-400 text-xs"><XCircle className="inline mr-1 h-3 w-3"/>{r.profileData.error}</p>}
                                </div>
                                ) : <span className="text-slate-500">N/A</span>}
                            </TableCell>
                            <TableCell>
                                <Textarea
                                rows={5}
                                className="w-full bg-slate-700/50 border-slate-600 text-slate-200 focus:ring-pink-500 focus:border-pink-500 text-sm"
                                value={editedMessages[r.profileUrl] || ''}
                                onChange={e => setEditedMessages(prev => ({ ...prev, [r.profileUrl]: e.target.value }))}
                                disabled={r.profileData?.error}
                                />
                            </TableCell>
                            <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => {
                                    setPreviewResults(prev => prev.filter(item => item.profileUrl !== r.profileUrl));
                                    const newSelected = {...selected};
                                    delete newSelected[r.profileUrl];
                                    setSelected(newSelected);
                                    const newEdited = {...editedMessages};
                                    delete newEdited[r.profileUrl];
                                    setEditedMessages(newEdited);
                                    toast.info('Profilo rimosso dall\'anteprima.');
                                }} className="text-red-500 hover:text-red-400 hover:bg-red-900/30 p-2">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                    </div>
                ) : (
                    <div className="text-center py-10 text-slate-500">
                        <Info className="mx-auto h-12 w-12 mb-2" />
                        <p>Nessun profilo da visualizzare in anteprima. Genera un\'anteprima o aggiungi l\'URL di un profilo.</p>
        </div>
      )}
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6">
                <p className="text-sm text-slate-400">
                    {Object.values(selected).filter(Boolean).length} di {previewResults.length} profili selezionati.
                </p>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={handleReset} disabled={processing} className="text-slate-300 border-slate-600 hover:bg-slate-700 hover:text-slate-100">
                        <RotateCcw className="mr-2 h-4 w-4" /> Ricomincia
                    </Button>
                    <Button 
                        onClick={handleSendSelected} 
                        disabled={processing || Object.values(selected).filter(Boolean).length === 0}
                        className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-semibold px-6 py-2.5 rounded-lg shadow-lg transform transition-all duration-150 hover:scale-105 active:scale-95"
                    >
                        {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Invia Messaggi Selezionati
                    </Button>
                </div>
              </CardFooter>
            </Card>
          )}

      {step === 3 && (
            <Card className="bg-slate-800/70 border-slate-700 shadow-2xl shadow-purple-500/20">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold text-slate-100">Report Campagna</CardTitle>
                <CardDescription className="text-slate-400">Riepilogo dei messaggi inviati.</CardDescription>
              </CardHeader>
              <CardContent>
              {errorDetails && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-red-300 text-sm">
                    <p className="font-semibold mb-1">Si è verificato un errore durante il processo:</p>
                    <p>{errorDetails}</p>
                </div>
              )}
              {previewResults.length > 0 ? (
                <Table className="text-slate-300">
                    <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-slate-700/30">
                        <TableHead>URL Profilo</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead>Dettagli</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {previewResults.map((r, index) => (
                        <TableRow key={r.profileUrl || index} className="border-slate-700 hover:bg-slate-700/30">
                        <TableCell>
                            <a href={r.profileUrl} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 hover:underline inline-flex items-center">
                            {r.profileData?.name || r.profileUrl.split('/').filter(Boolean).pop()} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                            </a>
                        </TableCell>
                        <TableCell>
                            {r.status === 'sent' ? 
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-700/50 text-green-300">
                                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Inviato
                            </span> : 
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-700/50 text-red-300">
                                <XCircle className="mr-1.5 h-4 w-4" /> Errore
                            </span>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-400">{r.error || '-'}</TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                ) : (
                    <div className="text-center py-10 text-slate-500">
                        <Info className="mx-auto h-12 w-12 mb-2" />
                        <p>Nessuna attività di invio messaggi da segnalare.</p>
        </div>
      )}
              </CardContent>
              <CardFooter className="flex justify-end pt-6">
                <Button onClick={handleReset} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold">
                  <RotateCcw className="mr-2 h-4 w-4" /> Inizia Nuova Campagna
                </Button>
              </CardFooter>
            </Card>
          )}
        </main>

        <footer className="w-full max-w-4xl mt-12 text-center text-sm text-slate-500">
            <Separator className="my-6 bg-slate-700" />
            <p>&copy; {new Date().getFullYear()} LinkedIn Auto Messenger AI. </p>
            <p>Realizzato con passione per un outreach efficiente.</p>
        </footer>

    </div>
    </>
  );
}