/**
 * CLI Formatting Tests
 *
 * @module tests/cli/ui/format
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import { describe, it, expect } from "vitest";
import {
  formatTable,
  formatBox,
  formatList,
  formatNumberedList,
  formatTree,
  formatDuration,
  formatBytes,
  formatRelativeTime,
} from "../../../src/cli/ui/format.js";

describe("CLI Formatting", () => {
  describe("formatTable", () => {
    it("should format a simple table", () => {
      const result = formatTable({
        headers: ["Name", "Age"],
        rows: [
          ["Alice", "30"],
          ["Bob", "25"],
        ],
      });

      expect(result).toContain("Name");
      expect(result).toContain("Age");
      expect(result).toContain("Alice");
      expect(result).toContain("30");
    });
  });

  describe("formatBox", () => {
    it("should format text in a box", () => {
      const result = formatBox("Hello World");

      expect(result).toContain("┌");
      expect(result).toContain("┐");
      expect(result).toContain("└");
      expect(result).toContain("┘");
      expect(result).toContain("Hello World");
    });

    it("should support different box styles", () => {
      const rounded = formatBox("Test", "rounded");
      expect(rounded).toContain("╭");

      const double = formatBox("Test", "double");
      expect(double).toContain("╔");
    });
  });

  describe("formatList", () => {
    it("should format a bullet list", () => {
      const result = formatList(["Item 1", "Item 2", "Item 3"]);

      expect(result).toContain("• Item 1");
      expect(result).toContain("• Item 2");
      expect(result).toContain("• Item 3");
    });

    it("should support custom bullets", () => {
      const result = formatList(["Item 1"], "-");
      expect(result).toContain("- Item 1");
    });
  });

  describe("formatNumberedList", () => {
    it("should format a numbered list", () => {
      const result = formatNumberedList(["First", "Second", "Third"]);

      expect(result).toContain("1. First");
      expect(result).toContain("2. Second");
      expect(result).toContain("3. Third");
    });
  });

  describe("formatTree", () => {
    it("should format a tree structure", () => {
      const result = formatTree([
        {
          label: "Root",
          children: [
            { label: "Child 1" },
            { label: "Child 2" },
          ],
        },
      ]);

      expect(result).toContain("Root");
      expect(result).toContain("Child 1");
      expect(result).toContain("Child 2");
      expect(result).toContain("├── ");
      expect(result).toContain("└── ");
    });
  });

  describe("formatDuration", () => {
    it("should format milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("should format seconds", () => {
      expect(formatDuration(2500)).toBe("2.5s");
    });

    it("should format minutes", () => {
      expect(formatDuration(125000)).toBe("2m 5s");
    });
  });

  describe("formatBytes", () => {
    it("should format bytes", () => {
      expect(formatBytes(512)).toBe("512.0 B");
    });

    it("should format kilobytes", () => {
      expect(formatBytes(2048)).toBe("2.0 KB");
    });

    it("should format megabytes", () => {
      expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    });
  });

  describe("formatRelativeTime", () => {
    it("should format seconds ago", () => {
      const result = formatRelativeTime(Date.now() - 30 * 1000);
      expect(result).toContain("second");
    });

    it("should format minutes ago", () => {
      const result = formatRelativeTime(Date.now() - 5 * 60 * 1000);
      expect(result).toContain("minute");
    });

    it("should format hours ago", () => {
      const result = formatRelativeTime(Date.now() - 3 * 60 * 60 * 1000);
      expect(result).toContain("hour");
    });

    it("should format days ago", () => {
      const result = formatRelativeTime(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(result).toContain("day");
    });
  });
});
