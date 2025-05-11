import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import agentRoutes from './routes/agent';
import supervisorRoutes from './routes/supervisor';
import { startTimeoutWorker } from './services/timeoutWorker';
import { AgentService } from './services/agentService';
import { publishDataToRoom } from './config/livekit';
import prisma from './config/prisma';
import eventBus, { 
  EventType, 
  RoomEvent, 
  ParticipantEvent, 
  CallerMessageReceivedEvent 
} from './eventBus';
import { checkAndProcessExpiredRequests } from './check-events';
import cron from 'node-cron';
import { createCallerIdWhereClause } from './db-update';
import { handleApiError, asyncHandler } from './utils/errorHandler';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.app.set('prisma', prisma);
  next();
});

// Routes
app.use('/api/agent', agentRoutes);
app.use('/api', supervisorRoutes);

const agentService = new AgentService();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Set up event listeners for LiveKit events
setupEventListeners();

// Define patterns for messages that should not be logged as events
const POLLING_PATTERNS = [
  '__CHECK_SUPERVISOR_RESPONSES__',
  'Has my supervisor replied with an answer yet?',
  'What did my supervisor say?',
  'What was the supervisor\'s response?',
  'Did the supervisor answer my question?'
];

// Function to check if a message is a polling/status check message
function isPollingMessage(message: string): boolean {
  if (!message) return false;
  
  // Check for exact matches with polling patterns
  if (POLLING_PATTERNS.some(pattern => message === pattern)) {
    return true;
  }
  
  // Check for common patterns in polling messages
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('supervisor') && (
      lowerMessage.includes('replied') ||
      lowerMessage.includes('responded') ||
      lowerMessage.includes('answer') ||
      lowerMessage.includes('response') ||
      lowerMessage.includes('say') ||
      lowerMessage.includes('said')
    )
  );
}

// LiveKit webhook endpoint
app.use('/livekit-webhook', express.json({ type: '*/*' }));
app.post('/livekit-webhook', async (req, res) => {
  const event = req.body;
  console.log('LiveKit webhook event:', event);

  // Save room creation events
  if (event.event === 'room_started' && event.room) {
    await prisma.roomEvent.create({
      data: {
        roomName: event.room.name,
        eventType: 'room_started',
        participantId: null,
        participantName: null,
      },
    });
    
    // Emit room created event
    eventBus.emit<RoomEvent>(EventType.ROOM_CREATED, {
      roomName: event.room.name
    });
  }

  // Save participant join/leave events
  if (event.event === 'participant_joined' && event.room && event.participant) {
    await prisma.roomEvent.create({
      data: {
        roomName: event.room.name,
        eventType: 'participant_joined',
        participantId: event.participant.identity,
        participantName: event.participant.name || null,
      },
    });
    
    // Emit participant joined event
    eventBus.emit<ParticipantEvent>(EventType.PARTICIPANT_JOINED, {
      roomName: event.room.name,
      participantId: event.participant.identity,
      participantName: event.participant.name || null
    });
  }
  if (event.event === 'participant_left' && event.room && event.participant) {
    await prisma.roomEvent.create({
      data: {
        roomName: event.room.name,
        eventType: 'participant_left',
        participantId: event.participant.identity,
        participantName: event.participant.name || null,
      },
    });
    
    // Emit participant left event
    eventBus.emit<ParticipantEvent>(EventType.PARTICIPANT_LEFT, {
      roomName: event.room.name,
      participantId: event.participant.identity,
      participantName: event.participant.name || null
    });
  }
  // Save data message events
  if (event.event === 'data_packet_received' && event.room && event.participant && event.data) {
    const roomName = event.room.name;
    const message = event.data;
    const callerId = event.participant.identity.replace('caller-', '');
    
    // Check if this is a polling/status check message
    const isPolling = isPollingMessage(message);
    
    // Only log actual messages, not polling/status check messages
    if (!isPolling) {
      await prisma.roomEvent.create({
        data: {
          roomName: event.room.name,
          eventType: 'data_packet_received',
          participantId: event.participant.identity,
          participantName: event.participant.name || null,
          data: event.data,
        },
      });
    } else {
      console.log(`[Filtered] Polling message from ${callerId} in ${roomName}: "${message}"`);
    }
    
    // Always emit the event regardless of whether it's a polling message
    // This ensures the agent still responds to the message
    eventBus.emit<CallerMessageReceivedEvent>(EventType.CALLER_MESSAGE_RECEIVED, {
      roomName,
      callerId,
      message
    });
    
    // Handle the message with the agent service
    const response = await agentService.handleMessage(roomName, message, callerId);
    
    // Send the response back to the room
    await publishDataToRoom(roomName, response);
  }

  res.sendStatus(200);
});

