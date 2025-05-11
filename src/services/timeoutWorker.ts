import prisma from '../config/prisma';

const DEFAULT_TIMEOUT_MINUTES = 5;
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

export function startTimeoutWorker() {
  const timeoutMinutes = parseInt(process.env.HELP_REQUEST_TIMEOUT_MINUTES || '', 10) || DEFAULT_TIMEOUT_MINUTES;
  setInterval(async () => {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    try {
      const staleRequests = await prisma.helpRequest.findMany({
        where: {
          status: 'pending',
          createdAt: { lt: cutoff },
        },
      });
      for (const req of staleRequests) {
        let callerId = 'unknown';
        if (
          req.callerInfo &&
          typeof req.callerInfo === 'object' &&
          'callerId' in req.callerInfo &&
          typeof req.callerInfo.callerId === 'string'
        ) {
          callerId = req.callerInfo.callerId;
        }
        await prisma.helpRequest.update({
          where: { id: req.id },
          data: {
            status: 'unresolved',
            resolvedAt: new Date(),
          },
        });
        console.log(`Help request auto-marked as unresolved (timeout): "${req.question}" (Caller ID: ${callerId})`);
      }
    } catch (err) {
      console.error('Timeout worker error:', err);
    }
  }, CHECK_INTERVAL_MS);
} 