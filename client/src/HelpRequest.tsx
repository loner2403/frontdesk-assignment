import React, { useState, useRef, useEffect } from 'react';
import { Room } from 'livekit-client';
import './App.css';


// API Settings
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
const LIVEKIT_WS_URL = process.env.REACT_APP_LIVEKIT_WS_URL || '';

// Debug mode flag (set to true for debugging)
const DEBUG_MODE = true;

// Utility for debug logging
const debug = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    if (data) {
      console.log(`[DEBUG] ${message}`, data);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
};

interface HelpRequestResponse {
  id: string;
  question: string;
  caller_id: string;
  status: string;
  supervisor_response?: string;
}

// Helper function to detect if a message is a "waiting for supervisor" message
const isWaitingForSupervisorMessage = (message: string): boolean => {
  if (!message) return false;
  
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("still waiting") ||
    lowerMessage.includes("haven't received") ||
    lowerMessage.includes("no response") ||
    lowerMessage.includes("not yet") ||
    lowerMessage.includes("let you know") ||
    lowerMessage.includes("as soon as") ||
    lowerMessage.includes("let me check") ||
    lowerMessage.includes("i need to consult") ||
    lowerMessage.includes("i'll check with") ||
    lowerMessage.includes("i'm escalating this") ||
    (lowerMessage.includes("supervisor") && lowerMessage.includes("waiting"))
  );
};

// Handle special messages that shouldn't trigger polling
const isSpecialMessage = (message: string): boolean => {
  if (!message) return false;
  
  // Check if this is a special command or polling message
  return (
    message === '__CHECK_SUPERVISOR_RESPONSES__' ||
    message === 'Has my supervisor replied with an answer yet?' ||
    message === 'What did my supervisor say?' ||
    message === "What was the supervisor's response?" ||
    message === 'Did the supervisor answer my question?' ||
    message.toLowerCase().includes('supervisor') && (
      message.toLowerCase().includes('replied') ||
      message.toLowerCase().includes('responded') ||
      message.toLowerCase().includes('answer')
    )
  );
};

