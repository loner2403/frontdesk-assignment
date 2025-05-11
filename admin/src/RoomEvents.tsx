import React, { useEffect, useState } from 'react';

export type RoomEvent = {
  id: string;
  roomName: string;
  eventType: string;
  participantId?: string;
  participantName?: string;
  data?: string;
  createdAt: string;
};

const API_URL = 'http://localhost:3000/api/room-events';

const PAGE_SIZE = 10;

const RoomEvents: React.FC = () => {
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchEvents = (pageNum: number) => {
    setLoading(true);
    fetch(`${API_URL}?page=${pageNum}&limit=${PAGE_SIZE}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        setEvents(data.data);
        setTotalPages(data.pagination.pages);
        setTotal(data.pagination.total);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEvents(page);
    // eslint-disable-next-line
  }, [page]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
  };

  if (loading) return <div>Loading room events...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (events.length === 0) return <div>No room events found.</div>;

  return (
    <div>
      <h2>Room Events</h2>
      <div style={{ marginBottom: '1rem' }}>
        Showing {events.length} of {total} events
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Room</th>
            <th>Event</th>
            <th>Participant</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {events.map(ev => (
            <tr key={ev.id}>
              <td>{new Date(ev.createdAt).toLocaleString()}</td>
              <td>{ev.roomName}</td>
              <td>{ev.eventType}</td>
              <td>{ev.participantName || ev.participantId || '-'}</td>
              <td>{ev.data || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Pagination controls */}
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={() => handlePageChange(1)} disabled={page === 1} style={{ padding: '0.25rem 0.5rem' }}>&laquo; First</button>
        <button onClick={() => handlePageChange(page - 1)} disabled={page === 1} style={{ padding: '0.25rem 0.5rem' }}>&lt; Prev</button>
        <span>Page {page} of {totalPages}</span>
        <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} style={{ padding: '0.25rem 0.5rem' }}>Next &gt;</button>
        <button onClick={() => handlePageChange(totalPages)} disabled={page === totalPages} style={{ padding: '0.25rem 0.5rem' }}>Last &raquo;</button>
      </div>
    </div>
  );
};

export default RoomEvents; 