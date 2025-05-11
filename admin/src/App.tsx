import React from 'react';
import { BrowserRouter as Router, Route, Routes, Link, Navigate } from 'react-router-dom';
import PendingRequests from './PendingRequests';
import History from './History';
import LearnedAnswers from './LearnedAnswers';
import RoomEvents from './RoomEvents';
import './App.css';

const App: React.FC = () => {
  return (
    <Router>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <nav className="admin-nav">
          <h1>Admin Panel</h1>
          <ul>
            <li><Link to="/pending">Pending Requests</Link></li>
            <li><Link to="/history">History</Link></li>
            <li><Link to="/learned">Learned Answers</Link></li>
            <li><Link to="/room-events">Room Events</Link></li>
          </ul>
        </nav>
        <main className="admin-main">
          <Routes>
            <Route path="/pending" element={<PendingRequests />} />
            <Route path="/history" element={<History />} />
            <Route path="/learned" element={<LearnedAnswers />} />
            <Route path="/room-events" element={<RoomEvents />} />
            <Route path="*" element={<Navigate to="/pending" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
