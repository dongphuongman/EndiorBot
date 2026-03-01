/**
 * Progress Indicators
 *
 * Terminal-based progress bars and spinners for long operations.
 *
 * @module cli/ui/progress
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Progress bar configuration.
 */
export interface ProgressBarConfig {
  /** Total steps */
  total: number;
  /** Width of the progress bar */
  width?: number;
  /** Show percentage */
  showPercent?: boolean;
  /** Show ETA */
  showEta?: boolean;
  /** Filled character */
  filledChar?: string;
  /** Empty character */
  emptyChar?: string;
}

/**
 * Spinner configuration.
 */
export interface SpinnerConfig {
  /** Spinner frames */
  frames?: string[];
  /** Interval between frames in ms */
  interval?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_SPINNER_INTERVAL = 80;

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * Terminal progress bar.
 */
export class ProgressBar {
  private current = 0;
  private readonly config: Required<ProgressBarConfig>;
  private startTime = 0;
  private lastRender = "";

  constructor(config: ProgressBarConfig) {
    this.config = {
      width: 40,
      showPercent: true,
      showEta: true,
      filledChar: "█",
      emptyChar: "░",
      ...config,
    };
    this.startTime = Date.now();
  }

  /**
   * Update progress.
   */
  update(current: number): void {
    this.current = Math.min(current, this.config.total);
    this.render();
  }

  /**
   * Increment by one.
   */
  increment(): void {
    this.update(this.current + 1);
  }

  /**
   * Render the progress bar.
   */
  private render(): void {
    const { total, width, showPercent, showEta, filledChar, emptyChar } = this.config;

    const percent = Math.floor((this.current / total) * 100);
    const filled = Math.floor((this.current / total) * width);
    const empty = width - filled;

    let bar = `[${filledChar.repeat(filled)}${emptyChar.repeat(empty)}]`;

    if (showPercent) {
      bar += ` ${percent.toString().padStart(3)}%`;
    }

    bar += ` ${this.current}/${total}`;

    if (showEta && this.current > 0) {
      const elapsed = Date.now() - this.startTime;
      const rate = this.current / elapsed;
      const remaining = (total - this.current) / rate;
      bar += ` (${this.formatTime(remaining)})`;
    }

    // Only update if changed
    if (bar !== this.lastRender) {
      process.stdout.write(`\r${bar}`);
      this.lastRender = bar;
    }
  }

  /**
   * Format time in ms to human readable.
   */
  private formatTime(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }

  /**
   * Complete and move to next line.
   */
  complete(message?: string): void {
    this.update(this.config.total);
    process.stdout.write("\n");
    if (message) {
      console.log(message);
    }
  }
}

// ============================================================================
// Spinner
// ============================================================================

/**
 * Terminal spinner for indeterminate progress.
 */
export class Spinner {
  private frameIndex = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private message = "";
  private readonly frames: string[];
  private readonly interval: number;

  constructor(config: SpinnerConfig = {}) {
    this.frames = config.frames ?? DEFAULT_SPINNER_FRAMES;
    this.interval = config.interval ?? DEFAULT_SPINNER_INTERVAL;
  }

  /**
   * Start the spinner.
   */
  start(message: string): void {
    this.message = message;
    this.frameIndex = 0;
    this.render();

    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, this.interval);
  }

  /**
   * Update the message.
   */
  update(message: string): void {
    this.message = message;
    this.render();
  }

  /**
   * Render current frame.
   */
  private render(): void {
    const frame = this.frames[this.frameIndex] ?? "⠋";
    process.stdout.write(`\r${frame} ${this.message}`);
  }

  /**
   * Stop with success.
   */
  succeed(message?: string): void {
    this.stop();
    console.log(`\r✅ ${message ?? this.message}`);
  }

  /**
   * Stop with failure.
   */
  fail(message?: string): void {
    this.stop();
    console.log(`\r❌ ${message ?? this.message}`);
  }

  /**
   * Stop with warning.
   */
  warn(message?: string): void {
    this.stop();
    console.log(`\r⚠️ ${message ?? this.message}`);
  }

  /**
   * Stop with info.
   */
  info(message?: string): void {
    this.stop();
    console.log(`\rℹ️ ${message ?? this.message}`);
  }

  /**
   * Stop the spinner.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Clear the line
    process.stdout.write("\r" + " ".repeat(this.message.length + 3) + "\r");
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create and start a spinner.
 */
export function createSpinner(message: string, config?: SpinnerConfig): Spinner {
  const spinner = new Spinner(config);
  spinner.start(message);
  return spinner;
}

/**
 * Create a progress bar.
 */
export function createProgressBar(config: ProgressBarConfig): ProgressBar {
  return new ProgressBar(config);
}

/**
 * Run a task with spinner.
 */
export async function withSpinner<T>(
  message: string,
  task: () => Promise<T>,
  config?: SpinnerConfig
): Promise<T> {
  const spinner = createSpinner(message, config);

  try {
    const result = await task();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

/**
 * Run tasks with progress bar.
 */
export async function withProgress<T>(
  tasks: Array<{ name: string; task: () => Promise<T> }>,
  config?: Partial<ProgressBarConfig>
): Promise<T[]> {
  const progressBar = new ProgressBar({ total: tasks.length, ...config });
  const results: T[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const { name, task } = tasks[i]!;
    process.stdout.write(`\r${name}...`);
    const result = await task();
    results.push(result);
    progressBar.update(i + 1);
  }

  progressBar.complete();
  return results;
}
