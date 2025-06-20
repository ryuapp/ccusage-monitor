import process from "node:process";
import { blue, brightBlue, brightGreen, brightRed, cyan } from "enogu";

/**
 * Format minutes into human-readable time (e.g., '3h 45m')
 */
export function formatTime(minutes: number): string {
  if (minutes < 60) {
    return `${Math.floor(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

/**
 * Create a token usage progress bar with bracket style
 */
export function createTokenProgressBar(
  percentage: number,
  width: number = 50,
): string {
  // Clamp percentage between 0 and 100
  const clampedPercentage = Math.max(0, Math.min(100, percentage));
  const filled = Math.floor(width * clampedPercentage / 100);

  // Create the bar with green fill and red empty space
  const greenBar = "█".repeat(filled);
  const redBar = "░".repeat(width - filled);

  return `🟢 [${brightGreen(greenBar)}${brightRed(redBar)}] ${
    percentage.toFixed(1)
  }%`;
}

/**
 * Create a time progress bar showing time until reset
 */
export function createTimeProgressBar(
  elapsedMinutes: number,
  totalMinutes: number,
  width: number = 50,
): string {
  const percentage = totalMinutes <= 0
    ? 0
    : Math.min(100, (elapsedMinutes / totalMinutes) * 100);
  const filled = Math.floor(width * percentage / 100);

  // Create the bar with blue fill and red empty space
  const blueBar = "█".repeat(filled);
  const redBar = "░".repeat(width - filled);

  const remainingTime = formatTime(Math.max(0, totalMinutes - elapsedMinutes));
  return `⏰ [${brightBlue(blueBar)}${brightRed(redBar)}] ${remainingTime}`;
}

/**
 * Print the stylized header with sparkles
 */
export function printHeader(): void {
  // Sparkle pattern
  const sparkles = `${cyan("✦ ✧ ✦ ✧ ")}`;

  console.log(`${sparkles}${cyan("CLAUDE CODE USAGE MONITOR")} ${sparkles}`);
  console.log(`${blue("=".repeat(60))}`);
  console.log();
}

/**
 * Get velocity indicator based on burn rate
 */
export function getVelocityIndicator(burnRate: number): string {
  if (burnRate < 50) {
    return "🐌"; // Slow
  } else if (burnRate < 150) {
    return "➡️"; // Normal
  } else if (burnRate < 300) {
    return "🚀"; // Fast
  } else {
    return "⚡"; // Very fast
  }
}

/**
 * Clear terminal and hide cursor
 */
export function initializeTerminal(): void {
  // Clear screen
  process.stdout.write("\x1b[2J");
  // Hide cursor
  process.stdout.write("\x1b[?25l");
}

/**
 * Move cursor to top without clearing
 */
export function moveCursorToTop(): void {
  process.stdout.write("\x1b[H");
}

/**
 * Show cursor (for cleanup)
 */
export function showCursor(): void {
  process.stdout.write("\x1b[?25h");
}

/**
 * Clear remaining lines below to prevent artifacts
 */
export function clearBelow(): void {
  process.stdout.write("\x1b[J");
}
