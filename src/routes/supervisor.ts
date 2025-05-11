import { Router, Request, Response } from 'express';
import { SupervisorService } from '../services/supervisorService';
import { HelpRequestStatus } from '@prisma/client';
import { publishDataToRoom } from '../config/livekit';
import prisma from '../config/prisma';
import { createCallerIdWhereClause, getCallerId } from '../db-update';
import { 
  handleApiError, 
  asyncHandler, 
  validatePagination, 
  createPaginationResponse,
  validateRequiredParams 
} from '../utils/errorHandler';
import { CACHE, MESSAGES, ROOM } from '../utils/constants';

const router = Router();
const supervisorService = new SupervisorService();

// In-memory cache for recent supervisor responses
const responseCache = new Map<string, { response: string, timestamp: number }>();
const CACHE_TTL = CACHE.SUPERVISOR_RESPONSE_TTL;

// Cleanup old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      responseCache.delete(key);
    }
  }
}, CACHE_TTL);

// Get help requests by status
router.get('/help-requests', asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;

  // Validate status against HelpRequestStatus enum
  const validStatus = (status && Object.values(HelpRequestStatus).includes(status as HelpRequestStatus)) 
    ? (status as HelpRequestStatus) 
    : undefined;
  
  // Validate pagination parameters
  const pagination = validatePagination(req, res);
  if (!pagination) return;
  
  const { page, limit } = pagination;

  const { data: requests, total } = await supervisorService.getHelpRequests(validStatus, page, limit);
  
  // Normalize response
  const normalized = requests.map((r: any) => ({
    id: r.id,
    question: r.question,
    caller_id: r.callerId || '',
    status: r.status,
    created_at: r.createdAt,
    resolved_at: r.resolvedAt,
    supervisor_response: r.supervisorResponse,
  }));
  
  res.json({
    data: normalized,
    pagination: createPaginationResponse(total, page, limit)
  });
}));

// Resolve a help request
router.post('/help-requests/:id/resolve', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  if (!validateRequiredParams(req, res, ['answer'])) return;
  const { answer } = req.body;
  
  // First, check if this help request has already been resolved
  const existingRequest = await prisma.helpRequest.findUnique({
    where: { id }
  });
  
  if (existingRequest && existingRequest.status === 'resolved') {
    return res.status(400).json({ 
      error: 'This help request has already been resolved',
      alreadyResolved: true 
    });
  }
  
  const result = await supervisorService.resolveHelpRequest(id, answer);
  
  if (existingRequest) {
    const callerId = getCallerId(existingRequest);
    
    if (callerId && callerId !== 'unknown') {
      const roomName = `${ROOM.PREFIX}${callerId}`;
      const supervisorResponse = `${MESSAGES.SUPERVISOR_RESPONSE}${answer}`;
      
      // Cache the response
      responseCache.set(callerId, {
        response: answer,
        timestamp: Date.now()
      });
      
      try {
        const sent = await publishDataToRoom(roomName, supervisorResponse);
        
        if (sent) {
          console.log(`Supervisor response "${answer}" sent to room ${roomName}`);
          return res.json({
            ...result,
            notification_sent: true,
            room_name: roomName
          });
        } else {
          console.error(`Failed to send message to room ${roomName}`);
          return res.json({
            ...result,
            notification_sent: false,
            error: 'Failed to notify client, but answer saved'
          });
        }
      } catch (error) {
        return handleApiError(
          res, 
          error, 
          `Failed to send message to room ${roomName}`, 
          200 // Still return 200 as the answer was saved
        );
      }
    }
  }
  
  return res.json(result);
}));

