import { spawn } from "node:child_process";
import * as datetime from "./datetime.ts";
import { CcusageBlock, CcusageData, PlanType, TokenUsage } from "./types.ts";

/**
 * Execute ccusage blocks --json command and return parsed JSON data
 */
export function runCcusage(): Promise<CcusageData | null> {
  return new Promise((resolve) => {
    const child = spawn("ccusage", ["blocks", "--json"]);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`Error running ccusage: ${stderr}`);
        resolve(null);
        return;
      }

      try {
        const data = JSON.parse(stdout) as CcusageData;
        resolve(data);
      } catch (error) {
        console.error(`Error parsing JSON: ${error}`);
        resolve(null);
      }
    });

    child.on("error", (error) => {
      console.error(`Error running ccusage: ${error.message}`);
      resolve(null);
    });
  });
}

/**
 * Calculate burn rate based on all sessions in the last hour
 */
export function calculateHourlyBurnRate(
  blocks: CcusageBlock[],
  currentTime: datetime.DateTime,
): number {
  if (!blocks || blocks.length === 0) {
    return 0;
  }

  const oneHourAgo = datetime.minus(currentTime, { hours: 1 });
  let totalTokens = 0;

  for (const block of blocks) {
    const startTimeStr = block.startTime;
    if (!startTimeStr) {
      continue;
    }

    // Parse start time - handle both 'Z' and timezone formats
    const startTime = datetime.fromISO(startTimeStr);

    // Skip gaps
    if (block.isGap) {
      continue;
    }

    // Determine session end time
    let sessionActualEnd: datetime.DateTime;
    if (block.isActive) {
      // For active sessions, use current time
      sessionActualEnd = currentTime;
    } else {
      // For completed sessions, use actualEndTime or current time
      const actualEndStr = block.actualEndTime;
      if (actualEndStr) {
        sessionActualEnd = datetime.fromISO(actualEndStr);
      } else {
        sessionActualEnd = currentTime;
      }
    }

    // Check if session overlaps with the last hour
    if (datetime.valueOf(sessionActualEnd) < datetime.valueOf(oneHourAgo)) {
      // Session ended before the last hour
      continue;
    }

    // Calculate how much of this session falls within the last hour
    const sessionStartInHour =
      datetime.valueOf(startTime) > datetime.valueOf(oneHourAgo)
        ? startTime
        : oneHourAgo;
    const sessionEndInHour =
      datetime.valueOf(sessionActualEnd) < datetime.valueOf(currentTime)
        ? sessionActualEnd
        : currentTime;

    if (
      datetime.valueOf(sessionEndInHour) <= datetime.valueOf(sessionStartInHour)
    ) {
      continue;
    }

    // Calculate portion of tokens used in the last hour
    const totalSessionDuration =
      datetime.diff(sessionActualEnd, startTime, "minutes").minutes;
    const hourDuration =
      datetime.diff(sessionEndInHour, sessionStartInHour, "minutes").minutes;

    if (totalSessionDuration > 0 && hourDuration > 0) {
      const sessionTokens = block.totalTokens || 0;
      const tokensInHour = sessionTokens *
        (hourDuration / totalSessionDuration);
      totalTokens += tokensInHour;
    }
  }

  // Return tokens per minute
  return totalTokens > 0 ? totalTokens / 60 : 0;
}

/**
 * Calculate next token reset time based on fixed 5-hour intervals
 * Default reset times in specified timezone: 04:00, 09:00, 14:00, 18:00, 23:00
 * Or use custom reset hour if provided
 */
export function getNextResetTime(
  currentTime: datetime.DateTime,
  customResetHour?: number,
  timezoneStr?: string,
): datetime.DateTime {
  // Use system timezone if not provided
  const timezone = timezoneStr ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Convert to specified timezone
  let targetTime: datetime.DateTime;
  try {
    targetTime = datetime.setZone(currentTime, timezone);
  } catch {
    console.warn(
      `Warning: Unknown timezone '${timezone}', using UTC`,
    );
    targetTime = datetime.setZone(currentTime, "UTC");
  }

  const resetHours = customResetHour !== undefined
    ? [customResetHour]
    : [4, 9, 14, 18, 23];

  // Get current hour and minute
  const currentHour = datetime.getHour(targetTime);
  const currentMinute = datetime.getMinute(targetTime);

  // Find next reset hour
  let nextResetHour: number | null = null;
  for (const hour of resetHours) {
    if (currentHour < hour || (currentHour === hour && currentMinute === 0)) {
      nextResetHour = hour;
      break;
    }
  }

  // If no reset hour found today, use first one tomorrow
  let nextReset: datetime.DateTime;
  if (nextResetHour === null) {
    nextResetHour = resetHours[0];
    nextReset = datetime.set(
      datetime.startOf(datetime.plus(targetTime, { days: 1 }), "day"),
      {
        hour: nextResetHour,
      },
    );
  } else {
    nextReset = datetime.set(datetime.startOf(targetTime, "day"), {
      hour: nextResetHour,
    });
  }

  // Convert back to the original timezone if needed
  const currentZone = datetime.getZoneName(currentTime);
  const targetZone = datetime.getZoneName(targetTime);
  if (currentZone && currentZone !== targetZone) {
    nextReset = datetime.setZone(nextReset, currentZone);
  }

  return nextReset;
}

/**
 * Get token limit based on plan type
 */
export function getTokenLimit(plan: PlanType, blocks?: CcusageBlock[]): number {
  if (plan === "custom_max" && blocks) {
    // Find the highest token count from all previous blocks
    let maxTokens = 0;
    for (const block of blocks) {
      if (!block.isGap && !block.isActive) {
        const tokens = block.totalTokens || 0;
        if (tokens > maxTokens) {
          maxTokens = tokens;
        }
      }
    }
    // Return the highest found, or default to pro if none found
    return maxTokens > 0 ? maxTokens : 7000;
  }

  const limits: Record<PlanType, number> = {
    pro: 7000,
    max5: 35000,
    max20: 140000,
    custom_max: 7000, // fallback
  };

  return limits[plan] || 7000;
}

/**
 * Calculate comprehensive token usage statistics from blocks
 */
export function calculateTokenUsage(blocks: CcusageBlock[]): TokenUsage {
  if (!blocks || blocks.length === 0) {
    return {
      totalTokensUsed: 0,
      activeSessionTokens: 0,
      completedSessionTokens: 0,
      lastSessionTokens: 0,
      averageTokensPerSession: 0,
    };
  }

  let totalTokensUsed = 0;
  let activeSessionTokens = 0;
  let completedSessionTokens = 0;
  let lastSessionTokens = 0;
  let sessionCount = 0;
  let lastSessionTime: datetime.DateTime | null = null;

  for (const block of blocks) {
    // Skip gaps
    if (block.isGap) {
      continue;
    }

    const tokens = block.totalTokens || 0;
    totalTokensUsed += tokens;

    if (block.isActive) {
      activeSessionTokens += tokens;
    } else {
      completedSessionTokens += tokens;
    }

    // Track last session (most recent by start time)
    if (block.startTime) {
      const startTime = datetime.fromISO(block.startTime);
      if (!lastSessionTime || startTime > lastSessionTime) {
        lastSessionTime = startTime;
        lastSessionTokens = tokens;
      }
    }

    sessionCount++;
  }

  const averageTokensPerSession = sessionCount > 0
    ? Math.round(totalTokensUsed / sessionCount)
    : 0;

  return {
    totalTokensUsed,
    activeSessionTokens,
    completedSessionTokens,
    lastSessionTokens,
    averageTokensPerSession,
  };
}
