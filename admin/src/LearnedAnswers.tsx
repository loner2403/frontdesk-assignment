import React, { useEffect, useState } from 'react';

export type KnowledgeBaseEntry = {
  id: string;
  question: string;
  answer: string;
  created_at: string;
  source: string;
};

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const LearnedAnswers: React.FC = () => {
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [pagination, setPagination] = useState<PaginationInfo>({ total: 0, page: 1, limit: 10, pages: 0 });
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchEntries = (page: number = 1) => {
    setLoading(true);
    fetch(`${API_URL}/knowledge-base?page=${page}&limit=${pagination.limit}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(response => {
        setEntries(response.data);
        setPagination(response.pagination);
        setLastRefresh(new Date());
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEntries();
    
    // Set up polling to refresh knowledge base entries
    const intervalId = setInterval(() => fetchEntries(pagination.page), 30000); // Check every 30 seconds
    
    // Clean up on unmount
    return () => clearInterval(intervalId);
  }, []);

  const handleRefresh = () => {
    setError(null);
    fetchEntries(pagination.page);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.pages) return;
    fetchEntries(newPage);
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/kb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQuestion, answer: newAnswer })
      });
      if (!res.ok) throw new Error('Failed to add entry');
      setNewQuestion('');
      setNewAnswer('');
      fetchEntries(1); // Go to first page to see new entry
    } catch (err: any) {
      setError(err.message || 'Failed to add entry');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/kb/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete entry');
      fetchEntries(pagination.page);
    } catch (err: any) {
      setError(err.message || 'Failed to delete entry');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <h2>Learned Answers</h2>
      
      {/* Add new entry form */}
      <form onSubmit={handleAddEntry} style={{ marginBottom: '1.5rem', background: '#f9f9f9', padding: '1rem', borderRadius: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input
            type="text"
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="New question"
            style={{ flex: 2, padding: 6 }}
            disabled={adding}
          />
          <input
            type="text"
            value={newAnswer}
            onChange={e => setNewAnswer(e.target.value)}
            placeholder="New answer"
            style={{ flex: 3, padding: 6 }}
            disabled={adding}
          />
          <button type="submit" disabled={adding || !newQuestion.trim() || !newAnswer.trim()} style={{ padding: '0.5rem 1rem' }}>
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>
      
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button 
          onClick={handleRefresh} 
          disabled={loading}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
        <div style={{ fontSize: '0.8rem', color: '#666' }}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </div>
      </div>
      
      {error && (
        <div style={{ color: 'red', padding: '0.5rem', backgroundColor: '#fff0f0', borderRadius: '4px', marginBottom: '1rem' }}>
          Error: {error}
        </div>
      )}
      
      {loading && <div>Loading learned answers...</div>}
      
      {!loading && entries.length === 0 && <div>No learned answers yet.</div>}
      
      {entries.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.5rem' }}>Question</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.5rem' }}>Answer</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.5rem' }}>Source</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.5rem' }}>Created At</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.5rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{entry.question}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{entry.answer}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                    <span style={{ 
                      backgroundColor: entry.source === 'supervisor' ? '#e3f2fd' : '#f1f8e9',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '4px',
                      fontSize: '0.85rem'
                    }}>
                      {entry.source}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      style={{ background: '#f44336', color: 'white', border: 'none', borderRadius: 4, padding: '0.3rem 0.8rem', cursor: 'pointer' }}
                    >
                      {deletingId === entry.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Pagination controls */}
          {pagination.pages > 1 && (
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
              <button 
                onClick={() => handlePageChange(1)} 
                disabled={pagination.page === 1}
                style={{ padding: '0.25rem 0.5rem' }}
              >
                &laquo; First
              </button>
              <button 
                onClick={() => handlePageChange(pagination.page - 1)} 
                disabled={pagination.page === 1}
                style={{ padding: '0.25rem 0.5rem' }}
              >
                &lt; Prev
              </button>
              
              <span>Page {pagination.page} of {pagination.pages}</span>
              
              <button 
                onClick={() => handlePageChange(pagination.page + 1)} 
                disabled={pagination.page === pagination.pages}
                style={{ padding: '0.25rem 0.5rem' }}
              >
                Next &gt;
              </button>
              <button 
                onClick={() => handlePageChange(pagination.pages)} 
                disabled={pagination.page === pagination.pages}
                style={{ padding: '0.25rem 0.5rem' }}
              >
                Last &raquo;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LearnedAnswers; 