export default function HelpRequest() {
  const [callerId, setCallerId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Array<{text: string, sender: string, isSupervisor?: boolean, id?: string}>>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingQuestions, setPendingQuestions] = useState<{[key: string]: string}>({});
  const [isCheckingResponses, setIsCheckingResponses] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(0);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [lastSupervisorResponses, setLastSupervisorResponses] = useState<Set<string>>(new Set());
  const [hasInitialResponse, setHasInitialResponse] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Track when we last made each type of check to avoid excessive polling
  const lastApiChecks = useRef({
    webhook: 0,
    directAgent: 0,
    naturalQuery: 0
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set up manual polling for supervisor responses - more frequent polling for better detection
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    // This will check more aggressively (every 3 seconds) when there are pending questions
    if (connected) {
      intervalId = setInterval(() => {
        const now = Date.now();
        const timeSinceLastCheck = now - lastCheckTime;
        
        // If we have pending questions, check more frequently
        if (Object.keys(pendingQuestions).length > 0) {
          // Check every 5 seconds if we have pending questions
          // But not if we've checked in the last 3 seconds via other means
          if (timeSinceLastCheck >= 5000 && 
              now - lastApiChecks.current.webhook > 3000 && 
              now - lastApiChecks.current.directAgent > 3000) {
            checkForSupervisorResponses();
            setLastCheckTime(now);
          }
        } else {
          // Still check periodically even without pending questions (every 30 seconds)
          // This catches cases where the supervisor responded but we didn't get notified
          if (timeSinceLastCheck >= 30000) {
            checkForSupervisorResponses();
            setLastCheckTime(now);
          }
        }
      }, 3000); // Check frequently for more responsive UI
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [connected, pendingQuestions, lastCheckTime]);

  // Additional effect specifically for handling new pending questions - immediate check
  useEffect(() => {
    // When a new pending question is added, check immediately and then after short delays
    if (connected && Object.keys(pendingQuestions).length > 0) {
      addDebugLog('New pending question detected, scheduling immediate checks');
      
      // Immediate check
      setTimeout(() => checkForSupervisorResponses(), 1000);
      
      // Additional checks at increasing intervals
      setTimeout(() => checkForSupervisorResponses(), 5000);
      setTimeout(() => checkForSupervisorResponses(), 10000);
    }
  }, [pendingQuestions, connected]);

  // Function to add to debug log
  const addDebugLog = (message: string) => {
    if (DEBUG_MODE) {
      debug(message);
      setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    }
  };

  // Add a function to directly poll the webhook endpoint
  const pollWebhookForSupervisorResponses = async () => {
    if (!callerId) return false;
    lastApiChecks.current.webhook = Date.now();
    addDebugLog(`Polling webhook for supervisor responses for caller: ${callerId}`);
    try {
      // Use a timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const webhookResponse = await fetch(`${API_URL}/agent/webhook/supervisor-response/${callerId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      }).catch(err => {
        addDebugLog(`Webhook request failed with error: ${err.message}`);
        return null;
      });
      
      clearTimeout(timeoutId);
      
      if (!webhookResponse) {
        return false;
      }
      
      if (webhookResponse.ok) {
        let data;
        try {
          // First try to parse as JSON
          const text = await webhookResponse.text();
          
          // Check if the response is HTML (likely an error page)
          if (text.trim().startsWith('<!DOCTYPE html>') || text.trim().startsWith('<html')) {
            addDebugLog(`Webhook returned HTML instead of JSON - likely an error page`);
            return false;
          }
          
          try {
            data = JSON.parse(text);
          } catch (jsonError) {
            addDebugLog(`Webhook returned non-JSON response: ${text.substring(0, 100)}...`);
            return false;
          }
          
          if (data.foundResponse && data.supervisorResponse) {
            addDebugLog(`Found supervisor response via webhook: ${data.supervisorResponse}`);
            const responseText = `I've consulted with my supervisor and they say: ${data.supervisorResponse}`;
            if (!lastSupervisorResponses.has(responseText)) {
              safelyAddMessage({
                text: responseText,
                sender: 'Supervisor',
                isSupervisor: true
              });
              setPendingQuestions({});
              setTimeout(scrollToBottom, 100);
              return true;
            } else {
              addDebugLog(`Skipping duplicate supervisor response from webhook: ${responseText}`);
            }
          } else {
            addDebugLog(`Webhook response contained no supervisor response: ${JSON.stringify(data)}`);
          }
        } catch (parseError) {
          addDebugLog(`Error parsing webhook response: ${parseError}`);
        }
      } else {
        addDebugLog(`Webhook request failed with status: ${webhookResponse.status}`);
      }
    } catch (error) {
      addDebugLog(`Error polling webhook: ${error}`);
    }
    return false;
  };

  // Enhanced supervisor response checking to also use the webhook
  const checkForSupervisorResponses = async () => {
    if (isCheckingResponses || !callerId) return;
    
    setIsCheckingResponses(true);
    addDebugLog(`Checking for supervisor responses for caller: ${callerId}`);
    
    try {
      // First try the webhook approach which is most direct
      const webhookSuccess = await pollWebhookForSupervisorResponses();
      if (webhookSuccess) {
        addDebugLog('Successfully got response via webhook approach');
        setIsCheckingResponses(false);
        return;
      }
      
      // Wait a little before the next check
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Then try the direct agent approach
      lastApiChecks.current.directAgent = Date.now();
      const directSuccess = await checkDirectlyViaAgent();
      if (directSuccess) {
        addDebugLog('Successfully got response via direct agent approach');
        setIsCheckingResponses(false);
        return;
      }
      
      addDebugLog('Both webhook and direct approaches failed to find supervisor responses');
    } catch (error) {
      addDebugLog(`Error checking for supervisor responses: ${error}`);
    } finally {
      setIsCheckingResponses(false);
    }
  };

  // Helper to safely add messages without duplicates
  const safelyAddMessage = (newMessage: {text: string, sender: string, isSupervisor?: boolean}) => {
    setMessages(prevMessages => {
      // Create a unique ID for this message based on content + timestamp
      const messageId = `${newMessage.text}-${Date.now()}`;
      const messageWithId = { ...newMessage, id: messageId };
      
      // For supervisor messages, check if we've seen this exact text before
      if (newMessage.isSupervisor) {
        // Check if this message is a duplicate within the last 10 messages
        const recentMessages = prevMessages.slice(-10);
        const isDuplicate = recentMessages.some(msg => 
          msg.isSupervisor && msg.text === newMessage.text
        );
        
        if (isDuplicate) {
          return prevMessages; // Skip this duplicate message
        }
        
        // Add to our set of seen supervisor responses
        setLastSupervisorResponses(prev => {
          const newSet = new Set(prev);
          newSet.add(newMessage.text);
          return newSet;
        });
      }
      
      return [...prevMessages, messageWithId];
    });
  };

  // Enhance the direct agent check for more reliable supervisor response detection
  const checkDirectlyViaAgent = async () => {
    if (!roomRef.current || !callerId) return false;
    
    addDebugLog('Checking for supervisor responses via direct agent message');
    let responseFound = false;
    
    try {
      // First attempt: Direct attempt to get supervisor response with a dedicated endpoint call
      const directResponse = await fetch(`${API_URL}/agent/supervisor-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roomName: roomRef.current.name,
          callerId: callerId
        }),
      }).catch(() => null);
      
      if (directResponse && directResponse.ok) {
        const data = await directResponse.json();
        addDebugLog(`Direct supervisor endpoint response: ${JSON.stringify(data)}`);
        
        if (data.supervisorResponse) {
          const responseText = `I've consulted with my supervisor and they say: ${data.supervisorResponse}`;
          
          // Add to messages if not duplicate
          if (!lastSupervisorResponses.has(responseText)) {
            addDebugLog(`Adding supervisor response from direct endpoint: ${responseText}`);
            safelyAddMessage({
              text: responseText,
              sender: 'Supervisor',
              isSupervisor: true
            });
            
            // Clear pending questions
            setPendingQuestions({});
            
            // Scroll to bottom
            setTimeout(scrollToBottom, 100);
            
            responseFound = true;
            return true;
          } else {
            addDebugLog(`Skipping duplicate supervisor response: ${responseText}`);
          }
        }
      }
      
      // Second attempt: Try with special command
      const response = await fetch(`${API_URL}/agent/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roomName: roomRef.current.name,
          message: "__CHECK_SUPERVISOR_RESPONSES__", // Special command
          callerId: callerId
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        addDebugLog(`Agent message response: ${JSON.stringify(data)}`);
        
        // If the response has supervisor info, use it
        if (data.supervisorResponse) {
          const responseText = `I've consulted with my supervisor and they say: ${data.supervisorResponse}`;
          
          // Add to messages if not duplicate
          if (!lastSupervisorResponses.has(responseText)) {
            addDebugLog(`Adding supervisor response from direct check: ${responseText}`);
            safelyAddMessage({
              text: responseText,
              sender: 'Supervisor',
              isSupervisor: true
            });
            
            // Clear pending questions
            setPendingQuestions({});
            
            // Scroll to bottom
            setTimeout(scrollToBottom, 100);
            
            responseFound = true;
            return true;
          }
        }
      }
      
      if (responseFound) return true;
      
      // Third attempt: Try with a natural language query (more reliable detection)
      const naturalResponse = await fetch(`${API_URL}/agent/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roomName: roomRef.current.name,
          message: "Has my supervisor replied with an answer yet?",
          callerId: callerId
        }),
      });
      
      if (naturalResponse.ok) {
        const data = await naturalResponse.json();
        
        // Look for supervisor response patterns in the agent's reply
        if (data.response) {
          addDebugLog(`Agent natural query response: ${data.response}`);
          
          // Improved pattern matching for supervisor response detection
          // ONLY match actual supervisor responses, not "waiting for supervisor" messages
          if (
            (data.response.includes("I've consulted with my supervisor") && !data.response.toLowerCase().includes("waiting")) ||
            (data.response.includes("My supervisor says") && !data.response.toLowerCase().includes("waiting")) ||
            (data.response.includes("supervisor responded") && !data.response.toLowerCase().includes("waiting")) ||
            (data.response.includes("The supervisor's answer") && !data.response.toLowerCase().includes("waiting")) ||
            (data.response.toLowerCase() === "yes" && !data.response.toLowerCase().includes("waiting")) ||
            (data.response.toLowerCase() === "yes." && !data.response.toLowerCase().includes("waiting"))
          ) {
            // This looks like a supervisor response
            // If it's a simple "yes", we need to fetch the actual response
            if (data.response.toLowerCase() === "yes" || 
                data.response.toLowerCase() === "yes.") {
              addDebugLog("Detected 'yes' response - supervisor has responded. Fetching actual response...");
              
              // Follow up to get the actual supervisor response
              const followUpResponse = await fetch(`${API_URL}/agent/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  roomName: roomRef.current.name,
                  message: "What was the supervisor's response?",
                  callerId: callerId
                }),
              });
              
              if (followUpResponse.ok) {
                const followUpData = await followUpResponse.json();
                if (followUpData.response) {
                  addDebugLog(`Got direct supervisor response from query "What was the supervisor's response?": ${followUpData.response}`);
                  
                  // Check if the response is actually a "still waiting" message
                  const isWaitingMessage = 
                    followUpData.response.toLowerCase().includes("still waiting") ||
                    followUpData.response.toLowerCase().includes("haven't received") ||
                    followUpData.response.toLowerCase().includes("no response") ||
                    followUpData.response.toLowerCase().includes("not yet") ||
                    followUpData.response.toLowerCase().includes("let you know") ||
                    followUpData.response.toLowerCase().includes("as soon as");
                  
                  if (!isWaitingMessage) {
                    // This is an actual supervisor response
                    const responseText = `I've consulted with my supervisor and they say: ${followUpData.response}`;
                    
                    if (!lastSupervisorResponses.has(responseText)) {
                      addDebugLog(`Adding supervisor response from natural query: ${responseText}`);
                      safelyAddMessage({
                        text: responseText,
                        sender: 'Supervisor',
                        isSupervisor: true
                      });
                      
                      // Clear pending questions
                      setPendingQuestions({});
                      
                      // Scroll to bottom
                      setTimeout(scrollToBottom, 100);
                      
                      responseFound = true;
                      return true;
                    }
                  } else {
                    // This is a "still waiting" message, not an actual supervisor response
                    addDebugLog(`Received a "still waiting" message, not a supervisor response: ${followUpData.response}`);
                  }
                }
              }
            } else {
              // Direct response that contains supervisor's answer
              // Extract the actual supervisor response
              let supervisorResponse = data.response;
              
              // Check if this is actually a waiting message
              const isWaitingMessage = 
                supervisorResponse.toLowerCase().includes("still waiting") ||
                supervisorResponse.toLowerCase().includes("haven't received") ||
                supervisorResponse.toLowerCase().includes("no response") ||
                supervisorResponse.toLowerCase().includes("not yet") ||
                supervisorResponse.toLowerCase().includes("let you know") ||
                supervisorResponse.toLowerCase().includes("as soon as") ||
                supervisorResponse.toLowerCase().includes("let me check");
              
              if (!isWaitingMessage) {
                // Format the response text
                const responseText = `I've consulted with my supervisor and they say: ${supervisorResponse}`;
                
                if (!lastSupervisorResponses.has(responseText)) {
                  addDebugLog(`Adding supervisor response from natural query: ${responseText}`);
                  safelyAddMessage({
                    text: responseText,
                    sender: 'Supervisor',
                    isSupervisor: true
                  });
                  
                  // Clear pending questions
                  setPendingQuestions({});
                  
                  // Scroll to bottom
                  setTimeout(scrollToBottom, 100);
                  
                  responseFound = true;
                  return true;
                }
              } else {
                // This is a "still waiting" message, not an actual supervisor response
                addDebugLog(`Received a "still waiting" message, not a supervisor response: ${supervisorResponse}`);
              }
            }
          }
        }
      }
      
      return responseFound;
    } catch (error) {
      addDebugLog(`Error checking via agent message: ${error}`);
    }
    
    return responseFound;
  };

  const startCall = async () => {
    setIsLoading(true);
    try {
      // Clear previous state when starting a new call
      setMessages([]);
      setPendingQuestions({});
      setLastSupervisorResponses(new Set());
      setDebugLog([]);
      setHasInitialResponse(false);
      
      // Reset API check times
      lastApiChecks.current = {
        webhook: 0,
        directAgent: 0,
        naturalQuery: 0
      };
      
      const id = callerId || `caller-${Math.floor(Math.random() * 10000)}`;
      setCallerId(id);
      
      // Log the API URL being used
      addDebugLog(`Using API URL: ${API_URL}`);
      
      const res = await fetch(`${API_URL}/agent/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: id }),
      });
      
      if (!res.ok) {
        throw new Error(`Failed to start call: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      const newRoom = new Room();
      
      // Ensure LIVEKIT_WS_URL is defined
        if (!LIVEKIT_WS_URL) {
            throw new Error('LIVEKIT_WS_URL is not defined. Please check your .env file.');
        }
        
        // Proceed to connect
        await newRoom.connect(LIVEKIT_WS_URL, data.callerToken);
            
      newRoom.on('dataReceived', (payload, participant) => {
        const message = new TextDecoder().decode(payload);
        const sender = participant?.identity || 'Agent';
        
        // Improved detection of supervisor-related messages
        // Check if this message is a supervisor response (expanded patterns)
        if (message.includes("I've consulted with my supervisor") || 
            message.includes("My supervisor says") ||
            message.includes("supervisor has provided") ||
            message.includes("The supervisor's response") ||
            message.includes("According to my supervisor") ||
            message.includes("supervisor responded with") ||
            message.includes("supervisor's answer")) {
          
          // Check if this is actually a waiting message
          if (!isWaitingForSupervisorMessage(message)) {
            // This is likely a supervisor response
            addDebugLog(`Received supervisor response via LiveKit: ${message}`);
            
            // Check if we've seen this exact response before
            if (!lastSupervisorResponses.has(message)) {
              // Add as supervisor message with special styling
              safelyAddMessage({
                text: message,
                sender: 'Supervisor',
                isSupervisor: true
              });
              
              // Clear all pending questions when supervisor responds
              setPendingQuestions({});
            } else {
              addDebugLog(`Skipping duplicate supervisor response via LiveKit: ${message}`);
            }
            
            return; // Skip normal message handling for supervisor responses
          }
        }
        
        // Enhanced detection of messages indicating escalation to supervisor
        if (message.includes("Let me check with my supervisor") || 
            message.includes("I need to consult") || 
            message.includes("I'll check with my supervisor") ||
            message.includes("I'm escalating this to") ||
            message.includes("let me ask my supervisor") ||
            message.includes("I need to get supervisor input")) {
          // Extract the question being asked to the supervisor
          const questionMatch = message.match(/about "(.*?)"/);
          const question = questionMatch ? questionMatch[1] : input || "recent question";
          
          // Record this as a pending question waiting for supervisor response
          const requestId = `req-${Date.now()}`;
          setPendingQuestions(prev => ({...prev, [requestId]: question}));
          
          // Immediately schedule checks for responses
          setTimeout(() => checkForSupervisorResponses(), 3000);
          setTimeout(() => checkForSupervisorResponses(), 8000);
          setTimeout(() => checkForSupervisorResponses(), 15000);
          
          // Schedule polling for responses
          const checkIntervals = [5000, 10000, 20000, 30000, 60000];
          checkIntervals.forEach(interval => {
            setTimeout(() => {
              if (Object.keys(pendingQuestions).length > 0) {
                checkForSupervisorResponses();
              }
            }, interval);
          });
        }
        
        // Add the regular message (using the safe add method)
        safelyAddMessage({text: message, sender});
      });
      
      setRoom(newRoom);
      roomRef.current = newRoom;
      setConnected(true);
      safelyAddMessage({text: 'Connected to agent. How can I help you today?', sender: 'Agent'});
      
      // Check for any existing supervisor responses for this caller
      // This helps when reconnecting to a session where supervisor already responded
      setTimeout(async () => {
        try {
          // Only do this check once when connecting
          if (hasInitialResponse) return;
          
          const existingResponseCheck = await fetch(`${API_URL}/agent/supervisor-response`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              roomName: newRoom.name,
              callerId: id
            }),
          });
          
          if (existingResponseCheck.ok) {
            const responseData = await existingResponseCheck.json();
            if (responseData.supervisorResponse) {
              const message = `I've consulted with my supervisor and they say: ${responseData.supervisorResponse}`;
              
              // Clear any existing messages to avoid duplication
              clearSupervisorResponses();
              
              // Add the supervisor response
              safelyAddMessage({
                text: message,
                sender: 'Supervisor',
                isSupervisor: true
              });
              
              setHasInitialResponse(true);
              addDebugLog(`Retrieved previous supervisor response on connection: ${responseData.supervisorResponse}`);
            }
          }
        } catch (error) {
          addDebugLog(`Error checking for existing supervisor responses: ${error}`);
        }
      }, 1500);
      
      // Enhanced initial checks for any existing supervisor responses
      // Immediate check
      setTimeout(() => checkForSupervisorResponses(), 1000);
      
      // Follow-up checks to ensure we catch any supervisor responses
      setTimeout(() => checkForSupervisorResponses(), 5000);
      setTimeout(() => checkForSupervisorResponses(), 10000);
      
      // Set up a multi-tier checking system for supervisor responses
      // 1. Fast interval for when we have pending questions
      const fastIntervalId = setInterval(() => {
        if (connected && Object.keys(pendingQuestions).length > 0) {
          const now = Date.now();
          // Only check if we haven't checked recently via other means
          if (now - lastApiChecks.current.webhook > 5000 && 
              now - lastApiChecks.current.directAgent > 5000) {
            addDebugLog('Fast interval check for supervisor responses');
            checkForSupervisorResponses();
          }
        }
      }, 8000); // Less frequent checking (8 seconds instead of 5)
      
      // 2. Slower interval as a backup check regardless of pending status
      const slowIntervalId = setInterval(() => {
        if (connected) {
          const now = Date.now();
          // Only check if we haven't checked recently via other means
          if (now - lastApiChecks.current.webhook > 15000 && 
              now - lastApiChecks.current.directAgent > 15000) {
            addDebugLog('Slow interval check for supervisor responses');
            checkForSupervisorResponses();
          }
        }
      }, 45000); // Less frequent checking (45 seconds instead of 30)
      
      // Clean up intervals when component unmounts
      return () => {
        clearInterval(fastIntervalId);
        clearInterval(slowIntervalId);
      };
    } catch (error) {
      console.error('Error starting call:', error);
      safelyAddMessage({text: 'Failed to connect. Please try again.', sender: 'System'});
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!roomRef.current || !input.trim()) return;
    
    // Don't send special messages directly from the UI
    if (isSpecialMessage(input.trim())) {
      addDebugLog(`Prevented sending special message directly: ${input.trim()}`);
      setInput('');
      return;
    }
    
    setIsLoading(true);
    const currentQuestion = input.trim();
    const messageId = `msg-${Date.now()}`;
    
    try {
      // Add user message
      safelyAddMessage({text: currentQuestion, sender: 'You'});
      
      // Send via LiveKit data channel
      roomRef.current.localParticipant.publishData(
        new TextEncoder().encode(currentQuestion),
        { reliable: true }
      );
      
      // Always add this question as potentially needing a supervisor
      // We'll remove it if it gets an immediate response that doesn't need supervisor
      setPendingQuestions(prev => ({...prev, [messageId]: currentQuestion}));
      
      // Also send via direct API call as backup with improved response handling
      const response = await fetch(`${API_URL}/agent/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roomName: roomRef.current.name, 
          message: currentQuestion, 
          callerId: callerId || roomRef.current.name.replace('call-', '')
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Immediate supervisor response check (first fast check)
        setTimeout(async () => {
          // Force refresh supervisor status immediately after message
          await checkDirectlyViaAgent();
        }, 800);
        
        // Set up a more reasonable polling sequence for supervisor responses
        // Check less frequently to reduce unnecessary events
        const checkTimes = [3000, 8000, 15000, 30000];
        
        for (const delay of checkTimes) {
          setTimeout(async () => {
            // Only check if there are pending questions and we're still connected
            if (Object.keys(pendingQuestions).length > 0 && connected) {
              addDebugLog(`Checking for supervisor response after ${delay}ms delay`);
              await checkDirectlyViaAgent();
            }
          }, delay);
        }
        
        // Check if this is a response that indicates escalation to supervisor
        if (data.needsHelp && data.helpRequestId) {
          // Store this question as pending supervisor response using the actual helpRequestId
          setPendingQuestions(prev => {
            const updated = {...prev};
            delete updated[messageId]; // Remove temporary ID
            updated[data.helpRequestId] = currentQuestion; // Use actual helpRequestId
            return updated;
          });
          
          // Add a message indicating the escalation
          setTimeout(() => {
            safelyAddMessage({
              text: "Let me check with my supervisor and get back to you on this question.",
              sender: 'Agent'
            });
            
            // Immediately start checking for supervisor responses
            setLastCheckTime(0);
            checkForSupervisorResponses();
          }, 500);
        }
        // Check if we immediately got a supervisor response
        else if (data.supervisorResponse) {
          setTimeout(() => {
            const responseText = `I've consulted with my supervisor and they say: ${data.supervisorResponse}`;
            
            // Remove from pending questions immediately
            setPendingQuestions(prev => {
              const updated = {...prev};
              delete updated[messageId];
              return updated;
            });
            
            safelyAddMessage({
              text: responseText,
              sender: 'Supervisor',
              isSupervisor: true
            });
            
            // Scroll to bottom
            setTimeout(scrollToBottom, 100);
          }, 1000);
        }
        // Normal response (no supervisor needed)
        else if (data && data.response) {
          // If this is a normal response (not needing supervisor), remove from pending
          if (!data.response.includes("Let me check with my supervisor") && 
              !data.response.includes("I need to consult") &&
              !data.response.includes("I'll check with my supervisor")) {
            
            // Remove this question from pending since it doesn't need supervisor
            setPendingQuestions(prev => {
              const updated = {...prev};
              delete updated[messageId];
              return updated;
            });
          }
          
          // Add the response to messages if not already added via LiveKit
          setTimeout(() => {
            // Check if this response is already in the messages
            const isDuplicate = messages.some(msg => 
              msg.sender === 'Agent' && msg.text === data.response
            );
            
            if (!isDuplicate) {
              safelyAddMessage({text: data.response, sender: 'Agent'});
            }
          }, 500); // Small delay to allow LiveKit message to arrive first
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      safelyAddMessage({text: 'Failed to send message. Please try again.', sender: 'System'});
      
      // Remove from pending on error
      setPendingQuestions(prev => {
        const updated = {...prev};
        delete updated[messageId];
        return updated;
      });
    } finally {
      setInput('');
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      sendMessage();
    }
  };

  // Add function to clear duplicate supervisor responses
  const clearSupervisorResponses = () => {
    addDebugLog('Clearing duplicate supervisor responses');
    
    // First, get all supervisor messages
    const supervisorMessages = messages.filter(msg => msg.isSupervisor);
    
    if (supervisorMessages.length <= 1) {
      addDebugLog('No duplicate supervisor responses to clear');
      return; // Nothing to clear
    }
    
    // Keep only the most recent supervisor message
    const mostRecentSupervisorMsg = supervisorMessages[supervisorMessages.length - 1];
    
    // Filter out older supervisor messages
    setMessages(prevMessages => 
      prevMessages.filter(msg => 
        !msg.isSupervisor || msg.id === mostRecentSupervisorMsg.id
      )
    );
    
    // Reset the set of seen supervisor responses to only include the most recent one
    setLastSupervisorResponses(new Set([mostRecentSupervisorMsg.text]));
    
    addDebugLog('Cleared old supervisor responses, keeping only the most recent one');
  };

  return (
    <div className="help-container">
      <h1 className="help-header">Salon Help Request</h1>
      
      {!connected ? (
        <div className="help-form">
          <input
            value={callerId}
            onChange={e => setCallerId(e.target.value)}
            placeholder="Enter your name or phone number (optional)"
          />
          <button onClick={startCall} disabled={isLoading}>
            {isLoading ? 'Connecting...' : 'Start Call'}
          </button>
        </div>
      ) : (
        <>
          <div className="help-status-badge">Connected</div>
          
          <div className="help-message-container">
            <h3>Conversation</h3>
            <div className="help-message-list">
              <div className="help-messages-wrapper">
                {messages.map((msg, idx) => (
                  msg.isSupervisor ? (
                    <div className="help-message supervisor">
                      <div className="sender">{msg.sender}</div>
                      <div className="content">{msg.text}</div>
                    </div>
                  ) : (
                    <div className={`help-message${msg.sender === 'You' ? ' user' : ''}`} key={msg.id || idx}>
                      <div className="sender">{msg.sender}</div>
                      <div className="content">{msg.text}</div>
                    </div>
                  )
                ))}
                {Object.keys(pendingQuestions).length > 0 && (
                  <div className="help-thinking-indicator">
                    Waiting for supervisor response...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            
            <div className="help-input-group">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your question..."
                disabled={isLoading}
              />
              <button onClick={sendMessage} disabled={!input.trim() || isLoading}>
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
          
          {DEBUG_MODE && (
            <div style={{marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', fontSize: '12px'}}>
              <h4>Debug Log</h4>
              <div style={{maxHeight: '200px', overflowY: 'auto'}}>
                {debugLog.map((log, idx) => (
                  <div key={idx} style={{marginBottom: '4px'}}>{log}</div>
                ))}
              </div>
              <div>
                <button 
                  onClick={checkForSupervisorResponses} 
                  style={{marginTop: '10px', fontSize: '12px', padding: '4px 8px'}}
                >
                  Force Check Responses
                </button>
                <button 
                  onClick={checkDirectlyViaAgent}
                  style={{marginTop: '10px', fontSize: '12px', padding: '4px 8px', marginLeft: '8px'}}
                >
                  Direct Agent Check
                </button>
                <button 
                  onClick={clearSupervisorResponses}
                  style={{marginTop: '10px', fontSize: '12px', padding: '4px 8px', marginLeft: '8px', backgroundColor: '#ff9800'}}
                >
                  Clear Duplicate Responses
                </button>
                <button 
                  onClick={() => {
                    setDebugLog([]);
                    clearSupervisorResponses();
                  }} 
                  style={{marginTop: '10px', fontSize: '12px', padding: '4px 8px', marginLeft: '8px'}}
                >
                  Clear Log & Duplicates
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
} 