import { PlanType } from "./types.ts";
import process from "node:process";

export interface ParsedArgs {
  plan: PlanType;
  resetHour?: number;
  timezone: string;
  help: boolean;
  version: boolean;
}

/**
 * Get the system timezone using Intl API with fallback
 */
function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    console.warn("Warning: Could not detect system timezone, using UTC");
    return "UTC";
  }
}

/**
 * Parse command line arguments
 */
export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    plan: "pro",
    resetHour: undefined,
    timezone: getSystemTimezone(),
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--plan":
      case "-p":
        if (nextArg && !nextArg.startsWith("-")) {
          result.plan = nextArg as PlanType;
          i++; // Skip next argument as it's the value
        }
        break;

      case "--reset-hour":
      case "-r":
        if (nextArg && !nextArg.startsWith("-")) {
          const hour = parseInt(nextArg, 10);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            result.resetHour = hour;
          } else {
            console.error("Error: reset-hour must be a number between 0-23");
            process.exit(1);
          }
          i++; // Skip next argument as it's the value
        }
        break;

      case "--timezone":
      case "-t":
        if (nextArg && !nextArg.startsWith("-")) {
          result.timezone = nextArg;
          i++; // Skip next argument as it's the value
        }
        break;

      case "--help":
      case "-h":
        result.help = true;
        break;

      case "--version":
      case "-v":
        result.version = true;
        break;

      default:
        // Handle combined short flags like -p=value
        if (arg.startsWith("-p=")) {
          result.plan = arg.substring(3) as PlanType;
        } else if (arg.startsWith("-r=")) {
          const hour = parseInt(arg.substring(3), 10);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            result.resetHour = hour;
          } else {
            console.error("Error: reset-hour must be a number between 0-23");
            process.exit(1);
          }
        } else if (arg.startsWith("-t=")) {
          result.timezone = arg.substring(3);
        } else if (arg.startsWith("--plan=")) {
          result.plan = arg.substring(7) as PlanType;
        } else if (arg.startsWith("--reset-hour=")) {
          const hour = parseInt(arg.substring(13), 10);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            result.resetHour = hour;
          } else {
            console.error("Error: reset-hour must be a number between 0-23");
            process.exit(1);
          }
        } else if (arg.startsWith("--timezone=")) {
          result.timezone = arg.substring(11);
        } else if (arg.startsWith("-") && !arg.startsWith("--")) {
          console.error(`Error: Unknown short flag: ${arg}`);
          process.exit(1);
        } else if (arg.startsWith("--")) {
          console.error(`Error: Unknown flag: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }

  return result;
}

/**
 * Validate parsed arguments
 */
export function validateArgs(args: ParsedArgs): void {
  const validPlans: PlanType[] = ["pro", "max5", "max20", "custom_max"];
  if (!validPlans.includes(args.plan)) {
    console.error(
      `Error: Invalid plan type: ${args.plan}. Valid options: ${
        validPlans.join(", ")
      }`,
    );
    process.exit(1);
  }
}

/**
 * Show help message
 */
export function showHelp(): void {
  console.log(`Claude Code Usage Monitor - Real-time token usage monitoring

USAGE:
  ccusage-monitor [OPTIONS]

OPTIONS:
  -p, --plan <PLAN>         Claude plan type (pro, max5, max20, custom_max) [default: pro]
  -r, --reset-hour <HOUR>   Change the reset hour (0-23) for daily limits
  -t, --timezone <TZ>       Timezone for reset times [default: auto-detected]
  -h, --help               Display this help message
  -v, --version            Display version information

EXAMPLES:
  ccusage-monitor                          # Use default pro plan
  ccusage-monitor --plan max5              # Use max5 plan
  ccusage-monitor --plan max20 --timezone UTC  # Use max20 plan with UTC timezone
  ccusage-monitor -p custom_max -r 9       # Use custom_max plan with 9 AM reset`);
}

/**
 * Show version information
 */
export function showVersion(): void {
  console.log("ccusage-monitor v0.0.0");
}
