/**
 * EndiorBot Configuration Types
 *
 * Minimal types for Phase 2.1 - will be expanded as more modules are migrated.
 */

export type GatewayConfig = {
  /** Gateway server port. Default: 18790 */
  port?: number;
  /** Gateway host binding. Default: "127.0.0.1" */
  host?: string;
};

export type EndiorBotConfig = {
  meta?: {
    /** Last EndiorBot version that wrote this config. */
    lastTouchedVersion?: string;
    /** ISO timestamp when this config was last written. */
    lastTouchedAt?: string;
  };
  gateway?: GatewayConfig;
};
