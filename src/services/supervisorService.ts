import { helpRequestModel } from '../models/helpRequest';
import prisma from '../config/prisma';
import { HelpRequestStatus } from '@prisma/client';
import { publishDataToRoom } from '../config/livekit';
import eventBus, { 
  EventType, 
  SupervisorResponseSentEvent, 
  HelpRequestResolvedEvent 
} from '../eventBus';

// Track which supervisor responses have been sent
const sentSupervisorResponses = new Set<string>();

export class SupervisorService {
  constructor() {
    // Listen for help request resolved events to send notifications
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for help request resolved events
    eventBus.on<HelpRequestResolvedEvent>(
      EventType.HELP_REQUEST_RESOLVED, 
      this.handleHelpRequestResolved.bind(this)
    );
  }

  private async handleHelpRequestResolved(event: HelpRequestResolvedEvent) {
    const { id, callerId, answer } = event;
    
    // If we already sent this response, don't send it again
    if (sentSupervisorResponses.has(id)) {
      console.log(`[Event] Help request ${id} response already sent. Skipping notification.`);
      return;
    }
    
    // If we have a caller ID, send the notification directly to the room
    if (callerId && callerId !== 'unknown') {
      const roomName = `call-${callerId}`;
      try {
        const supervisorResponse = `I've consulted with my supervisor and they say: ${answer}`;
        
        // Mark this as sent to avoid duplicate processing
        sentSupervisorResponses.add(id);
        
        const sent = await publishDataToRoom(roomName, supervisorResponse);
        if (sent) {
          console.log(`[Event] Supervisor response sent to room ${roomName}: "${answer}"`);
          
          // Emit event for supervisor response sent
          eventBus.emit<SupervisorResponseSentEvent>(EventType.SUPERVISOR_RESPONSE_SENT, {
            helpRequestId: id,
            callerId,
            response: answer,
            roomName
          });
        } else {
          console.warn(`[Event] Failed to send supervisor response to room ${roomName}`);
        }
      } catch (error) {
        console.error(`[Event] Failed to send supervisor response to room for ${callerId}:`, error);
      }
    }
  }

  async getHelpRequests(status?: HelpRequestStatus, page: number = 1, limit: number = 10): Promise<{ data: any[], total: number }> {
    return helpRequestModel.getAll(status, page, limit);
  }

  async resolveHelpRequest(id: string, answer: string): Promise<any> {
    // Check if we've already resolved this request (avoid duplicate processing)
    if (sentSupervisorResponses.has(id)) {
      console.log(`Help request ${id} has already been resolved and notification sent. Skipping...`);
      return { alreadyProcessed: true };
    }
    
    const request = await helpRequestModel.getById(id);
    if (!request) {
      throw new Error('Request not found');
    }

    // Check if this request has already been resolved
    if (request.status === 'resolved') {
      console.log(`Help request ${id} is already in resolved state. Avoiding duplicate processing.`);
      sentSupervisorResponses.add(id);
      return { alreadyResolved: true };
    }

    // Update help request status and supervisor response
    const updated = await helpRequestModel.update(id, {
      status: 'resolved',
      resolvedAt: new Date(),
      supervisorResponse: answer,
    });

    if (!updated) {
      throw new Error('Failed to update request');
    }

    // Add to knowledge base and link to help request
    const kbEntry = await prisma.knowledgeBaseEntry.create({
      data: {
        question: request.question,
        answer: answer,
        source: 'supervisor',
        helpRequest: { connect: { id } },
      },
    });

    // Link the knowledge base entry to the help request
    await helpRequestModel.update(id, { knowledgeBaseEntryId: kbEntry.id });

    // Note: The notification is now handled by the event listener
    // responding to the HELP_REQUEST_RESOLVED event emitted by helpRequestModel.update
    
    return {
      ...updated,
      knowledgeBaseUpdated: true
    };
  }

  async getKnowledgeBase(page: number = 1, limit: number = 10): Promise<{ data: any[], total: number }> {
    const skip = (page - 1) * limit;
    
    // Get the total count for pagination
    const total = await prisma.knowledgeBaseEntry.count();
    
    // Get the paginated data
    const data = await prisma.knowledgeBaseEntry.findMany({ 
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
    
    return { data, total };
  }

  async createHelpRequest(question: string, callerId: string): Promise<any> {
    console.log(`Hey, I need help answering: "${question}" (Caller ID: ${callerId})`);
    return helpRequestModel.create({ question, callerId: String(callerId).trim() });
  }
} 