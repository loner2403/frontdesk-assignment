import { Router, Request, Response } from 'express';
import { AgentService } from '../services/agentService';
import { SupervisorService } from '../services/supervisorService';
import prisma from '../config/prisma';
import { generateToken } from '../config/livekit';
import { createCallerIdWhereClause } from '../db-update';
import { 
  handleApiError, 
  asyncHandler, 
  validateRequiredParams 
} from '../utils/errorHandler';

const router = Router();
const agentService = new AgentService();
const supervisorService = new SupervisorService();

// Generate token for client
router.post('/client/token', asyncHandler(async (req: Request, res: Response) => {
  if (!validateRequiredParams(req, res, ['callerId'])) return;
  const { callerId } = req.body;

  const roomName = `call-${callerId}`;
  const token = generateToken(roomName, callerId);
  
  res.json({ token });
}));

// Generate token for any participant (used for reconnection)
router.post('/token', asyncHandler(async (req: Request, res: Response) => {
  if (!validateRequiredParams(req, res, ['roomName', 'participantName'])) return;
  const { roomName, participantName } = req.body;

  const token = generateToken(roomName, participantName);
  res.json({ token });
}));

// Generate token for admin
router.get('/admin/token', asyncHandler(async (req: Request, res: Response) => {
  const adminId = `admin-${Date.now()}`;
  const token = generateToken('admin-room', adminId);
  
  res.json({ token });
}));

// Initialize a new call
router.post('/call', asyncHandler(async (req: Request, res: Response) => {
  if (!validateRequiredParams(req, res, ['callerId'])) return;
  const { callerId } = req.body;

  const response = await agentService.handleCall(callerId);
  res.json(response);
}));

// Handle incoming messages
router.post('/message', asyncHandler(async (req: Request, res: Response) => {
  if (!validateRequiredParams(req, res, ['roomName', 'message'])) return;
  const { roomName, message, callerId } = req.body;

  const response = await agentService.handleMessage(roomName, message, callerId);
  res.json({ response });
}));

// Create a new help request
router.post('/help-request', asyncHandler(async (req: Request, res: Response) => {
  if (!validateRequiredParams(req, res, ['question', 'caller_id'])) return;
  const { question, caller_id } = req.body;

  // Ensure caller_id is properly formatted as a string
  const formattedCallerId = String(caller_id).trim();
  const request = await supervisorService.createHelpRequest(question, formattedCallerId);
  res.json(request);
}));

// Add a new endpoint to get supervisor responses directly
router.post('/supervisor-response', asyncHandler(async (req: Request, res: Response) => {
  if (!validateRequiredParams(req, res, ['roomName', 'callerId'])) return;
  const { roomName, callerId } = req.body;

  // Extract the actual caller ID from the room name if needed and ensure it's properly formatted
  let actualCallerId = callerId;
  if (callerId.startsWith('caller-')) {
    actualCallerId = callerId.replace('caller-', '');
  }
  actualCallerId = String(actualCallerId).trim();
  
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

export default router; 