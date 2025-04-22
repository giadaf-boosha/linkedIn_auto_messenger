import React, { useState } from 'react';

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
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState([]);
  const [status, setStatus] = useState('');

  const handleGeneratePreview = async (e) => {
    e?.preventDefault();
    setStatus('Generating preview...');
    try {
      const res = await fetch('/api/previewMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, criteria, template }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Preview failed');
      const results = data.results;
      if (!requireConfirmation) {
        setStatus('Sending messages...');
        const sendRes = await fetch('/api/sendMessages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies, items: results.map(r => ({ profileUrl: r.profileUrl, message: r.message })) }),
        });
        const sendData = await sendRes.json();
        if (!sendData.success) throw new Error(sendData.error || 'Send failed');
        setSendResults(sendData.results);
        setStep(3);
        setStatus('');
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
        setStatus('');
      }
    } catch (err) {
      setStatus('Error: ' + err.message);
    }
  };

  const handleAddProfile = async () => {
    if (!newProfileUrl.trim()) return;
    setStatus('Adding profile preview...');
    try {
      const res = await fetch('/api/previewMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, profileUrl: newProfileUrl.trim(), template }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to add profile');
      const newItem = data.results[0];
      setPreviewResults(prev => [...prev, newItem]);
      setSelected(prev => ({ ...prev, [newItem.profileUrl]: true }));
      setEditedMessages(prev => ({ ...prev, [newItem.profileUrl]: newItem.message }));
      setNewProfileUrl('');
      setStatus('');
    } catch (err) {
      setStatus('Error: ' + err.message);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setStatus('Sending messages...');
    const itemsToSend = previewResults
      .filter(r => selected[r.profileUrl])
      .map(r => ({ profileUrl: r.profileUrl, message: editedMessages[r.profileUrl] }));
    try {
      const res = await fetch('/api/sendMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, items: itemsToSend }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Send failed');
      setSendResults(data.results);
      setStep(3);
      setStatus('');
    } catch (err) {
      setStatus('Error: ' + err.message);
    } finally {
      setSending(false);
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
    setSendResults([]);
    setStatus('');
  };

  // Compute search URL for preview
  const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(criteria)}`;
  return (
    <div className="container">
      <h1>LinkedIn Auto Messenger</h1>
      {status && <p>{status}</p>}
      {step === 1 && (
        <div className="card">
          <form onSubmit={handleGeneratePreview} className="form-grid">
            <div className="form-group">
              <label>LinkedIn Cookies (JSON):</label>
              <textarea
                rows={6}
                className="input"
                value={cookies}
                onChange={e => setCookies(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Search Criteria:</label>
              <input
                type="text"
                className="input"
                value={criteria}
                onChange={e => setCriteria(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Message Template:</label>
              <textarea
                rows={4}
                className="input"
                value={template}
                onChange={e => setTemplate(e.target.value)}
                required
              />
            </div>
            <div className="form-group toggle-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={requireConfirmation}
                  onChange={e => setRequireConfirmation(e.target.checked)}
                />
                <span className="slider" />
              </label>
              <span>Require confirmation before sending</span>
            </div>
            <button type="submit" className="button">Generate Preview</button>
          </form>
        </div>
      )}
      {step === 2 && (
        <div className="card">
          <h2>Preview Messages</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
            Search URL: <a href={searchUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>{searchUrl}</a>
          </p>
          <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Profile</th>
                <th>Info</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {previewResults.map(r => (
                <tr key={r.profileUrl}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!selected[r.profileUrl]}
                      onChange={() => setSelected(prev => ({ ...prev, [r.profileUrl]: !prev[r.profileUrl] }))}
                    />
                  </td>
                  <td>
                    <a href={r.profileUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
                      {r.profileData.name || r.profileUrl}
                    </a>
                  </td>
                  <td>
                    <div className="info-cell">
                      {r.profileData.name && <p className="name">{r.profileData.name}</p>}
                      {r.profileData.headline && <p className="headline">{r.profileData.headline}</p>}
                      {r.profileData.location && <p className="location">{r.profileData.location}</p>}
                      {r.profileData.companyName && <p className="company">{r.profileData.companyName}</p>}
                      {r.profileData.jobTitle && <p className="job-title">{r.profileData.jobTitle}</p>}
                      {Array.isArray(r.profileData.skills) && r.profileData.skills.length > 0 && (
                        <p className="skills">Skills: {r.profileData.skills.join(', ')}</p>
                      )}
                      {r.profileData.profileSummary && <p className="summary">{r.profileData.profileSummary}</p>}
                      {r.profileData.email && <p className="email">Email: {r.profileData.email}</p>}
                      {r.profileData.phone && <p className="phone">Phone: {r.profileData.phone}</p>}
                      {r.profileData.website && (
                        <p className="website">
                          Website: <a href={r.profileData.website} target="_blank" rel="noopener noreferrer">{r.profileData.website}</a>
                        </p>
                      )}
                      {/* Job details */}
                      {r.profileData.jobDateRange && <p className="job-date">Job Date Range: {r.profileData.jobDateRange}</p>}
                      {r.profileData.jobDuration && <p className="job-duration">Job Duration: {r.profileData.jobDuration}</p>}
                      {r.profileData.jobLocation && <p className="job-location">Job Location: {r.profileData.jobLocation}</p>}
                      {r.profileData.jobCompanyUrl && (
                        <p className="job-company-url">
                          Company Page: <a href={r.profileData.jobCompanyUrl} target="_blank" rel="noopener noreferrer">{r.profileData.jobCompanyUrl}</a>
                        </p>
                      )}
                      {r.profileData.jobDescription && <p className="job-description">{r.profileData.jobDescription}</p>}
                      {/* Education details */}
                      {r.profileData.schoolName && <p className="school">School: {r.profileData.schoolName}</p>}
                      {r.profileData.schoolDegree && <p className="school-degree">Degree: {r.profileData.schoolDegree}</p>}
                      {r.profileData.schoolDescription && <p className="school-description">{r.profileData.schoolDescription}</p>}
                      {r.profileData.schoolUrl && (
                        <p className="school-url">
                          School Page: <a href={r.profileData.schoolUrl} target="_blank" rel="noopener noreferrer">{r.profileData.schoolUrl}</a>
                        </p>
                      )}
                    </div>
                  </td>
                  <td>
                    <textarea
                      rows={4}
                      style={{ width: '100%' }}
                      value={editedMessages[r.profileUrl]}
                      onChange={e => setEditedMessages(prev => ({ ...prev, [r.profileUrl]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div className="form-group">
            <h3>Add Profile</h3>
            <div className="form-group-inline">
              <input
                type="text"
                placeholder="https://www.linkedin.com/in/..."
                className="input"
                value={newProfileUrl}
                onChange={e => setNewProfileUrl(e.target.value)}
              />
              <button onClick={handleAddProfile} className="button">Add Profile</button>
            </div>
          </div>
          <button onClick={handleSend} className="button" disabled={sending}>Send Selected Messages</button>
        </div>
      )}
      {step === 3 && (
        <div className="card">
          <h2>Send Results</h2>
          <ul>
            {sendResults.map((r, i) => (
              <li key={i}>
                {r.profileUrl}: {r.status}{r.error ? ` (${r.error})` : ''}
              </li>
            ))}
          </ul>
          <button onClick={handleReset} className="button">Start Over</button>
        </div>
      )}
    </div>
  );
}