// Debug endpoint to simulate LiveKit webhooks
app.post('/api/debug/webhook', async (req, res) => {
  const { eventType, roomName, participantId, data } = req.body;
  
  console.log(`Debug webhook: ${eventType} in room ${roomName} from ${participantId}`);
  
  // Create a simulated event
  const event = {
    event: eventType,
    room: { name: roomName },
    participant: { identity: participantId },
    data
  };
  
  // Process it as if it were a real LiveKit webhook
  if (event.event === 'data_packet_received' && event.room && event.participant && event.data) {
    const message = event.data;
    const callerId = event.participant.identity.replace('caller-', '');
    
    // Check if this is a polling/status check message
    const isPolling = isPollingMessage(message);
    
    // Only log actual messages, not polling/status check messages
    if (!isPolling) {
      await prisma.roomEvent.create({
        data: {
          roomName: event.room.name,
          eventType: 'data_packet_received',
          participantId: event.participant.identity,
          participantName: null,
          data: event.data,
        },
      });
    } else {
      console.log(`[Filtered] Debug webhook: Polling message from ${callerId} in ${roomName}: "${message}"`);
    }
    
    // Always emit the event regardless of whether it's a polling message
    eventBus.emit<CallerMessageReceivedEvent>(EventType.CALLER_MESSAGE_RECEIVED, {
      roomName: event.room.name,
      callerId,
      message
    });
    
    // Handle the message with the agent service
    const response = await agentService.handleMessage(event.room.name, message, callerId);
    
    // Send the response back to the room
    await publishDataToRoom(event.room.name, response);
    console.log(`Debug webhook: sent response "${response}" to room ${roomName}`);
  }
  
  res.json({ success: true });
});

// Supervisor response webhook for clients to poll
app.get('/api/agent/webhook/supervisor-response/:callerId', asyncHandler(async (req, res) => {
  const { callerId } = req.params;
  
  if (!callerId) {
    return res.status(400).json({ error: 'callerId is required' });
  }
  
  // Find the most recent resolved help request for this caller
  const helpRequest = await prisma.helpRequest.findFirst({
    where: {
      ...createCallerIdWhereClause(callerId),
      status: 'resolved',
      supervisorResponse: { not: null },
      // Only include responses from the last 5 minutes
      resolvedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }
    },
    orderBy: { resolvedAt: 'desc' },
    select: {
      id: true,
      question: true,
      supervisorResponse: true,
      resolvedAt: true
    }
  });
  
  if (helpRequest && helpRequest.supervisorResponse) {
    // Found a recent supervisor response
    return res.json({
      supervisorResponse: helpRequest.supervisorResponse,
      question: helpRequest.question,
      resolvedAt: helpRequest.resolvedAt,
      foundResponse: true
    });
  }
  
  // No recent supervisor responses
  return res.json({
    foundResponse: false,
    message: 'No recent supervisor responses found'
  });
}));

// Set up cron job to check for expired help requests
const cronSchedule = '*/5 * * * *'; // Run every 5 minutes
cron.schedule(cronSchedule, async () => {
  console.log('[Cron] Running help request timeout check at', new Date().toISOString());
  await checkAndProcessExpiredRequests();
});

// Setup event listeners
function setupEventListeners() {
  // Listen for room creation events
  eventBus.on<RoomEvent>(EventType.ROOM_CREATED, (event) => {
    console.log(`[Event] Room created: ${event.roomName}`);
  });
  
  // Listen for participant joined events
  eventBus.on<ParticipantEvent>(EventType.PARTICIPANT_JOINED, (event) => {
    console.log(`[Event] Participant joined: ${event.participantId} in ${event.roomName}`);
  });
  
  // Listen for participant left events
  eventBus.on<ParticipantEvent>(EventType.PARTICIPANT_LEFT, (event) => {
    console.log(`[Event] Participant left: ${event.participantId} from ${event.roomName}`);
  });
  
  // Listen for caller messages
  eventBus.on<CallerMessageReceivedEvent>(EventType.CALLER_MESSAGE_RECEIVED, (event) => {
    console.log(`[Event] Caller message: ${event.callerId} in ${event.roomName}: "${event.message}"`);
  });
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`LiveKit rooms will auto-close after 5 minutes of inactivity (emptyTimeout)`);
  console.log(`Help requests will time out after 30 minutes if not answered by a supervisor`);
  startTimeoutWorker();
}); 