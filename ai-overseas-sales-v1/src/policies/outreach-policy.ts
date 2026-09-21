import { env } from "../config.js";

export type OutreachPolicyInput = {
  sentToday: number;
  isBlacklisted: boolean;
  hasValidConsentOrLegitimateBasis?: boolean;
};

export function canSend(input: OutreachPolicyInput) {
  if (input.isBlacklisted) {
    return { allowed: false, reason: "BLACKLISTED" as const };
  }

  if (input.sentToday >= env.OUTREACH_DAILY_LIMIT) {
    return { allowed: false, reason: "DAILY_LIMIT_REACHED" as const };
  }

  return { allowed: true, reason: "OK" as const };
}

export function nextDelayMs() {
  const min = env.OUTREACH_MIN_DELAY_SECONDS;
  const max = Math.max(min, env.OUTREACH_MAX_DELAY_SECONDS);
  const seconds = Math.floor(Math.random() * (max - min + 1)) + min;
  return seconds * 1000;
}
