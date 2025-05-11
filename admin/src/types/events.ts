
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
  PARTICIPANT_LEFT = 'participant_left',

  // UI Events
  UI_HELP_REQUEST_SELECTED = 'ui_help_request_selected',
  UI_KNOWLEDGE_BASE_FILTER = 'ui_knowledge_base_filter',
  UI_REFRESH_REQUESTS = 'ui_refresh_requests',
  UI_NOTIFICATION = 'ui_notification'
}

export interface HelpRequestEvent {
  id: string;
  question: string;
  callerId: string;
  status: 'pending' | 'resolved' | 'unresolved';
  createdAt: string;
  resolvedAt?: string;
  supervisorResponse?: string;
}

export interface KnowledgeBaseEvent {
  id: string;
  question: string;
  answer: string;
  source: string;
}

export interface MessageEvent {
  roomName: string;
  message: string;
  sender: string;
  timestamp: string;
}

export interface RoomEvent {
  roomName: string;
}

export interface ParticipantEvent extends RoomEvent {
  participantId: string;
  participantName?: string;
}

export interface UINotificationEvent {
  type: 'success' | 'error' | 'info';
  message: string;
} 