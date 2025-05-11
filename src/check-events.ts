import prisma from './config/prisma';
import { helpRequestModel } from './models/helpRequest';
import eventBus, { EventType, HelpRequestExpiredEvent } from './eventBus';

const HELP_REQUEST_TIMEOUT_MINUTES = 30; // Timeout after 30 minutes

/**
 * Checks for expired help requests that have been pending for too long
 * and marks them as unresolved
 */
async function checkAndProcessExpiredRequests() {
  try {
    console.log('[Timeout Worker] Checking for expired help requests...');
    
    // Find pending help requests that have been waiting too long
    const pendingRequests = await prisma.helpRequest.findMany({
      where: {
        status: 'pending',
        createdAt: {
          // Find requests older than HELP_REQUEST_TIMEOUT_MINUTES
          lt: new Date(Date.now() - HELP_REQUEST_TIMEOUT_MINUTES * 60 * 1000)
        }
      }
    });

    console.log(`[Timeout Worker] Found ${pendingRequests.length} expired help requests`);
    
    // Process each expired request
    for (const request of pendingRequests) {
      console.log(`[Timeout Worker] Processing expired request ${request.id}: "${request.question}"`);
      
      // Mark the request as expired (unresolved)
      await helpRequestModel.markAsExpired(request.id);
      
      // The event will be emitted by the helpRequestModel.markAsExpired method
    }
    
    // Check for rooms with no recent activity and log them
    await checkInactiveRooms();

  } catch (error) {
    console.error('[Timeout Worker] Error checking expired requests:', error);
  }
}

/**
 * Checks for rooms that haven't had activity in a while
 */
async function checkInactiveRooms() {
  try {
    // Get all room events from the last hour
    const recentEvents = await prisma.roomEvent.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Group by room name to find the most recent event per room
    const roomsWithLastActivity = new Map<string, Date>();
    
    for (const event of recentEvents) {
      if (!roomsWithLastActivity.has(event.roomName) || 
          roomsWithLastActivity.get(event.roomName)! < event.createdAt) {
        roomsWithLastActivity.set(event.roomName, event.createdAt);
      }
    }
    
    // Check for rooms with no activity in the last 30 minutes
    const inactiveThreshold = new Date(Date.now() - 30 * 60 * 1000);
    const inactiveRooms = Array.from(roomsWithLastActivity.entries())
      .filter(([_, lastActivity]) => lastActivity < inactiveThreshold)
      .map(([roomName, lastActivity]) => ({
        roomName,
        lastActivity,
        minutesInactive: Math.round((Date.now() - lastActivity.getTime()) / (60 * 1000))
      }));
    
    if (inactiveRooms.length > 0) {
      console.log(`[Timeout Worker] Found ${inactiveRooms.length} inactive rooms:`);
      inactiveRooms.forEach(room => {
        console.log(`- ${room.roomName}: Last activity ${room.minutesInactive} minutes ago`);
      });
    }
  } catch (error) {
    console.error('[Timeout Worker] Error checking inactive rooms:', error);
  }
}

// Add event listener for handling expired help requests
eventBus.on<HelpRequestExpiredEvent>(EventType.HELP_REQUEST_EXPIRED, async (event) => {
  const { id, question, callerId } = event;
  console.log(`[Event] Help request ${id} for "${question}" has expired`);
  
  // Here we could add logic to notify the caller that their request timed out
  // For example, send a message to the room if it's still active
  if (callerId && callerId !== 'unknown') {
    console.log(`[Event] Notifying caller ${callerId} that their request has expired`);
    // Could implement notification logic here, like sending a message to the LiveKit room
  }
});

// For standalone testing
if (require.main === module) {
  checkAndProcessExpiredRequests()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { checkAndProcessExpiredRequests }; 