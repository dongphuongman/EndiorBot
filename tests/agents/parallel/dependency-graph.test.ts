/**
 * Dependency Graph Tests
 *
 * @module tests/agents/parallel/dependency-graph
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DependencyGraph,
  createDependencyGraph,
  createDependencyGraphFromTasks,
} from "../../../src/agents/parallel/dependency-graph.js";
import type { ParallelTask } from "../../../src/agents/types.js";

describe("DependencyGraph", () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = createDependencyGraph();
  });

  describe("addTask", () => {
    it("should add task to graph", () => {
      const task: ParallelTask = {
        id: "task-1",
        name: "Test Task",
        type: "code_gen",
        complexity: "simple",
        query: "test query",
      };

      graph.addTask(task);

      expect(graph.size).toBe(1);
      expect(graph.getTask("task-1")).toBeDefined();
    });

    it("should track explicit dependencies", () => {
      const task1: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query 1",
      };

      const task2: ParallelTask = {
        id: "task-2",
        name: "Task 2",
        type: "code_gen",
        complexity: "simple",
        query: "query 2",
        dependsOn: ["task-1"],
      };

      graph.addTask(task1);
      graph.addTask(task2);

      const node1 = graph.getTask("task-1")!;
      const node2 = graph.getTask("task-2")!;

      expect(node2.dependencies.has("task-1")).toBe(true);
      expect(node1.dependents.has("task-2")).toBe(true);
    });

    it("should track file reads/writes", () => {
      const task: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query",
        reads: ["/src/file1.ts"],
        writes: ["/src/file2.ts"],
      };

      graph.addTask(task);

      const node = graph.getTask("task-1")!;
      expect(node.reads.has("/src/file1.ts")).toBe(true);
      expect(node.writes.has("/src/file2.ts")).toBe(true);
    });

    it("should infer dependencies from file operations", () => {
      const writer: ParallelTask = {
        id: "writer",
        name: "Writer",
        type: "code_gen",
        complexity: "simple",
        query: "write",
        writes: ["/src/shared.ts"],
      };

      const reader: ParallelTask = {
        id: "reader",
        name: "Reader",
        type: "code_gen",
        complexity: "simple",
        query: "read",
        reads: ["/src/shared.ts"],
      };

      graph.addTask(writer);
      graph.addTask(reader);

      const readerNode = graph.getTask("reader")!;
      expect(readerNode.dependencies.has("writer")).toBe(true);
    });
  });

  describe("removeTask", () => {
    it("should remove task from graph", () => {
      const task: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query",
      };

      graph.addTask(task);
      const removed = graph.removeTask("task-1");

      expect(removed).toBe(true);
      expect(graph.size).toBe(0);
    });

    it("should update dependents when task removed", () => {
      const task1: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query 1",
      };

      const task2: ParallelTask = {
        id: "task-2",
        name: "Task 2",
        type: "code_gen",
        complexity: "simple",
        query: "query 2",
        dependsOn: ["task-1"],
      };

      graph.addTask(task1);
      graph.addTask(task2);
      graph.removeTask("task-1");

      const node2 = graph.getTask("task-2")!;
      expect(node2.dependencies.has("task-1")).toBe(false);
    });
  });

  describe("getReadyTasks", () => {
    it("should return tasks with no dependencies", () => {
      const task1: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query 1",
      };

      const task2: ParallelTask = {
        id: "task-2",
        name: "Task 2",
        type: "code_gen",
        complexity: "simple",
        query: "query 2",
        dependsOn: ["task-1"],
      };

      graph.addTask(task1);
      graph.addTask(task2);

      const ready = graph.getReadyTasks();
      expect(ready.length).toBe(1);
      expect(ready[0]!.task.id).toBe("task-1");
    });

    it("should return tasks with completed dependencies", () => {
      const task1: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query 1",
      };

      const task2: ParallelTask = {
        id: "task-2",
        name: "Task 2",
        type: "code_gen",
        complexity: "simple",
        query: "query 2",
        dependsOn: ["task-1"],
      };

      graph.addTask(task1);
      graph.addTask(task2);
      graph.updateStatus("task-1", "completed");

      const ready = graph.getReadyTasks();
      expect(ready.length).toBe(1);
      expect(ready[0]!.task.id).toBe("task-2");
    });

    it("should sort by priority", () => {
      const low: ParallelTask = {
        id: "low",
        name: "Low",
        type: "code_gen",
        complexity: "simple",
        query: "query",
        priority: 1,
      };

      const high: ParallelTask = {
        id: "high",
        name: "High",
        type: "code_gen",
        complexity: "simple",
        query: "query",
        priority: 10,
      };

      graph.addTask(low);
      graph.addTask(high);

      const ready = graph.getReadyTasks();
      expect(ready[0]!.task.id).toBe("high");
    });
  });

  describe("detectCircularDependencies", () => {
    it("should detect simple circular dependency", () => {
      const task1: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query 1",
        dependsOn: ["task-2"],
      };

      const task2: ParallelTask = {
        id: "task-2",
        name: "Task 2",
        type: "code_gen",
        complexity: "simple",
        query: "query 2",
        dependsOn: ["task-1"],
      };

      graph.addTask(task1);
      graph.addTask(task2);

      const conflicts = graph.detectCircularDependencies();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0]!.type).toBe("circular");
    });

    it("should return empty for acyclic graph", () => {
      const task1: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query 1",
      };

      const task2: ParallelTask = {
        id: "task-2",
        name: "Task 2",
        type: "code_gen",
        complexity: "simple",
        query: "query 2",
        dependsOn: ["task-1"],
      };

      graph.addTask(task1);
      graph.addTask(task2);

      const conflicts = graph.detectCircularDependencies();
      expect(conflicts.length).toBe(0);
    });
  });

  describe("detectWriteConflicts", () => {
    it("should detect concurrent writers", () => {
      const task1: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query 1",
        writes: ["/shared/file.ts"],
      };

      const task2: ParallelTask = {
        id: "task-2",
        name: "Task 2",
        type: "code_gen",
        complexity: "simple",
        query: "query 2",
        writes: ["/shared/file.ts"],
      };

      graph.addTask(task1);
      graph.addTask(task2);

      const conflicts = graph.detectWriteConflicts();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0]!.type).toBe("write-write");
    });

    it("should not flag dependent writers", () => {
      const task1: ParallelTask = {
        id: "task-1",
        name: "Task 1",
        type: "code_gen",
        complexity: "simple",
        query: "query 1",
        writes: ["/shared/file.ts"],
      };

      const task2: ParallelTask = {
        id: "task-2",
        name: "Task 2",
        type: "code_gen",
        complexity: "simple",
        query: "query 2",
        writes: ["/shared/file.ts"],
        dependsOn: ["task-1"],
      };

      graph.addTask(task1);
      graph.addTask(task2);

      const conflicts = graph.detectWriteConflicts();
      expect(conflicts.length).toBe(0);
    });
  });

  describe("topologicalSort", () => {
    it("should return tasks in dependency order", () => {
      const a: ParallelTask = {
        id: "a",
        name: "A",
        type: "code_gen",
        complexity: "simple",
        query: "a",
      };

      const b: ParallelTask = {
        id: "b",
        name: "B",
        type: "code_gen",
        complexity: "simple",
        query: "b",
        dependsOn: ["a"],
      };

      const c: ParallelTask = {
        id: "c",
        name: "C",
        type: "code_gen",
        complexity: "simple",
        query: "c",
        dependsOn: ["b"],
      };

      graph.addTask(a);
      graph.addTask(b);
      graph.addTask(c);

      const sorted = graph.topologicalSort();
      expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
      expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("c"));
    });

    it("should return empty for cyclic graph", () => {
      const a: ParallelTask = {
        id: "a",
        name: "A",
        type: "code_gen",
        complexity: "simple",
        query: "a",
        dependsOn: ["b"],
      };

      const b: ParallelTask = {
        id: "b",
        name: "B",
        type: "code_gen",
        complexity: "simple",
        query: "b",
        dependsOn: ["a"],
      };

      graph.addTask(a);
      graph.addTask(b);

      const sorted = graph.topologicalSort();
      expect(sorted.length).toBe(0);
    });
  });

  describe("analyze", () => {
    it("should identify root tasks", () => {
      const root: ParallelTask = {
        id: "root",
        name: "Root",
        type: "code_gen",
        complexity: "simple",
        query: "root",
      };

      const child: ParallelTask = {
        id: "child",
        name: "Child",
        type: "code_gen",
        complexity: "simple",
        query: "child",
        dependsOn: ["root"],
      };

      graph.addTask(root);
      graph.addTask(child);

      const analysis = graph.analyze();
      expect(analysis.rootTasks).toContain("root");
      expect(analysis.rootTasks).not.toContain("child");
    });

    it("should identify leaf tasks", () => {
      const root: ParallelTask = {
        id: "root",
        name: "Root",
        type: "code_gen",
        complexity: "simple",
        query: "root",
      };

      const leaf: ParallelTask = {
        id: "leaf",
        name: "Leaf",
        type: "code_gen",
        complexity: "simple",
        query: "leaf",
        dependsOn: ["root"],
      };

      graph.addTask(root);
      graph.addTask(leaf);

      const analysis = graph.analyze();
      expect(analysis.leafTasks).toContain("leaf");
      expect(analysis.leafTasks).not.toContain("root");
    });

    it("should calculate max depth", () => {
      const a: ParallelTask = {
        id: "a",
        name: "A",
        type: "code_gen",
        complexity: "simple",
        query: "a",
      };

      const b: ParallelTask = {
        id: "b",
        name: "B",
        type: "code_gen",
        complexity: "simple",
        query: "b",
        dependsOn: ["a"],
      };

      const c: ParallelTask = {
        id: "c",
        name: "C",
        type: "code_gen",
        complexity: "simple",
        query: "c",
        dependsOn: ["b"],
      };

      graph.addTask(a);
      graph.addTask(b);
      graph.addTask(c);

      const analysis = graph.analyze();
      expect(analysis.maxDepth).toBe(2);
    });

    it("should report isValid for clean graph", () => {
      const task: ParallelTask = {
        id: "task-1",
        name: "Task",
        type: "code_gen",
        complexity: "simple",
        query: "query",
      };

      graph.addTask(task);

      const analysis = graph.analyze();
      expect(analysis.isValid).toBe(true);
      expect(analysis.conflicts.length).toBe(0);
    });
  });

  describe("createDependencyGraphFromTasks", () => {
    it("should create graph from task array", () => {
      const tasks: ParallelTask[] = [
        {
          id: "a",
          name: "A",
          type: "code_gen",
          complexity: "simple",
          query: "a",
        },
        {
          id: "b",
          name: "B",
          type: "code_gen",
          complexity: "simple",
          query: "b",
          dependsOn: ["a"],
        },
      ];

      const graph = createDependencyGraphFromTasks(tasks);

      expect(graph.size).toBe(2);
      expect(graph.getTask("a")).toBeDefined();
      expect(graph.getTask("b")).toBeDefined();
    });
  });
});
