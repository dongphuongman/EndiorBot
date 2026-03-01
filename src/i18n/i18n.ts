/**
 * Internationalization Core
 *
 * Core i18n functionality with locale switching and message formatting.
 *
 * @module i18n/i18n
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import { messages, type MessageKey } from "./messages.js";

// ============================================================================
// Types
// ============================================================================

export type Locale = keyof typeof messages;

interface I18nConfig {
  /** Default locale */
  locale: Locale;
  /** Fallback locale if message not found */
  fallbackLocale: Locale;
}

// ============================================================================
// I18n Class
// ============================================================================

/**
 * Internationalization manager.
 */
export class I18n {
  private config: I18nConfig;

  constructor(config: Partial<I18nConfig> = {}) {
    this.config = {
      locale: config.locale ?? detectLocale(),
      fallbackLocale: config.fallbackLocale ?? "en",
    };
  }

  /**
   * Get current locale.
   */
  getLocale(): Locale {
    return this.config.locale;
  }

  /**
   * Set current locale.
   */
  setLocale(locale: Locale): void {
    if (locale in messages) {
      this.config.locale = locale;
    }
  }

  /**
   * Translate a message key with optional parameters.
   */
  t(key: MessageKey, params?: Record<string, string | number>): string {
    // Try current locale
    let message = messages[this.config.locale][key];

    // Fallback to default locale
    if (!message && this.config.locale !== this.config.fallbackLocale) {
      message = messages[this.config.fallbackLocale][key];
    }

    // Return key if not found
    if (!message) {
      return key;
    }

    // Replace parameters
    if (params) {
      return this.interpolate(message, params);
    }

    return message;
  }

  /**
   * Interpolate parameters into message.
   */
  private interpolate(
    message: string,
    params: Record<string, string | number>
  ): string {
    return message.replace(/\{(\w+)\}/g, (_, key) => {
      const value = params[key];
      return value !== undefined ? String(value) : `{${key}}`;
    });
  }

  /**
   * Check if locale is supported.
   */
  isSupported(locale: string): locale is Locale {
    return locale in messages;
  }

  /**
   * Get all supported locales.
   */
  getSupportedLocales(): Locale[] {
    return Object.keys(messages) as Locale[];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const i18n = new I18n();

/**
 * Translate a message key.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return i18n.t(key, params);
}

/**
 * Set current locale.
 */
export function setLocale(locale: Locale): void {
  i18n.setLocale(locale);
}

/**
 * Get current locale.
 */
export function getLocale(): Locale {
  return i18n.getLocale();
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Detect locale from environment.
 */
function detectLocale(): Locale {
  // Check ENDIORBOT_LOCALE environment variable
  const envLocale = process.env.ENDIORBOT_LOCALE;
  if (envLocale && envLocale in messages) {
    return envLocale as Locale;
  }

  // Check LANG environment variable
  const lang = process.env.LANG ?? process.env.LANGUAGE ?? "";
  const langCode = lang.split(/[_.]/)[0]?.toLowerCase();

  if (langCode && langCode in messages) {
    return langCode as Locale;
  }

  // Default to English
  return "en";
}
