import { deleteRoom } from '../config/livekit';
import prisma from '../config/prisma';

// Time to keep rooms after last activity (in milliseconds)
const ROOM_CLEANUP_DELAY = 5 * 60 * 1000; // 5 minutes

// How often to check for rooms to clean up (in milliseconds)
const CLEANUP_INTERVAL = 1 * 60 * 1000; // Check every 1 minute

/**
 * Periodically checks for and deletes inactive rooms
 */
export function startRoomCleanupWorker() {
  console.log('Starting room cleanup worker');
  
  setInterval(async () => {
    try {
      // Get all active rooms
      const activeRooms = await prisma.roomEvent.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        select: {
          roomName: true
        },
        distinct: ['roomName'],
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      console.log(`Cleanup worker: Checking ${activeRooms.length} rooms`);
      
      for (const room of activeRooms) {
        const roomName = room.roomName;
        
        // For each room, get the most recent event (of any type)
        const latestEvent = await prisma.roomEvent.findFirst({
          where: { roomName },
          orderBy: { createdAt: 'desc' }
        });
        
        if (!latestEvent) continue;
        
        // Calculate how long since the last event
        const lastActivityTime = new Date(latestEvent.createdAt).getTime();
        const inactivityDuration = Date.now() - lastActivityTime;
        
        // If the room has been inactive for more than ROOM_CLEANUP_DELAY, delete it
        if (inactivityDuration >= ROOM_CLEANUP_DELAY) {
          console.log(`Cleanup worker: Room ${roomName} has been inactive for ${Math.round(inactivityDuration / 1000 / 60)} minutes, deleting`);
          
          // Try to delete the room
          const deleted = await deleteRoom(roomName);
          
          if (deleted) {
            console.log(`Cleanup worker: Successfully deleted room ${roomName}`);
            
            // Save a deletion event
            await prisma.roomEvent.create({
              data: {
                roomName,
                eventType: 'room_deleted',
                data: `Deleted after inactivity (${Math.round(inactivityDuration / 1000 / 60)} minutes)`,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error('Room cleanup worker error:', error);
    }
  }, CLEANUP_INTERVAL);
} 