// Get supervisor response
router.post('/supervisor-response', asyncHandler(async (req: Request, res: Response) => {
  if (!validateRequiredParams(req, res, ['roomName', 'callerId'])) return;
  const { roomName, callerId } = req.body;

  // Check cache first
  const cachedResponse = responseCache.get(callerId);
  if (cachedResponse && Date.now() - cachedResponse.timestamp <= CACHE_TTL) {
    return res.json({ 
      supervisorResponse: cachedResponse.response,
      fromCache: true
    });
  }

  // Extract the actual caller ID from the room name if needed
  const actualCallerId = callerId.startsWith('caller-') ? callerId.replace('caller-', '') : callerId;
  
  // Find the most recent resolved help request for this caller
  const helpRequest = await prisma.helpRequest.findFirst({
    where: {
      ...createCallerIdWhereClause(actualCallerId),
      status: 'resolved',
      supervisorResponse: { not: null }
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
    // Cache the response
    responseCache.set(callerId, {
      response: helpRequest.supervisorResponse,
      timestamp: Date.now()
    });
    
    console.log(`Found supervisor response for ${actualCallerId}: ${helpRequest.supervisorResponse}`);
    res.json({ 
      supervisorResponse: helpRequest.supervisorResponse,
      question: helpRequest.question,
      resolvedAt: helpRequest.resolvedAt
    });
  } else {
    res.json({ message: 'No supervisor response found' });
  }
}));

// Get knowledge base entries
router.get('/knowledge-base', asyncHandler(async (req: Request, res: Response) => {
  // Validate pagination parameters
  const pagination = validatePagination(req, res);
  if (!pagination) return;
  
  const { page, limit } = pagination;
  
  const { data: entries, total } = await supervisorService.getKnowledgeBase(page, limit);
  
  // Normalize response
  const normalized = entries.map((e: any) => ({
    id: e.id,
    question: e.question,
    answer: e.answer,
    created_at: e.createdAt, // Add created_at field for client compatibility
    updated_at: e.createdAt, // Keep updated_at for backward compatibility
    source: e.source,
  }));
  
  res.json({
    data: normalized,
    pagination: createPaginationResponse(total, page, limit)
  });
}));

// GET /api/kb - Get all knowledge base entries
router.get('/kb', asyncHandler(async (req: Request, res: Response) => {
  // Validate pagination parameters
  const pagination = validatePagination(req, res);
  if (!pagination) return;
  
  const { page, limit } = pagination;
  
  const { data: entries, total } = await supervisorService.getKnowledgeBase(page, limit);
  
  // Normalize response
  const normalized = entries.map((e: any) => ({
    id: e.id,
    question: e.question,
    answer: e.answer,
    created_at: e.createdAt, // Add created_at field for client compatibility
    updated_at: e.createdAt, // Keep updated_at for backward compatibility
    source: e.source,
  }));
  
  res.json({
    data: normalized,
    pagination: createPaginationResponse(total, page, limit)
  });
}));

// POST /api/kb - Add a new knowledge base entry
router.post('/kb', asyncHandler(async (req: Request, res: Response) => {
  if (!validateRequiredParams(req, res, ['question', 'answer'])) return;
  
  const { question, answer } = req.body;
  const entry = await req.app.get('prisma').knowledgeBaseEntry.create({
    data: {
      question,
      answer,
      source: 'supervisor',
    },
  });
  
  res.json({
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    created_at: entry.createdAt, // Add created_at field for client compatibility
    updated_at: entry.createdAt,
    source: entry.source,
  });
}));

// DELETE /api/kb/:id - Delete a knowledge base entry
router.delete('/kb/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    await req.app.get('prisma').knowledgeBaseEntry.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Entry not found' });
  }
}));

// Get all room events with pagination
router.get('/room-events', asyncHandler(async (req, res) => {
  // Parse pagination params
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Get total count
  const total = await req.app.get('prisma').roomEvent.count();
  const pages = Math.ceil(total / limit);

  // Get paginated events
  const events = await req.app.get('prisma').roomEvent.findMany({
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });

  res.json({
    data: events,
    pagination: {
      total,
      page,
      limit,
      pages
    }
  });
}));

export default router; 