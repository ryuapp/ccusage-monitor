#!/usr/bin/env node

import process from "node:process";
import { cyan, gray, red, white, yellow } from "enogu";
import * as datetime from "./datetime.ts";
import {
  calculateHourlyBurnRate,
  getNextResetTime,
  getTokenLimit,
  runCcusage,
} from "./core.ts";
import {
  clearBelow,
  createTimeProgressBar,
  createTokenProgressBar,
  initializeTerminal,
  moveCursorToTop,
  printHeader,
  showCursor,
} from "./utils.ts";
import { MonitorOptions } from "./types.ts";
import { parseArgs, showHelp, showVersion, validateArgs } from "./args.ts";

async function main() {
  // Parse command line arguments
  const args = parseArgs(process.argv.slice(2));

  // Handle help and version flags
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Validate arguments
  validateArgs(args);

  const monitorOptions: MonitorOptions = {
    plan: args.plan,
    resetHour: args.resetHour,
    timezone: args.timezone,
  };

  // For 'custom_max' plan, we need to get data first to determine the limit
  let tokenLimit: number;
  if (monitorOptions.plan === "custom_max") {
    const initialData = await runCcusage();
    if (initialData?.blocks) {
      tokenLimit = getTokenLimit(monitorOptions.plan, initialData.blocks);
    } else {
      tokenLimit = getTokenLimit("pro"); // Fallback to pro
    }
  } else {
    tokenLimit = getTokenLimit(monitorOptions.plan);
  }

  try {
    // Initial screen setup
    initializeTerminal();

    // Set up signal handlers for graceful exit
    const cleanup = () => {
      showCursor();
      console.log(`\n\n${cyan("Monitoring stopped.")}`);
      // Clear the terminal
      process.stdout.write("\x1b[2J\x1b[H");
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    while (true) {
      // Move cursor to top without clearing
      moveCursorToTop();

      const data = await runCcusage();
      if (!data?.blocks) {
        console.log("Failed to get usage data");
        await sleep(3000);
        continue;
      }

      // Find the active block
      const activeBlock = data.blocks.find((block) => block.isActive);
      if (!activeBlock) {
        console.log("No active session found");
        await sleep(3000);
        continue;
      }

      // Extract data from active block
      const tokensUsed = activeBlock.totalTokens || 0;

      // Check if tokens exceed limit and switch to custom_max if needed
      if (tokensUsed > tokenLimit && monitorOptions.plan === "pro") {
        // Auto-switch to custom_max when pro limit is exceeded
        const newLimit = getTokenLimit("custom_max", data.blocks);
        if (newLimit > tokenLimit) {
          tokenLimit = newLimit;
        }
      }

      const usagePercentage = tokenLimit > 0
        ? (tokensUsed / tokenLimit) * 100
        : 0;
      const tokensLeft = tokenLimit - tokensUsed;

      // Time calculations
      const startTimeStr = activeBlock.startTime;
      let elapsedMinutes = 0;
      let currentTime: datetime.DateTime = datetime.now();

      if (startTimeStr) {
        const startTime = datetime.fromISO(startTimeStr);
        const zoneName = datetime.getZoneName(startTime);
        if (zoneName) {
          currentTime = datetime.setZone(datetime.now(), zoneName);
        }
        const elapsed = datetime.diff(currentTime, startTime, "minutes");
        elapsedMinutes = elapsed.minutes;
      }

      const sessionDuration = 300; // 5 hours in minutes

      // Calculate burn rate from ALL sessions in the last hour
      const burnRate = calculateHourlyBurnRate(data.blocks, currentTime);

      // Reset time calculation - use fixed schedule or custom hour with timezone
      const resetTime = getNextResetTime(
        currentTime,
        monitorOptions.resetHour,
        monitorOptions.timezone,
      );

      // Predicted end calculation - when tokens will run out based on burn rate
      let predictedEndTime: datetime.DateTime;
      if (burnRate > 0 && tokensLeft > 0) {
        const minutesToDepletion = tokensLeft / burnRate;
        predictedEndTime = datetime.plus(currentTime, {
          minutes: minutesToDepletion,
        });
      } else {
        // If no burn rate or tokens already depleted, use reset time
        predictedEndTime = resetTime;
      }

      // Display header
      printHeader();

      // Token Usage section
      console.log(
        `📊 ${white("Token Usage:")}    ${
          createTokenProgressBar(usagePercentage)
        }`,
      );
      console.log();

      // Time to Reset section - use elapsed time from session start for progress
      // Show how much of the 5-hour session has elapsed
      console.log(
        `⏳ ${white("Time to Reset:")}  ${
          createTimeProgressBar(elapsedMinutes, sessionDuration)
        }`,
      );
      console.log();

      // Detailed stats
      console.log(
        `🎯 ${white("Tokens:")}         ${
          white(tokensUsed.toLocaleString())
        } / ${gray(`~${tokenLimit.toLocaleString()}`)} (${
          cyan(`${tokensLeft.toLocaleString()} left`)
        }) ${gray(`[${monitorOptions.plan}]`)}`,
      );
      console.log(
        `🔥 ${white("Burn Rate:")}      ${
          yellow(
            burnRate.toFixed(1),
          )
        } ${gray("tokens/min")}`,
      );
      console.log();

      // Predictions - convert to configured timezone for display
      const targetTimezone = monitorOptions.timezone;
      const predictedEndLocal = datetime.setZone(
        predictedEndTime,
        targetTimezone,
      );
      const resetTimeLocal = datetime.setZone(resetTime, targetTimezone);

      const predictedEndStr = datetime.toFormat(predictedEndLocal, "HH:mm");
      const resetTimeStr = datetime.toFormat(resetTimeLocal, "HH:mm");
      console.log(`🏁 ${white("Predicted End:")} ${predictedEndStr}`);
      console.log(`🔄 ${white("Token Reset:")}   ${resetTimeStr}`);
      console.log();

      // Show notification if we switched to custom_max
      const showSwitchNotification = tokensUsed > 7000 &&
        monitorOptions.plan === "pro" && tokenLimit > 7000;

      // Notification when tokens exceed max limit
      const showExceedNotification = tokensUsed > tokenLimit;

      // Show notifications
      if (showSwitchNotification) {
        console.log(
          `🔄 ${
            yellow(
              `Tokens exceeded Pro limit - switched to custom_max (${tokenLimit.toLocaleString()})`,
            )
          }`,
        );
        console.log();
      }

      if (showExceedNotification) {
        console.log(
          `🚨 ${
            red(
              `TOKENS EXCEEDED MAX LIMIT! (${tokensUsed.toLocaleString()} > ${tokenLimit.toLocaleString()})`,
            )
          }`,
        );
        console.log();
      }

      // Warning if tokens will run out before reset
      if (datetime.valueOf(predictedEndTime) < datetime.valueOf(resetTime)) {
        console.log(`⚠️  ${red("Tokens will run out BEFORE reset!")}`);
        console.log();
      }

      // Status line
      const currentTimeStr = datetime.toFormat(datetime.now(), "HH:mm:ss");
      console.log(
        `⏰ ${gray(currentTimeStr)} 📝 ${cyan("Smooth sailing...")} | ${
          gray("Ctrl+C to exit")
        } 🟨`,
      );

      // Clear any remaining lines below to prevent artifacts
      clearBelow();

      await sleep(3000);
    }
  } catch (error) {
    // Show cursor on any error
    showCursor();
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the main function
await main();
