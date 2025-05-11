import { PrismaClient, HelpRequestStatus, Prisma } from '@prisma/client';
import eventBus, { 
  EventType, 
  HelpRequestCreatedEvent,
  HelpRequestResolvedEvent,
  HelpRequestExpiredEvent
} from '../eventBus';
import { createHelpRequestData, getCallerId } from '../db-update';

const prisma = new PrismaClient();
export default prisma;

export interface HelpRequest {
  id: string;
  question: string;
  callerId: string;
  status: 'pending' | 'resolved' | 'unresolved';
  createdAt: string;
  resolvedAt?: string;
  supervisorResponse?: string;
}

export const helpRequestModel = {
  create: async (data: { question: string; callerId: string }): Promise<any> => {
    // Create help request with both old and new schema fields
    const newRequest = await prisma.helpRequest.create({
      data: createHelpRequestData(data.question, data.callerId)
    });
    
    // Emit event for help request creation
    eventBus.emit<HelpRequestCreatedEvent>(EventType.HELP_REQUEST_CREATED, {
      id: newRequest.id,
      question: data.question,
      callerId: data.callerId
    });
    
    return newRequest;
  },

  getAll: async (status?: HelpRequestStatus, page: number = 1, limit: number = 10): Promise<{ data: any[], total: number }> => {
    const skip = (page - 1) * limit;
    
    // Get the total count for pagination
    const total = await prisma.helpRequest.count({
      where: status ? { status } : undefined,
    });
    
    // Get the paginated data
    const data = await prisma.helpRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
    
    return { data, total };
  },

  getById: async (id: string): Promise<any | null> => {
    return prisma.helpRequest.findUnique({ where: { id } });
  },

  update: async (id: string, data: Partial<any>): Promise<any | null> => {
    const updatedRequest = await prisma.helpRequest.update({
      where: { id },
      data,
    });
    
    // Emit events based on the update type
    if (data.status === 'resolved' && data.supervisorResponse) {
      const callerId = getCallerId(updatedRequest);
      
      eventBus.emit<HelpRequestResolvedEvent>(EventType.HELP_REQUEST_RESOLVED, {
        id: updatedRequest.id,
        question: updatedRequest.question,
        callerId,
        answer: data.supervisorResponse
      });
    } 
    else if (data.status === 'unresolved') {
      const callerId = getCallerId(updatedRequest);
      
      eventBus.emit<HelpRequestExpiredEvent>(EventType.HELP_REQUEST_EXPIRED, {
        id: updatedRequest.id,
        question: updatedRequest.question,
        callerId
      });
    }
    
    return updatedRequest;
  },
  
  markAsExpired: async (id: string): Promise<any | null> => {
    const request = await prisma.helpRequest.findUnique({ where: { id } });
    
    if (!request || request.status !== 'pending') {
      return null;
    }
    
    const updatedRequest = await prisma.helpRequest.update({
      where: { id },
      data: {
        status: 'unresolved',
        resolvedAt: new Date(),
      },
    });
    
    const callerId = getCallerId(updatedRequest);
    
    // Emit expired event
    eventBus.emit<HelpRequestExpiredEvent>(EventType.HELP_REQUEST_EXPIRED, {
      id: updatedRequest.id,
      question: updatedRequest.question,
      callerId
    });
    
    return updatedRequest;
  }
};  