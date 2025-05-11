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

const API_URL = 'http://localhost:3000/api/help-requests';

const History: React.FC = () => {
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'resolved' | 'unresolved'>('resolved');
  const [pagination, setPagination] = useState<PaginationInfo>({ total: 0, page: 1, limit: 10, pages: 0 });

  const fetchRequests = (page: number = 1) => {
    setLoading(true);
    fetch(`${API_URL}?status=${status}&page=${page}&limit=${pagination.limit}`)
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
    // eslint-disable-next-line
  }, [status]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.pages) return;
    fetchRequests(newPage);
  };

  return (
    <div>
      <h2>Request History</h2>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setStatus('resolved')} disabled={status === 'resolved'}>Resolved</button>
        <button onClick={() => setStatus('unresolved')} disabled={status === 'unresolved'} style={{ marginLeft: 8 }}>Unresolved</button>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      {!loading && !error && requests.length === 0 && <div>No {status} requests.</div>}
      {!loading && !error && requests.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Question</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Caller Info</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Supervisor Response</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Created At</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Resolved At</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id}>
                  <td>{req.question}</td>
                  <td>{req.caller_id || '-'}</td>
                  <td>{req.supervisor_response || '-'}</td>
                  <td>{req.created_at ? new Date(req.created_at).toLocaleString() : '-'}</td>
                  <td>{req.resolved_at ? new Date(req.resolved_at).toLocaleString() : '-'}</td>
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

export default History; 