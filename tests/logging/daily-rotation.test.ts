/**
 * Daily Rotation Tests
 *
 * Tests for daily file rotation transport.
 *
 * @module tests/logging/daily-rotation.test
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 4
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DailyFileTransport } from "../../src/logging/transports.js";

describe("DailyFileTransport", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-rotation-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create log file with date in filename", async () => {
    const transport = new DailyFileTransport({
      directory: tempDir,
      filename: "app",
    });

    transport.write("info", "Test message");
    await transport.flush();
    await transport.close();

    // Check that a dated file exists
    const files = fs.readdirSync(tempDir);
    const logFiles = files.filter((f) => f.endsWith(".log"));

    expect(logFiles.length).toBeGreaterThan(0);

    // File should match pattern app-YYYY-MM-DD.log
    const datePattern = /^app-\d{4}-\d{2}-\d{2}\.log$/;
    expect(logFiles.some((f) => datePattern.test(f))).toBe(true);
  });

  it("should write to correct dated file", async () => {
    const transport = new DailyFileTransport({
      directory: tempDir,
      filename: "test",
    });

    const testMessage = "Daily rotation test message";
    transport.write("info", testMessage);
    await transport.flush();
    await transport.close();

    // Find and read the log file
    const files = fs.readdirSync(tempDir);
    const logFile = files.find((f) => f.startsWith("test-") && f.endsWith(".log"));
    expect(logFile).toBeDefined();

    const content = fs.readFileSync(path.join(tempDir, logFile!), "utf-8");
    expect(content).toContain(testMessage);
  });

  it("should append to existing file on same day", async () => {
    const transport = new DailyFileTransport({
      directory: tempDir,
      filename: "append",
    });

    transport.write("info", "First message");
    transport.write("info", "Second message");
    await transport.flush();
    await transport.close();

    // Find and read the log file
    const files = fs.readdirSync(tempDir);
    const logFile = files.find((f) => f.startsWith("append-") && f.endsWith(".log"));
    expect(logFile).toBeDefined();

    const content = fs.readFileSync(path.join(tempDir, logFile!), "utf-8");
    expect(content).toContain("First message");
    expect(content).toContain("Second message");
  });

  it("should use default filename if not provided", async () => {
    const transport = new DailyFileTransport({
      directory: tempDir,
    });

    transport.write("info", "Default filename test");
    await transport.flush();
    await transport.close();

    // Should use "endiorbot" as default filename
    const files = fs.readdirSync(tempDir);
    const logFile = files.find((f) => f.startsWith("endiorbot-") && f.endsWith(".log"));
    expect(logFile).toBeDefined();
  });

  it("should create directory if it does not exist", async () => {
    const nestedDir = path.join(tempDir, "nested", "logs");

    const transport = new DailyFileTransport({
      directory: nestedDir,
      filename: "test",
    });

    expect(fs.existsSync(nestedDir)).toBe(true);

    transport.write("info", "Nested dir test");
    await transport.flush();
    await transport.close();
  });
});
