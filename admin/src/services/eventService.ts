import { Room, RoomEvent} from 'livekit-client';
import { EventEmitter } from 'events';
import { EventType } from '../types/events';

const LIVEKIT_URL = process.env.REACT_APP_LIVEKIT_WS_URL || 'wss://call-gpt-0o9byumd.livekit.cloud';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

class EventService extends EventEmitter {
  private static instance: EventService;
  private room: Room | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private currentToken: string | null = null;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  public static getInstance(): EventService {
    if (!EventService.instance) {
      EventService.instance = new EventService();
    }
    return EventService.instance;
  }

  public async connect(token: string): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;
    this.currentToken = token;

    try {
      const room = new Room();
      
      // Set up room event listeners
      room.on(RoomEvent.Connected, () => {
        this.reconnectAttempts = 0;
        this.emit(EventType.ROOM_CREATED, { roomName: room.name });
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        this.emit(EventType.PARTICIPANT_JOINED, {
          participantName: participant.identity,
          roomName: room.name
        });
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        this.emit(EventType.PARTICIPANT_LEFT, {
          participantName: participant.identity,
          roomName: room.name
        });
      });

      room.on(RoomEvent.Disconnected, () => {
        this.handleDisconnection();
      });

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        const message = new TextDecoder().decode(payload);
        const sender = participant?.identity || 'unknown';
        
        try {
          const data = JSON.parse(message);
          if (data.event === EventType.HELP_REQUEST_CREATED) {
            this.emit(EventType.HELP_REQUEST_CREATED, data.data);
          } else if (data.event === EventType.HELP_REQUEST_RESOLVED) {
            this.emit(EventType.HELP_REQUEST_RESOLVED, data.data);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      // Connect to the room
      await room.connect(LIVEKIT_URL, token);
      this.room = room;
      this.isConnecting = false;
    } catch (error) {
      console.error('Failed to connect to room:', error);
      this.isConnecting = false;
      this.handleDisconnection();
      throw error;
    }
  }

  private handleDisconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      
      this.reconnectTimer = setTimeout(() => {
        if (this.currentToken) {
          this.connect(this.currentToken);
        }
      }, delay);
    }
  }

  public override emit(event: EventType | string, data: any): boolean {
    if (this.room && event in EventType) {
      // Send the data through LiveKit
      const message = JSON.stringify({ event, data });
      this.room.localParticipant.publishData(
        new TextEncoder().encode(message),
        { reliable: true }
      );
    }
    // Always emit locally
    return super.emit(event, data);
  }

  public async getHelpRequests() {
    try {
      const response = await fetch(`${API_URL}/supervisor/help-requests?status=pending`);
      if (!response.ok) {
        throw new Error('Failed to fetch help requests');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching help requests:', error);
      throw error;
    }
  }

  public async sendMessage(helpRequestId: string, message: string) {
    try {
      const response = await fetch(`${API_URL}/supervisor/help-requests/${helpRequestId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: message })
      });
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      return await response.json();
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  public async closeHelpRequest(helpRequestId: string) {
    try {
      const response = await fetch(`${API_URL}/supervisor/help-requests/${helpRequestId}/close`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to close help request');
      }
      return await response.json();
    } catch (error) {
      console.error('Error closing help request:', error);
      throw error;
    }
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
    this.currentToken = null;
  }
}

export default EventService.getInstance(); 