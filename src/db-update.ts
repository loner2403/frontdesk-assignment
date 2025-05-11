/**
 * This is a utility script to handle the database schema change from callerInfo JSON to direct callerId.
 * 
 * It provides functions to:
 * 1. Extract callerId from callerInfo JSON
 * 2. Handle new requests with direct callerId
 * 3. Query using the direct callerId field
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Gets the callerId from a help request
 * @param helpRequest The help request object from the database
 * @returns The callerId string or 'unknown' if not found
 */
export function getCallerId(helpRequest: any): string {
  return helpRequest.callerId || 'unknown';
}

/**
 * Creates a where clause for finding help requests by callerId
 * @param callerId The callerId to search for
 * @returns A where clause object for Prisma queries
 */
export function createCallerIdWhereClause(callerId: string): any {
  return { callerId: String(callerId).trim() };
}

/**
 * Creates the data object for a new help request
 * Handles both old and new schema
 * @param question The help request question
 * @param callerId The callerId
 * @returns Data object for Prisma create
 */
export function createHelpRequestData(question: string, callerId: string): any {
  // Format callerId as string
  const formattedCallerId = String(callerId).trim();
  
  return {
    question,
    callerId: formattedCallerId,
    status: 'pending',
  };
}

/**
 * Finds help requests by callerId
 * @param callerId The callerId to search for
 * @param status Optional status filter
 * @returns Array of matching help requests
 */
export async function findHelpRequestsByCallerId(callerId: string, status?: string): Promise<any[]> {
  const whereClause = createCallerIdWhereClause(callerId);
  
  // Add status if provided
  if (status) {
    whereClause.status = status;
  }
  
  return prisma.helpRequest.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' }
  });
}

export default {
  getCallerId,
  createCallerIdWhereClause,
  createHelpRequestData,
  findHelpRequestsByCallerId
}; 