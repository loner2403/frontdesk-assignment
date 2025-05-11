import { Room } from 'livekit-client';
import { EventEmitter } from 'events';


export enum EventType {
  CALLER_MESSAGE_RECEIVED = 'caller_message_received',
  SUPERVISOR_RESPONSE_SENT = 'supervisor_response_sent',
  ROOM_CONNECTED = 'room_connected',
  ROOM_DISCONNECTED = 'room_disconnected',
  ROOM_RECONNECTING = 'room_reconnecting',
  ROOM_RECONNECTED = 'room_reconnected'
}

// API Settings
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
const LIVEKIT_WS_URL = process.env.REACT_APP_LIVEKIT_WS_URL || 'ws://localhost:7880';

interface EventMessage {
  message: string;
  callerId: string;
  timestamp: string;
  messageId?: string;
}

type EventMap = {
  [EventType.CALLER_MESSAGE_RECEIVED]: EventMessage;
  [EventType.SUPERVISOR_RESPONSE_SENT]: EventMessage;
  [EventType.ROOM_CONNECTED]: void;
  [EventType.ROOM_DISCONNECTED]: { error?: string };
  [EventType.ROOM_RECONNECTING]: void;
  [EventType.ROOM_RECONNECTED]: void;
}

class EventService extends EventEmitter {
  private room: Room | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private processedMessages = new Set<string>();
  private messageExpiryTime = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    this.cleanupProcessedMessages();
  }

  private cleanupProcessedMessages() {
    setInterval(() => {
      const now = Date.now();
      Array.from(this.processedMessages).forEach(messageId => {
        const [, timestamp] = messageId.split('-');
        if (now - parseInt(timestamp) > this.messageExpiryTime) {
          this.processedMessages.delete(messageId);
        }
      });
    }, 60000); // Clean up every minute
  }

  private generateMessageId(message: string): string {
    return `${message.slice(0, 32)}-${Date.now()}`;
  }

  private async handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit(EventType.ROOM_DISCONNECTED, { error: 'Max reconnection attempts reached' });
      return;
    }

    if (!this.room) {
      this.emit(EventType.ROOM_DISCONNECTED, { error: 'Room not initialized' });
      return;
    }

    this.emit(EventType.ROOM_RECONNECTING, undefined);
    
    try {
      // Get token from API instead of generating locally
      const response = await fetch(`${API_URL}/agent/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: this.room.name,
          participantName: 'reconnect-client'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get token');
      }
      
      const data = await response.json();
      await this.room?.connect(LIVEKIT_WS_URL, data.token);
      this.reconnectAttempts = 0;
      this.emit(EventType.ROOM_RECONNECTED, undefined);
    } catch (error) {
      this.reconnectAttempts++;
      setTimeout(() => this.handleReconnect(), this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
    }
  }

  public setRoom(room: Room) {
    if (this.room) {
      this.room.disconnect();
    }

    this.room = room;
    this.reconnectAttempts = 0;

    room.on('disconnected', () => {
      this.emit(EventType.ROOM_DISCONNECTED, {});
    });

    room.on('connected', () => {
      this.emit(EventType.ROOM_CONNECTED, undefined);
    });

    room.on('dataReceived', (payload, participant) => {
      try {
        const data = new TextDecoder().decode(payload);
        const message: EventMessage = JSON.parse(data);
        
        // Generate or use existing message ID
        const messageId = message.messageId || this.generateMessageId(message.message);
        
        // Skip if we've already processed this message
        if (this.processedMessages.has(messageId)) {
          return;
        }
        
        // Mark message as processed
        this.processedMessages.add(messageId);
        
        // Emit the event with proper typing
        const eventType = message.message.includes('supervisor') ? 
          EventType.SUPERVISOR_RESPONSE_SENT : 
          EventType.CALLER_MESSAGE_RECEIVED;
        
        this.emit(eventType, {
          ...message,
          messageId
        });
      } catch (error) {
        console.error('Error processing received data:', error);
      }
    });
  }

  public override on<E extends keyof EventMap>(event: E, listener: (data: EventMap[E]) => void): this {
    return super.on(event, listener);
  }

  public override emit<E extends keyof EventMap>(event: E, data: EventMap[E]): boolean {
    return super.emit(event, data);
  }

  public async sendMessage(event: EventType, data: EventMessage): Promise<boolean> {
    if (!this.room) {
      throw new Error('Room not initialized');
    }

    try {
      // For outgoing messages, generate a message ID if not present
      if (!data.messageId) {
        data.messageId = this.generateMessageId(data.message);
      }

      // Skip if we've already processed this message
      if (this.processedMessages.has(data.messageId)) {
        return false;
      }

      // Mark message as processed
      this.processedMessages.add(data.messageId);

      // Send the message
      await this.room.localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify(data)),
        { reliable: true }
      );

      return this.emit(event, data);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  public disconnect() {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
    this.processedMessages.clear();
    this.removeAllListeners();
  }
}

export const eventService = new EventService();
export default eventService;
