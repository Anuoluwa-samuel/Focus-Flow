"use server";

import { runAction } from "@/server/action-helpers";
import * as timer from "@/server/timer-service";
import { sessionIdSchema, startSchema } from "@/validators/timer";

export async function startTimerAction(input: unknown) {
  return runAction(startSchema, input, (u, d) => timer.startSession(u.id, d));
}
export async function pauseTimerAction(input: unknown) {
  return runAction(sessionIdSchema, input, (u, d) => timer.pauseSession(u.id, d.sessionId));
}
export async function resumeTimerAction(input: unknown) {
  return runAction(sessionIdSchema, input, (u, d) => timer.resumeSession(u.id, d.sessionId));
}
export async function completeTimerAction(input: unknown) {
  return runAction(sessionIdSchema, input, (u, d) => timer.completeSession(u.id, d.sessionId));
}
export async function resetTimerAction(input: unknown) {
  return runAction(sessionIdSchema, input, (u, d) => timer.resetSession(u.id, d.sessionId));
}
export async function skipTimerAction(input: unknown) {
  return runAction(sessionIdSchema, input, (u, d) => timer.skipSession(u.id, d.sessionId));
}
