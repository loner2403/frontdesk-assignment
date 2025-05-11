import { EventEmitter } from 'events';

/**
 * Event types used in the application
 */
export enum EventType {
  // Help request events
  HELP_REQUEST_CREATED = 'help_request_created',
  HELP_REQUEST_RESOLVED = 'help_request_resolved',
  HELP_REQUEST_EXPIRED = 'help_request_expired',
  
  // Knowledge base events
  KNOWLEDGE_BASE_UPDATED = 'knowledge_base_updated',
  
  // Communication events
  CALLER_MESSAGE_RECEIVED = 'caller_message_received',
  SUPERVISOR_RESPONSE_SENT = 'supervisor_response_sent',
  
  // Room events
  ROOM_CREATED = 'room_created',
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_LEFT = 'participant_left'
}

/**
 * Event payload types for type safety
 */
export interface HelpRequestCreatedEvent {
  id: string;
  question: string;
  callerId: string;
}

export interface HelpRequestResolvedEvent {
  id: string;
  question: string;
  callerId: string;
  answer: string;
}

export interface HelpRequestExpiredEvent {
  id: string;
  question: string;
  callerId: string;
}

export interface KnowledgeBaseUpdatedEvent {
  id: string;
  question: string;
  answer: string;
  source: string;
}

export interface CallerMessageReceivedEvent {
  roomName: string;
  callerId: string;
  message: string;
}

export interface SupervisorResponseSentEvent {
  helpRequestId: string;
  callerId: string;
  response: string;
  roomName: string;
}

export interface RoomEvent {
  roomName: string;
}

export interface ParticipantEvent extends RoomEvent {
  participantId: string;
  participantName?: string;
}

/**
 * Central event bus for the application
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    // Set higher limit for event listeners to avoid memory leak warnings
    this.setMaxListeners(50);
  }

  /**
   * Subscribe to an event
   * @param event The event to subscribe to
   * @param listener The callback function
   */
  on<T>(event: EventType, listener: (data: T) => void): this {
    return super.on(event, listener);
  }

  /**
   * Emit an event
   * @param event The event to emit
   * @param data The event data
   */
  emit<T>(event: EventType, data: T): boolean {
    console.log(`[EVENT] ${event}`, data);
    return super.emit(event, data);
  }
}

// Singleton instance
const eventBus = new EventBus();
export default eventBus; 