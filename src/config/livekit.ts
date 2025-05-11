import { AccessToken, RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

const livekitUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

if (!livekitUrl || !apiKey || !apiSecret) {
  throw new Error('Missing LiveKit environment variables');
}

export const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);

export const generateToken = (roomName: string, participantName: string, metadata?: string) => {
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  return at.toJwt();
};

export const createRoom = async (roomName: string) => {
  try {
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 5 * 60, // 5 minutes
      maxParticipants: 2,
    });
    return true;
  } catch (error) {
    console.error('Error creating room:', error);
    return false;
  }
};

/**
 * Delete a room
 * @param {string} roomName - The name of the room.
 * @returns {boolean} True if deleted successfully
 */
export const deleteRoom = async (roomName: string): Promise<boolean> => {
  try {
    await roomService.deleteRoom(roomName);
    return true;
  } catch (error) {
    console.error(`Error deleting room ${roomName}:`, error);
    return false;
  }
};

/**
 * Publish a data message to a LiveKit room.
 * @param {string} roomName - The name of the room.
 * @param {string} message - The message to send.
 * @param {string[]} [destinationIdentities] - Optional participant identities to send to.
 * @param {boolean} [reliable] - Whether to use reliable delivery (default: true).
 * @returns {Promise<boolean>} - Whether the message was sent successfully
 */
export const publishDataToRoom = async (
  roomName: string,
  message: string,
  destinationIdentities?: string[],
  reliable: boolean = true
): Promise<boolean> => {
  // Ensure roomName is a proper string, not an object
  if (typeof roomName !== 'string') {
    console.error('Invalid room name format:', roomName);
    return false;
  }
  
  // Fix any potentially malformed room names
  // If roomName looks like [object Object], it's a serialization error
  if (roomName.includes('[object Object]')) {
    console.error('Malformed room name detected:', roomName);
    return false;
  }
  
  try {
    const data = Buffer.from(message, 'utf-8');
    await roomService.sendData(
      roomName,
      data,
      reliable ? DataPacket_Kind.RELIABLE : DataPacket_Kind.LOSSY,
      destinationIdentities
    );
    return true;
  } catch (error) {
    console.error(`Error sending data to room ${roomName}:`, error);
    return false;
  }
}; 