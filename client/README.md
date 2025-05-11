# Salon Help Request Client

This is a modern React application for handling help requests in a salon setting. It provides a user-friendly interface for clients to connect with an AI agent and escalate to a human supervisor when needed.

## Features

- Real-time communication via LiveKit
- Modern, responsive UI with styled-components
- Auto-scrolling message interface
- Loading states and error handling
- Connection status indicators

## Getting Started

### Prerequisites

- Node.js 14+ installed
- npm or yarn package manager

### Installation

1. Clone the repository
2. Navigate to the client directory
3. Install dependencies:

```bash
npm install
```

### Configuration

Create a `.env.local` file in the root of the client directory with these variables:

```
REACT_APP_API_URL=https://your-api-url/api
REACT_APP_LIVEKIT_WS_URL=wss://your-livekit-url
```

### Running the Application

```bash
npm start
```

This will start the development server on port 3001, accessible at [http://localhost:3001](http://localhost:3001).

## Technology Stack

- React 19
- TypeScript
- styled-components for styling
- LiveKit for real-time communication
- Axios for HTTP requests

## Project Structure

- `src/HelpRequest.tsx` - Main component for the help request interface
- `src/App.tsx` - Application container and routing
