/**
 * MCP Session Management
 * Manages active SSE connections and their associated state
 */

import { randomUUID } from "node:crypto";
import type { McpSession } from "./types";

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Maximum number of concurrent sessions
const MAX_SESSIONS = 1000;

// In-memory session store
const sessions = new Map<string, McpSession>();

// Cleanup interval (5 minutes)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Creates a new MCP session
 */
export const createSession = (): McpSession => {
  // Cleanup old sessions if we're at capacity
  if (sessions.size >= MAX_SESSIONS) {
    cleanupExpiredSessions();
  }

  const session: McpSession = {
    id: randomUUID(),
    createdAt: new Date(),
    lastActivity: new Date(),
  };

  sessions.set(session.id, session);
  startCleanupInterval();

  return session;
};

/**
 * Gets a session by ID
 */
export const getSession = (sessionId: string): McpSession | null => {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  // Check if session has expired
  const now = Date.now();
  if (now - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
};

/**
 * Updates the last activity timestamp for a session
 */
export const touchSession = (sessionId: string): boolean => {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  session.lastActivity = new Date();
  return true;
};

/**
 * Deletes a session
 */
export const deleteSession = (sessionId: string): boolean => {
  return sessions.delete(sessionId);
};

/**
 * Gets the number of active sessions
 */
export const getSessionCount = (): number => {
  return sessions.size;
};

/**
 * Cleans up expired sessions
 */
const cleanupExpiredSessions = (): void => {
  const now = Date.now();
  const expiredIds: string[] = [];

  for (const [id, session] of sessions) {
    if (now - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
      expiredIds.push(id);
    }
  }

  for (const id of expiredIds) {
    sessions.delete(id);
  }

  // Stop cleanup interval if no sessions remain
  if (sessions.size === 0 && cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

/**
 * Starts the cleanup interval if not already running
 */
const startCleanupInterval = (): void => {
  if (cleanupInterval) {
    return;
  }

  cleanupInterval = setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
  // Ensure the interval doesn't prevent the process from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
};

