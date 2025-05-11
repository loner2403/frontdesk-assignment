/**
 * Application-wide constants
 */

// Time intervals (in milliseconds)
export const TIME = {
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  TEN_MINUTES: 10 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000
};

// Cache settings
export const CACHE = {
  SUPERVISOR_RESPONSE_TTL: TIME.FIVE_MINUTES,
  KNOWLEDGE_BASE_TTL: TIME.ONE_HOUR
};

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100
};

// Room settings
export const ROOM = {
  PREFIX: 'call-',
  ADMIN_ROOM: 'admin-room'
};

// Status values
export const STATUS = {
  PENDING: 'pending',
  RESOLVED: 'resolved',
  UNRESOLVED: 'unresolved'
};

// Message templates
export const MESSAGES = {
  SUPERVISOR_RESPONSE: "I've consulted with my supervisor and they say: ",
  CHECKING_WITH_SUPERVISOR: "Let me check with my supervisor about ",
  WAITING_FOR_SUPERVISOR: "I'm still waiting for my supervisor to answer your question. I'll let you know as soon as I hear back.",
  NO_SUPERVISOR_RESPONSE: "I haven't received any supervisor responses yet."
};

// Special commands
export const COMMANDS = {
  CHECK_SUPERVISOR_RESPONSES: '__CHECK_SUPERVISOR_RESPONSES__'
};

// Cron schedules
export const CRON = {
  EXPIRED_REQUESTS: '*/5 * * * *' // Every 5 minutes
}; 