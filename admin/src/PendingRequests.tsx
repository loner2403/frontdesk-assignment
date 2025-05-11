import React, { useEffect, useState } from 'react';

export type HelpRequest = {
  id: string;
  question: string;
  caller_id?: string;
  status: 'pending' | 'resolved' | 'unresolved';
  created_at: string;
  resolved_at?: string;
  supervisor_response?: string;
};

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const PendingRequests: React.FC = () => {
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({ total: 0, page: 1, limit: 10, pages: 0 });

  const fetchRequests = (page: number = 1) => {
    setLoading(true);
    fetch(`${API_URL}/help-requests?status=pending&page=${page}&limit=${pagination.limit}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(response => {
        setRequests(response.data);
        setPagination(response.pagination);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRequests();
    
    // Set up polling to refresh pending requests
    const intervalId = setInterval(() => fetchRequests(pagination.page), 10000);
    
    // Clean up on unmount
    return () => clearInterval(intervalId);
  }, []);

  const handleReply = (id: string) => {
    setReplyingId(id);
    setReply('');
    setSuccessMessage(null);
  };

  const handleSubmit = async (id: string) => {
    setSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/help-requests/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: reply }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to submit answer');
      }
      
      const data = await res.json();
      setReplyingId(null);
      setReply('');
      
      // Show success message
      setSuccessMessage(`Successfully answered request. The system will automatically notify the caller.`);
      
      // After successful submission, refresh the list
      fetchRequests(pagination.page);
      
      // Clear success message after a few seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
    } catch (err: any) {
      setError(err.message || 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const refreshRequests = () => {
    setSuccessMessage(null);
    setError(null);
    fetchRequests(pagination.page);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.pages) return;
    fetchRequests(newPage);
  };

  return (
    <div>
      <h2>Pending Help Requests</h2>
      
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button 
          onClick={refreshRequests} 
          disabled={loading}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
        
        {successMessage && (
          <div style={{ color: 'green', padding: '0.5rem', backgroundColor: '#f0fff0', borderRadius: '4px' }}>
            {successMessage}
          </div>
        )}
      </div>
      
      {error && (
        <div style={{ color: 'red', padding: '0.5rem', backgroundColor: '#fff0f0', borderRadius: '4px', marginBottom: '1rem' }}>
          Error: {error}
        </div>
      )}
      
      {loading && <div>Loading pending requests...</div>}
      
      {!loading && requests.length === 0 && <div>No pending requests at this time.</div>}
      
      {requests.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Question</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Caller Info</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Created At</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id}>
                  <td>{req.question}</td>
                  <td>{req.caller_id || '-'}</td>
                  <td>{req.created_at ? new Date(req.created_at).toLocaleString() : '-'}</td>
                  <td>
                    {replyingId === req.id ? (
                      <div>
                        <textarea
                          value={reply}
                          onChange={e => setReply(e.target.value)}
                          rows={2}
                          style={{ width: '100%' }}
                          placeholder="Type your answer..."
                          disabled={submitting}
                        />
                        <button 
                          onClick={() => handleSubmit(req.id)} 
                          disabled={submitting || !reply.trim()}
                          style={{ 
                            backgroundColor: '#4caf50', 
                            color: 'white', 
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '4px',
                            cursor: submitting || !reply.trim() ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {submitting ? 'Submitting...' : 'Submit'}
                        </button>
                        <button 
                          onClick={() => setReplyingId(null)} 
                          disabled={submitting} 
                          style={{ 
                            marginLeft: 8,
                            backgroundColor: '#f44336',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '4px',
                            cursor: submitting ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleReply(req.id)}
                        style={{ 
                          backgroundColor: '#2196f3',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Reply
                      </button>
                    )}
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

export default PendingRequests; 