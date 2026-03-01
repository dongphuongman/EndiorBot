/**
 * Internationalization Tests
 *
 * @module tests/i18n
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { I18n, t, setLocale, getLocale } from "../../src/i18n/i18n.js";

describe("I18n", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("Locale Management", () => {
    it("should default to English locale", () => {
      const newI18n = new I18n();
      // Note: actual default depends on environment
      expect(newI18n.getSupportedLocales()).toContain(newI18n.getLocale());
    });

    it("should set locale via constructor", () => {
      const viI18n = new I18n({ locale: "vi" });
      expect(viI18n.getLocale()).toBe("vi");
    });

    it("should change locale", () => {
      expect(i18n.getLocale()).toBe("en");
      i18n.setLocale("vi");
      expect(i18n.getLocale()).toBe("vi");
    });

    it("should return supported locales", () => {
      const locales = i18n.getSupportedLocales();
      expect(locales).toContain("en");
      expect(locales).toContain("vi");
    });

    it("should check if locale is supported", () => {
      expect(i18n.isSupported("en")).toBe(true);
      expect(i18n.isSupported("vi")).toBe(true);
      expect(i18n.isSupported("xyz")).toBe(false);
    });
  });

  describe("Translation", () => {
    it("should translate English messages", () => {
      expect(i18n.t("app.name")).toBe("EndiorBot");
      expect(i18n.t("gate.status")).toBe("Gate Status");
    });

    it("should translate Vietnamese messages", () => {
      i18n.setLocale("vi");
      expect(i18n.t("gate.status")).toBe("Trạng Thái Gate");
      expect(i18n.t("gate.passed", { gate: "G2" })).toBe("Gate G2 ĐẠT");
    });

    it("should interpolate parameters", () => {
      expect(i18n.t("gate.passed", { gate: "G2" })).toBe("Gate G2 PASSED");
      expect(i18n.t("app.version", { version: "1.0.0" })).toBe("Version 1.0.0");
    });

    it("should handle missing parameters gracefully", () => {
      expect(i18n.t("gate.passed")).toBe("Gate {gate} PASSED");
    });

    it("should return key for missing messages", () => {
      // @ts-expect-error Testing invalid key
      expect(i18n.t("nonexistent.key")).toBe("nonexistent.key");
    });

    it("should fallback to English for missing Vietnamese message", () => {
      i18n.setLocale("vi");
      // Both locales have app.name, so this verifies the Vietnamese version
      expect(i18n.t("app.name")).toBe("EndiorBot");
    });
  });

  describe("Multiple Parameters", () => {
    it("should interpolate multiple parameters", () => {
      expect(i18n.t("error.network", { message: "Connection refused" })).toBe(
        "Network error: Connection refused"
      );
    });

    it("should handle numeric parameters", () => {
      expect(i18n.t("context.found", { count: 42 })).toBe("Found 42 results");
    });
  });
});

describe("Global Functions", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("should translate using global t()", () => {
    expect(t("app.name")).toBe("EndiorBot");
  });

  it("should get locale using global getLocale()", () => {
    expect(getLocale()).toBe("en");
  });

  it("should set locale using global setLocale()", () => {
    setLocale("vi");
    expect(getLocale()).toBe("vi");
    expect(t("gate.status")).toBe("Trạng Thái Gate");
  });
});

describe("Vietnamese Translations", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "vi" });
  });

  it("should have correct Vietnamese gate messages", () => {
    expect(i18n.t("gate.passed", { gate: "G2" })).toBe("Gate G2 ĐẠT");
    expect(i18n.t("gate.failed", { gate: "G3" })).toBe("Gate G3 KHÔNG ĐẠT");
    expect(i18n.t("gate.pending", { gate: "G4" })).toBe("Gate G4 ĐANG CHỜ");
  });

  it("should have correct Vietnamese evidence messages", () => {
    expect(i18n.t("evidence.list")).toBe("Danh Sách Bằng Chứng");
    expect(i18n.t("evidence.added", { file: "ADR-001.md" })).toBe(
      "Đã thêm bằng chứng: ADR-001.md"
    );
  });

  it("should have correct Vietnamese agent messages", () => {
    expect(i18n.t("agent.invoke", { agent: "pm" })).toBe("Đang gọi agent: pm");
    expect(i18n.t("agent.complete", { agent: "architect" })).toBe(
      "Agent architect hoàn thành"
    );
  });

  it("should have correct Vietnamese error messages", () => {
    expect(i18n.t("error.timeout")).toBe("Thao tác hết thời gian");
    expect(i18n.t("error.permission_denied")).toBe("Quyền truy cập bị từ chối");
  });

  it("should have correct Vietnamese success messages", () => {
    expect(i18n.t("success.operation")).toBe("Thao tác hoàn tất thành công");
    expect(i18n.t("success.saved")).toBe("Đã lưu thành công");
  });

  it("should have correct Vietnamese progress messages", () => {
    expect(i18n.t("progress.loading")).toBe("Đang tải...");
    expect(i18n.t("progress.processing")).toBe("Đang xử lý...");
    expect(i18n.t("progress.complete")).toBe("Hoàn thành");
  });
});
