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
      toast.error("Please fill in all required fields: Cookies, Criteria, and Template.");
      return;
    }
    setProcessing(true);
    setErrorDetails(null);
    toast.loading('Generating preview... This may take a moment.', { id: 'preview-toast' });
    try {
      const res = await fetch('/api/previewMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, criteria, template }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Preview generation failed');
      
      const results = data.results;
      if (!Array.isArray(results) || results.length === 0) {
        toast.info("No profiles found matching your criteria.", { id: 'preview-toast' });
        setPreviewResults([]);
      } else {
        if (!requireConfirmation) {
          toast.loading('Preview generated. Automatically sending messages...', { id: 'preview-toast' });
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
          toast.success('Preview generated successfully!', { id: 'preview-toast' });
        }
      }
    } catch (err) {
      console.error("Preview Error:", err);
      setErrorDetails(err.message);
      toast.error(`Preview Error: ${err.message}`, { id: 'preview-toast', duration: 8000 });
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
      if (!sendData.success) throw new Error(sendData.error || 'Send operation failed');
      setPreviewResults(sendData.results); // Usiamo previewResults per mostrare i risultati dell'invio
      setStep(3);
      toast.success('Messages sent successfully (auto-send mode)!', { id: 'preview-toast' });
    } catch (err) {
      console.error("Direct Send Error:", err);
      setErrorDetails(err.message);
      toast.error(`Send Error: ${err.message}`, { id: 'preview-toast', duration: 8000 });
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
      toast.error("Profile URL, Cookies, and Template are required to add a profile.");
      return;
    }
    setProcessing(true);
    toast.loading('Adding profile and generating message...', { id: 'add-profile-toast' });
    try {
      const res = await fetch('/api/previewMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, profileUrl: newProfileUrl.trim(), template }),
      });
      const data = await res.json();
      if (!data.success || !data.results || data.results.length === 0) throw new Error(data.error || 'Failed to add and preview profile');
      const newItem = data.results[0];
      setPreviewResults(prev => [...prev, newItem]);
      setSelected(prev => ({ ...prev, [newItem.profileUrl]: true }));
      setEditedMessages(prev => ({ ...prev, [newItem.profileUrl]: newItem.message }));
      setNewProfileUrl('');
      toast.success('Profile added and message generated!', { id: 'add-profile-toast' });
    } catch (err) {
      console.error("Add Profile Error:", err);
      toast.error(`Add Profile Error: ${err.message}`, { id: 'add-profile-toast', duration: 8000 });
    } finally {
      setProcessing(false);
    }
  };

  const handleSendSelected = async () => {
    const itemsToSend = previewResults
      .filter(r => selected[r.profileUrl])
      .map(r => ({ profileUrl: r.profileUrl, message: editedMessages[r.profileUrl] }));

    if (itemsToSend.length === 0) {
      toast.warning("No profiles selected to send messages to.");
      return;
    }
    setProcessing(true);
    setErrorDetails(null);
    toast.loading('Sending selected messages...', { id: 'send-selected-toast' });
    try {
      const res = await fetch('/api/sendMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, items: itemsToSend }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Send operation failed');
      setPreviewResults(data.results); // Aggiorna con i risultati dell'invio
      setStep(3);
      toast.success('Selected messages sent successfully!', { id: 'send-selected-toast' });
    } catch (err) {
      console.error("Send Selected Error:", err);
      setErrorDetails(err.message);
      toast.error(`Send Error: ${err.message}`, { id: 'send-selected-toast', duration: 8000 });
      setStep(3); // Vai comunque al report
      setPreviewResults(err.results || itemsToSend.map(item => ({...item, status: 'error', error: 'Unknown send error'})));
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
    toast.info("Form has been reset.");
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
            Automate personalized LinkedIn outreach with the power of AI.
          </p>
        </header>

        <main className="w-full max-w-4xl">
          {step === 1 && (
            <Card className="bg-slate-800/70 border-slate-700 shadow-2xl shadow-purple-500/10">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold text-slate-100">Setup Your Campaign</CardTitle>
                <CardDescription className="text-slate-400">Enter your LinkedIn details and message criteria.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="cookies" className="text-slate-300">LinkedIn Cookies (JSON)</Label>
                  <Textarea
                    id="cookies"
                    rows={5}
                    className="bg-slate-700/50 border-slate-600 text-slate-200 focus:ring-purple-500 focus:border-purple-500"
                    value={cookies}
                    onChange={e => setCookies(e.target.value)}
                    placeholder='Paste your LinkedIn cookies here (e.g., [{ "name": "li_at", "value": "...", ... }])'
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="criteria" className="text-slate-300">Search Criteria (Keywords)</Label>
                    <Input
                      id="criteria"
                      type="text"
                      className="bg-slate-700/50 border-slate-600 text-slate-200 focus:ring-purple-500 focus:border-purple-500"
                      value={criteria}
                      onChange={e => setCriteria(e.target.value)}
                      placeholder="e.g., Software Engineer in Milan"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template" className="text-slate-300">Base Message Template</Label>
                    <Textarea
                      id="template"
                      rows={3}
                      className="bg-slate-700/50 border-slate-600 text-slate-200 focus:ring-purple-500 focus:border-purple-500"
                      value={template}
                      onChange={e => setTemplate(e.target.value)}
                      placeholder="e.g., Hi {name}, I saw your profile..."
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
                  <Label htmlFor="requireConfirmation" className="text-slate-300 cursor-pointer">Require confirmation before sending messages</Label>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button 
                  onClick={handleGeneratePreview} 
                  disabled={processing}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-8 py-3 rounded-lg shadow-lg transform transition-all duration-150 hover:scale-105 active:scale-95"
                >
                  {processing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                  {requireConfirmation ? 'Generate Preview' : 'Find & Send Directly'}
                </Button>
              </CardFooter>
            </Card>
          )}

          {step === 2 && (
            <Card className="bg-slate-800/70 border-slate-700 shadow-2xl shadow-pink-500/10">
              <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="text-2xl font-semibold text-slate-100">Preview & Refine Messages</CardTitle>
                        <CardDescription className="text-slate-400">
                            Review profiles and customize messages. LinkedIn Search URL:
                            <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-purple-400 hover:text-purple-300 underline inline-flex items-center">
                                {searchUrl} <ExternalLink className="ml-1 h-4 w-4" />
                            </a>
                        </CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => setStep(1)} className="text-slate-300 border-slate-600 hover:bg-slate-700 hover:text-slate-100">
                        <Edit3 className="mr-2 h-4 w-4" /> Edit Setup
                    </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-6 p-4 border border-slate-700 rounded-lg bg-slate-700/30">
                    <Label htmlFor="newProfileUrl" className="text-slate-300 block mb-2">Add Specific Profile URL (Optional)</Label>
                    <div className="flex gap-2">
                        <Input
                        id="newProfileUrl"
                        type="url"
                        className="flex-grow bg-slate-600/50 border-slate-500 text-slate-200 focus:ring-pink-500 focus:border-pink-500"
                        value={newProfileUrl}
                        onChange={e => setNewProfileUrl(e.target.value)}
                        placeholder="https://www.linkedin.com/in/your-target-profile/"
                        />
                        <Button onClick={handleAddProfile} disabled={processing || !newProfileUrl.trim()} variant="secondary" className="bg-pink-600 hover:bg-pink-700 text-white">
                            {processing && newProfileUrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />} Add Profile
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
                                aria-label="Select all rows"
                                className="data-[state=checked]:bg-purple-500 border-slate-500"
                            /></TableHead>
                            <TableHead>Profile</TableHead>
                            <TableHead className="w-1/3">Contact Info</TableHead>
                            <TableHead className="w-1/2">Generated Message</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {previewResults.map((r, index) => (
                            <TableRow key={r.profileUrl || index} className="border-slate-700 hover:bg-slate-700/30">
                            <TableCell>
                                <Checkbox 
                                checked={!!selected[r.profileUrl]}
                                onCheckedChange={() => setSelected(prev => ({ ...prev, [r.profileUrl]: !prev[r.profileUrl] }))}
                                aria-label={`Select row for ${r.profileData?.name || 'profile'}`}
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
                                    toast.info('Profile removed from preview.');
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
                        <p>No profiles to preview yet. Generate a preview or add a profile URL.</p>
                    </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6">
                <p className="text-sm text-slate-400">
                    {Object.values(selected).filter(Boolean).length} of {previewResults.length} profiles selected.
                </p>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={handleReset} disabled={processing} className="text-slate-300 border-slate-600 hover:bg-slate-700 hover:text-slate-100">
                        <RotateCcw className="mr-2 h-4 w-4" /> Start Over
                    </Button>
                    <Button 
                        onClick={handleSendSelected} 
                        disabled={processing || Object.values(selected).filter(Boolean).length === 0}
                        className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-semibold px-6 py-2.5 rounded-lg shadow-lg transform transition-all duration-150 hover:scale-105 active:scale-95"
                    >
                        {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Send Selected Messages
                    </Button>
                </div>
              </CardFooter>
            </Card>
          )}

          {step === 3 && (
            <Card className="bg-slate-800/70 border-slate-700 shadow-2xl shadow-purple-500/20">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold text-slate-100">Campaign Report</CardTitle>
                <CardDescription className="text-slate-400">Summary of the messages sent.</CardDescription>
              </CardHeader>
              <CardContent>
              {errorDetails && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-red-300 text-sm">
                    <p className="font-semibold mb-1">An error occurred during the process:</p>
                    <p>{errorDetails}</p>
                </div>
              )}
              {previewResults.length > 0 ? (
                <Table className="text-slate-300">
                    <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-slate-700/30">
                        <TableHead>Profile URL</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Details</TableHead>
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
                                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Sent
                            </span> : 
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-700/50 text-red-300">
                                <XCircle className="mr-1.5 h-4 w-4" /> Error
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
                        <p>No message sending activity to report.</p>
                    </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-end pt-6">
                <Button onClick={handleReset} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold">
                  <RotateCcw className="mr-2 h-4 w-4" /> Start New Campaign
                </Button>
              </CardFooter>
            </Card>
          )}
        </main>

        <footer className="w-full max-w-4xl mt-12 text-center text-sm text-slate-500">
            <Separator className="my-6 bg-slate-700" />
            <p>&copy; {new Date().getFullYear()} LinkedIn Auto Messenger AI. </p>
            <p>Crafted with passion for efficient outreach.</p>
        </footer>

      </div>
    </>
  );
}