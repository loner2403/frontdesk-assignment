import { createRoom, generateToken } from '../config/livekit';
import prisma from '../config/prisma';
import eventBus, { 
  EventType, 
  CallerMessageReceivedEvent,
  SupervisorResponseSentEvent,
  HelpRequestCreatedEvent,
  KnowledgeBaseUpdatedEvent 
} from '../eventBus';
import { createCallerIdWhereClause, createHelpRequestData } from '../db-update';
import { COMMANDS, MESSAGES, TIME } from '../utils/constants';

interface CallResponse {
  roomName: string;
  callerToken: string;
  agentToken: string;
}

// Cache to track which supervisor responses have been sent to which callers
// Format: { callerId: { responseId: timestamp } }
const supervisorResponseCache = new Map<string, Map<string, number>>();

// Cleanup old cache entries occasionally (older than 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [callerId, responses] of supervisorResponseCache.entries()) {
    for (const [responseId, timestamp] of responses.entries()) {
      if (now - timestamp > 30 * 60 * 1000) { // 30 minutes
        responses.delete(responseId);
      }
    }
    if (responses.size === 0) {
      supervisorResponseCache.delete(callerId);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Helper to detect polling/status-check questions (copied from client)
function isSpecialMessage(message: string): boolean {
  if (!message) return false;
  return (
    message === '__CHECK_SUPERVISOR_RESPONSES__' ||
    message === 'Has my supervisor replied with an answer yet?' ||
    message === 'What did my supervisor say?' ||
    message === "What was the supervisor's response?" ||
    message === 'Did the supervisor answer my question?' ||
    (message.toLowerCase().includes('supervisor') && (
      message.toLowerCase().includes('replied') ||
      message.toLowerCase().includes('responded') ||
      message.toLowerCase().includes('answer')
    ))
  );
}

export class AgentService {
  private knowledgeBase: Map<string, string>;

  constructor() {
    this.knowledgeBase = new Map();
    this.setupEventListeners();
    this.loadKnowledgeBase();
  }
  
  private setupEventListeners() {
    // Listen for supervisor responses
    eventBus.on<SupervisorResponseSentEvent>(
      EventType.SUPERVISOR_RESPONSE_SENT, 
      this.handleSupervisorResponse.bind(this)
    );
    
    // Listen for knowledge base updates
    eventBus.on<KnowledgeBaseUpdatedEvent>(
      EventType.KNOWLEDGE_BASE_UPDATED, 
      this.handleKnowledgeBaseUpdate.bind(this)
    );
    
    // Listen for help request creations for logging/monitoring
    eventBus.on<HelpRequestCreatedEvent>(
      EventType.HELP_REQUEST_CREATED, 
      this.handleHelpRequestCreated.bind(this)
    );
  }
  
  private async loadKnowledgeBase() {
    try {
      // Fetch all knowledge base entries from DB
      const entries = await prisma.knowledgeBaseEntry.findMany();
      // Load them into memory
      for (const entry of entries) {
        this.knowledgeBase.set(entry.question.toLowerCase(), entry.answer);
      }
      console.log(`[AgentService] Loaded ${entries.length} entries into knowledge base`);
    } catch (error) {
      console.error('[AgentService] Error loading knowledge base:', error);
    }
  }
  
  private handleSupervisorResponse(event: SupervisorResponseSentEvent) {
    const { helpRequestId, callerId, response } = event;
    console.log(`[Event] Supervisor responded to help request ${helpRequestId} for caller ${callerId}`);
    
    // Mark this response as sent
    this.markSupervisorResponseSent(callerId, helpRequestId);
  }
  
  private handleKnowledgeBaseUpdate(event: KnowledgeBaseUpdatedEvent) {
    const { question, answer } = event;
    console.log(`[Event] Knowledge base updated with question: "${question}"`);
    
    // Update in-memory knowledge base
    this.knowledgeBase.set(question.toLowerCase(), answer);
  }
  
  private handleHelpRequestCreated(event: HelpRequestCreatedEvent) {
    const { id, question, callerId } = event;
    console.log(`[Event] Help request created: ${id} for question "${question}" by caller ${callerId}`);
  }

  async handleCall(callerId: string): Promise<CallResponse> {
    const roomName = `call-${callerId}`;
    // Create LiveKit room
    const roomCreated = await createRoom(roomName);
    if (!roomCreated) {
      throw new Error('Failed to create room');
    }
    // Generate tokens for caller and agent
    const callerToken = generateToken(roomName, `caller-${callerId}`);
    const agentToken = generateToken(roomName, 'agent');
    
    // Initialize the response cache for this caller if it doesn't exist
    if (!supervisorResponseCache.has(callerId)) {
      supervisorResponseCache.set(callerId, new Map());
    }
    
    return {
      roomName,
      callerToken,
      agentToken,
    };
  }

  private async findSimilarQuestion(message: string): Promise<string | null> {
    const messageLower = message.toLowerCase();
    const keywords = messageLower.split(/\s+/).filter((word: string) => word.length > 3);
    // Fetch all knowledge base entries from DB
    const entries = await prisma.knowledgeBaseEntry.findMany();
    for (const entry of entries) {
      const entryQuestion = entry.question.toLowerCase();
      if (entryQuestion === messageLower) {
        return entry.answer;
      }
      const entryKeywords = entryQuestion.split(/\s+/).filter((word: string) => word.length > 3);
      const matchingKeywords = keywords.filter(keyword =>
        entryKeywords.some((entryKeyword: string) =>
          entryKeyword.includes(keyword) || keyword.includes(entryKeyword)
        )
      );
      if (matchingKeywords.length >= Math.ceil(keywords.length * 0.5)) {
        return entry.answer;
      }
    }
    return null;
  }

  // Add a method to check if a supervisor response has already been sent
  private hasSentSupervisorResponse(callerId: string, responseId: string): boolean {
    if (!supervisorResponseCache.has(callerId)) {
      return false;
    }
    return supervisorResponseCache.get(callerId)!.has(responseId);
  }

  // Add a method to mark a supervisor response as sent
  private markSupervisorResponseSent(callerId: string, responseId: string): void {
    if (!supervisorResponseCache.has(callerId)) {
      supervisorResponseCache.set(callerId, new Map());
    }
    supervisorResponseCache.get(callerId)!.set(responseId, Date.now());
  }

  /**
   * Helper function to properly format callerId as string
   */
  private formatCallerId(callerId: string): string {
    // Make sure callerId is a string
    return String(callerId).trim();
  }

  async handleMessage(roomName: string, message: string, callerId?: string): Promise<string> {
    // Emit event for caller message received
    if (callerId) {
      eventBus.emit<CallerMessageReceivedEvent>(EventType.CALLER_MESSAGE_RECEIVED, {
        roomName,
        callerId,
        message
      });
    }
    
    // Special case for direct supervisor response request
    if (message === COMMANDS.CHECK_SUPERVISOR_RESPONSES && callerId) {
      try {
        // Look for most recent supervisor response for this caller
        const helpRequest = await prisma.helpRequest.findFirst({
          where: {
            ...createCallerIdWhereClause(this.formatCallerId(callerId)),
            status: 'resolved',
            supervisorResponse: { not: null }
          },
          orderBy: { resolvedAt: 'desc' },
          select: {
            id: true,
            supervisorResponse: true,
            resolvedAt: true
          }
        });
        
        if (helpRequest && helpRequest.supervisorResponse) {
          const timeSinceResponse = Date.now() - (helpRequest.resolvedAt ? new Date(helpRequest.resolvedAt).getTime() : 0);
          // Only return supervisor responses from the last 10 minutes to avoid old responses
          if (timeSinceResponse < 10 * 60 * 1000) {
            // Check if we've already sent this response
            const responseId = helpRequest.id;
            if (this.hasSentSupervisorResponse(callerId, responseId)) {
              // We've already sent this response, just return a confirmation
              return "Yes, your supervisor has responded. The message has already been sent to you.";
            }
            
            // Mark this response as sent
            this.markSupervisorResponseSent(callerId, responseId);
            console.log(`Found supervisor response for ${callerId}: ${helpRequest.supervisorResponse}`);
            return `I've consulted with my supervisor and they say: ${helpRequest.supervisorResponse}`;
          }
        }
      } catch (error) {
        console.error('Error checking for supervisor responses:', error);
      }
      
      return MESSAGES.NO_SUPERVISOR_RESPONSE;
    }
    
    // Check for special supervisor response query
    if (callerId && (
        message.toLowerCase().includes("has my supervisor responded") || 
        message.toLowerCase().includes("what did my supervisor say") ||
        message.toLowerCase().includes("any response from supervisor")
    )) {
      try {
        // Look for most recent supervisor response for this caller
        const helpRequest = await prisma.helpRequest.findFirst({
          where: {
            ...createCallerIdWhereClause(this.formatCallerId(callerId)),
            status: 'resolved',
            supervisorResponse: { not: null }
          },
          orderBy: { resolvedAt: 'desc' },
          select: {
            id: true,
            supervisorResponse: true,
            resolvedAt: true
          }
        });
        
        if (helpRequest && helpRequest.supervisorResponse) {
          const timeSinceResponse = Date.now() - (helpRequest.resolvedAt ? new Date(helpRequest.resolvedAt).getTime() : 0);
          // Only return supervisor responses from the last 10 minutes
          if (timeSinceResponse < 10 * 60 * 1000) {
            // Check if we've already sent this response
            const responseId = helpRequest.id;
            if (this.hasSentSupervisorResponse(callerId, responseId)) {
              // Already sent, just mention it again without full details
              return "Yes, your supervisor has responded. I've already sent you their response.";
            }
            
            // Mark this response as sent
            this.markSupervisorResponseSent(callerId, responseId);
            console.log(`Found supervisor response for ${callerId}: ${helpRequest.supervisorResponse}`);
            return `I've consulted with my supervisor and they say: ${helpRequest.supervisorResponse}`;
          }
        }
        
        return "I haven't received any supervisor responses yet.";
      } catch (error) {
        console.error('Error checking for supervisor responses:', error);
      }
    }
    
    // First check if there's a pending help request that got resolved recently
    if (callerId) {
      try {
        const recentResponse = await prisma.helpRequest.findFirst({
          where: {
            ...createCallerIdWhereClause(this.formatCallerId(callerId)),
            status: 'resolved',
            supervisorResponse: { not: null },
            // Only look at help requests resolved in the last minute
            resolvedAt: { gte: new Date(Date.now() - 60 * 1000) }
          },
          orderBy: { resolvedAt: 'desc' },
          select: { id: true, supervisorResponse: true }
        });
        
        if (recentResponse && recentResponse.supervisorResponse) {
          // Check if we've already sent this response
          const responseId = recentResponse.id;
          if (!this.hasSentSupervisorResponse(callerId, responseId)) {
            // Mark this response as sent
            this.markSupervisorResponseSent(callerId, responseId);
            console.log(`Found supervisor response for ${callerId}: ${recentResponse.supervisorResponse}`);
            return `I've consulted with my supervisor and they say: ${recentResponse.supervisorResponse}`;
          }
        }
      } catch (error) {
        console.error('Error checking for recent supervisor responses:', error);
      }
    }
    
    // Now proceed with regular flow - check in-memory knowledge base
    const answer = this.knowledgeBase.get(message.toLowerCase());
    if (answer) {
      return answer;
    }
    
    // If not found in memory, check database knowledge base
    try {
      const dbAnswer = await this.findSimilarQuestion(message);
      if (dbAnswer) {
        this.knowledgeBase.set(message.toLowerCase(), dbAnswer);
        return dbAnswer;
      }
    } catch (error) {
      console.error('Error checking knowledge base:', error);
    }
    
    // Check if another help request for the same question is already pending
    if (callerId && !isSpecialMessage(message)) {
      try {
        const pendingRequest = await prisma.helpRequest.findFirst({
          where: {
            ...createCallerIdWhereClause(this.formatCallerId(callerId)),
            status: 'pending',
            question: message  // Exact match for now
          }
        });
        // If we already have a pending request for this exact question, don't create another
        if (pendingRequest) {
          return MESSAGES.WAITING_FOR_SUPERVISOR;
        }
      } catch (error) {
        console.error('Error checking for existing help requests:', error);
      }
      // Create a new help request
      try {
        await prisma.helpRequest.create({
          data: createHelpRequestData(message, this.formatCallerId(callerId))
        });
        console.log(`Hey, I need help answering: "${message}" (Caller ID: ${callerId})`);
        return MESSAGES.CHECKING_WITH_SUPERVISOR + "\"" + message + "\" and get back to you.";
      } catch (error) {
        console.error('Error creating help request:', error);
      }
    } else if (callerId && isSpecialMessage(message)) {
      // If it's a special message, do not create a help request, just return a generic response
      return MESSAGES.WAITING_FOR_SUPERVISOR;
    }
    
    // Fallback for when we can't create a help request
    return "I'm sorry, I don't know the answer to that. Please try asking something else.";
  }

  async addToKnowledgeBase(question: string, answer: string): Promise<void> {
    try {
      // Add to database
      const entry = await prisma.knowledgeBaseEntry.create({
        data: {
          question,
          answer,
          source: 'manual',
        },
      });
      
      // Add to in-memory store
      this.knowledgeBase.set(question.toLowerCase(), answer);
      
      // Emit knowledge base updated event
      eventBus.emit<KnowledgeBaseUpdatedEvent>(EventType.KNOWLEDGE_BASE_UPDATED, {
        id: entry.id,
        question,
        answer,
        source: 'manual'
      });
      
      console.log(`Added to knowledge base: ${question} -> ${answer}`);
    } catch (error) {
      console.error('Error adding to knowledge base:', error);
      throw error;
    }
  }
} 