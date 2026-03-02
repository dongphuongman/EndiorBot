/**
 * Session State Machine Tests
 *
 * Unit tests for ResilienceStateMachine.
 *
 * @module sessions/__tests__/state-machine.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @sprint 69-71
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ResilienceStateMachine,
  ResilienceState,
  createStateMachine,
  stateToSDLCStage,
  sdlcStageToState,
} from "../state-machine.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("ResilienceStateMachine", () => {
  let machine: ResilienceStateMachine;

  beforeEach(() => {
    machine = new ResilienceStateMachine("test-session-123");
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe("constructor", () => {
    it("should initialize with INIT state by default", () => {
      expect(machine.getState()).toBe(ResilienceState.INIT);
    });

    it("should accept custom initial state", () => {
      const customMachine = new ResilienceStateMachine("test", {
        initialState: ResilienceState.BUILD,
      });
      expect(customMachine.getState()).toBe(ResilienceState.BUILD);
    });

    it("should store session ID", () => {
      expect(machine.getSessionId()).toBe("test-session-123");
    });

    it("should record initial state in history", () => {
      const history = machine.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]!.state).toBe(ResilienceState.INIT);
      expect(history[0]!.trigger).toBe("init");
    });
  });

  // ============================================================================
  // Transition Tests
  // ============================================================================

  describe("transition", () => {
    it("should transition from INIT to PLANNING on start", async () => {
      const result = await machine.transition("start");

      expect(result).toBe(true);
      expect(machine.getState()).toBe(ResilienceState.PLANNING);
      expect(machine.getPreviousState()).toBe(ResilienceState.INIT);
    });

    it("should follow normal SDLC flow", async () => {
      await machine.transition("start");
      expect(machine.getState()).toBe(ResilienceState.PLANNING);

      await machine.transition("plan_complete");
      expect(machine.getState()).toBe(ResilienceState.DESIGN);

      await machine.transition("design_complete");
      expect(machine.getState()).toBe(ResilienceState.INTEGRATE);

      await machine.transition("integration_ready");
      expect(machine.getState()).toBe(ResilienceState.BUILD);

      await machine.transition("build_complete");
      expect(machine.getState()).toBe(ResilienceState.TEST);

      await machine.transition("tests_pass");
      expect(machine.getState()).toBe(ResilienceState.DONE);
    });

    it("should throw error on invalid transition", async () => {
      await expect(machine.transition("tests_pass")).rejects.toThrow(
        "Invalid transition"
      );
    });

    it("should record transitions in history", async () => {
      await machine.transition("start");
      await machine.transition("plan_complete");

      const history = machine.getHistory();
      expect(history.length).toBe(3); // init + 2 transitions
      expect(history[1]!.state).toBe(ResilienceState.PLANNING);
      expect(history[1]!.trigger).toBe("start");
      expect(history[2]!.state).toBe(ResilienceState.DESIGN);
      expect(history[2]!.fromState).toBe(ResilienceState.PLANNING);
    });

    it("should support wildcard transitions (fatal_error)", async () => {
      await machine.transition("start");
      await machine.transition("fatal_error");

      expect(machine.getState()).toBe(ResilienceState.ERROR);
    });

    it("should support quick_start skip path", async () => {
      await machine.transition("quick_start");

      expect(machine.getState()).toBe(ResilienceState.BUILD);
    });

    it("should support retry_build transition", async () => {
      await machine.transition("quick_start"); // INIT -> BUILD
      await machine.transition("retry_build"); // BUILD -> BUILD

      expect(machine.getState()).toBe(ResilienceState.BUILD);
    });

    it("should support test_failure rollback", async () => {
      await machine.transition("quick_start"); // INIT -> BUILD
      await machine.transition("build_complete"); // BUILD -> TEST
      await machine.transition("test_failure"); // TEST -> BUILD

      expect(machine.getState()).toBe(ResilienceState.BUILD);
    });
  });

  // ============================================================================
  // Guard Tests
  // ============================================================================

  describe("guards", () => {
    it("should block transition when guard returns false", async () => {
      const guardedMachine = new ResilienceStateMachine("guarded", {
        customTransitions: [
          {
            from: ResilienceState.INIT,
            to: ResilienceState.PLANNING,
            trigger: "guarded_start",
            guard: async () => false,
          },
        ],
      });

      const result = await guardedMachine.transition("guarded_start");
      expect(result).toBe(false);
      expect(guardedMachine.getState()).toBe(ResilienceState.INIT);
    });

    it("should allow transition when guard returns true", async () => {
      const guardedMachine = new ResilienceStateMachine("guarded", {
        customTransitions: [
          {
            from: ResilienceState.INIT,
            to: ResilienceState.PLANNING,
            trigger: "guarded_start",
            guard: async () => true,
          },
        ],
      });

      const result = await guardedMachine.transition("guarded_start");
      expect(result).toBe(true);
      expect(guardedMachine.getState()).toBe(ResilienceState.PLANNING);
    });
  });

  // ============================================================================
  // Action Tests
  // ============================================================================

  describe("actions", () => {
    it("should execute action on transition", async () => {
      let actionExecuted = false;

      const actionMachine = new ResilienceStateMachine("action", {
        customTransitions: [
          {
            from: ResilienceState.INIT,
            to: ResilienceState.PLANNING,
            trigger: "action_start",
            action: async () => {
              actionExecuted = true;
            },
          },
        ],
      });

      await actionMachine.transition("action_start");
      expect(actionExecuted).toBe(true);
    });

    it("should throw if action fails", async () => {
      const errorMachine = new ResilienceStateMachine("error", {
        customTransitions: [
          {
            from: ResilienceState.INIT,
            to: ResilienceState.PLANNING,
            trigger: "error_start",
            action: async () => {
              throw new Error("Action failed");
            },
          },
        ],
      });

      await expect(errorMachine.transition("error_start")).rejects.toThrow(
        "Action failed"
      );
    });
  });

  // ============================================================================
  // Pause/Resume Tests
  // ============================================================================

  describe("pause/resume", () => {
    it("should pause from any state", async () => {
      await machine.transition("start"); // PLANNING
      await machine.transition("pause");

      expect(machine.getState()).toBe(ResilienceState.PAUSED);
      expect(machine.isPaused()).toBe(true);
    });

    it("should resume to previous state", async () => {
      await machine.transition("start"); // INIT -> PLANNING
      await machine.transition("pause"); // PLANNING -> PAUSED
      await machine.transition("resume"); // PAUSED -> PLANNING

      expect(machine.getState()).toBe(ResilienceState.PLANNING);
      expect(machine.isPaused()).toBe(false);
    });
  });

  // ============================================================================
  // canTransition Tests
  // ============================================================================

  describe("canTransition", () => {
    it("should return true for valid transition", () => {
      expect(machine.canTransition("start")).toBe(true);
    });

    it("should return false for invalid transition", () => {
      expect(machine.canTransition("tests_pass")).toBe(false);
    });

    it("should return true for wildcard transitions", () => {
      expect(machine.canTransition("fatal_error")).toBe(true);
      expect(machine.canTransition("pause")).toBe(true);
    });
  });

  // ============================================================================
  // getValidTriggers Tests
  // ============================================================================

  describe("getValidTriggers", () => {
    it("should return valid triggers for current state", () => {
      const triggers = machine.getValidTriggers();

      expect(triggers).toContain("start");
      expect(triggers).toContain("quick_start");
      expect(triggers).toContain("fatal_error");
      expect(triggers).toContain("pause");
    });

    it("should update after transition", async () => {
      await machine.transition("start");
      const triggers = machine.getValidTriggers();

      expect(triggers).toContain("plan_complete");
      expect(triggers).toContain("skip_design");
      expect(triggers).not.toContain("start");
    });
  });

  // ============================================================================
  // State Predicates Tests
  // ============================================================================

  describe("state predicates", () => {
    it("should identify terminal states", async () => {
      expect(machine.isTerminal()).toBe(false);

      await machine.transition("quick_start");
      await machine.transition("skip_test");
      expect(machine.isTerminal()).toBe(true);
      expect(machine.getState()).toBe(ResilienceState.DONE);
    });

    it("should identify error state", async () => {
      expect(machine.isError()).toBe(false);

      await machine.transition("fatal_error");
      expect(machine.isError()).toBe(true);
    });

    it("should identify active state", async () => {
      expect(machine.isActive()).toBe(true);

      await machine.transition("pause");
      expect(machine.isActive()).toBe(false);
    });
  });

  // ============================================================================
  // Serialization Tests
  // ============================================================================

  describe("serialization", () => {
    it("should serialize state machine", async () => {
      await machine.transition("start");
      await machine.transition("plan_complete");

      const serialized = machine.serialize();

      expect(serialized.sessionId).toBe("test-session-123");
      expect(serialized.currentState).toBe(ResilienceState.DESIGN);
      expect(serialized.previousState).toBe(ResilienceState.PLANNING);
      expect(serialized.history.length).toBe(3);
    });

    it("should restore state machine from serialized data", async () => {
      await machine.transition("start");
      await machine.transition("plan_complete");

      const serialized = machine.serialize();
      const restored = ResilienceStateMachine.restore(serialized);

      expect(restored.getSessionId()).toBe(machine.getSessionId());
      expect(restored.getState()).toBe(machine.getState());
      expect(restored.getPreviousState()).toBe(machine.getPreviousState());
      expect(restored.getHistory().length).toBe(machine.getHistory().length);
    });

    it("should continue transitions after restore", async () => {
      await machine.transition("start");
      const serialized = machine.serialize();

      const restored = ResilienceStateMachine.restore(serialized);
      await restored.transition("plan_complete");

      expect(restored.getState()).toBe(ResilienceState.DESIGN);
    });
  });

  // ============================================================================
  // Time in State Tests
  // ============================================================================

  describe("getTimeInState", () => {
    it("should return time since last state change", async () => {
      const time1 = machine.getTimeInState();

      // Wait a bit
      await new Promise((r) => setTimeout(r, 10));

      const time2 = machine.getTimeInState();
      expect(time2).toBeGreaterThan(time1);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createStateMachine", () => {
  it("should create a new state machine", () => {
    const machine = createStateMachine("factory-test");

    expect(machine).toBeInstanceOf(ResilienceStateMachine);
    expect(machine.getSessionId()).toBe("factory-test");
    expect(machine.getState()).toBe(ResilienceState.INIT);
  });

  it("should accept config options", () => {
    const machine = createStateMachine("factory-test", {
      initialState: ResilienceState.BUILD,
    });

    expect(machine.getState()).toBe(ResilienceState.BUILD);
  });
});

// ============================================================================
// SDLC Mapping Tests
// ============================================================================

describe("stateToSDLCStage", () => {
  it("should map states to SDLC stages", () => {
    expect(stateToSDLCStage(ResilienceState.INIT)).toBe("00-FOUNDATION");
    expect(stateToSDLCStage(ResilienceState.PLANNING)).toBe("01-PLANNING");
    expect(stateToSDLCStage(ResilienceState.DESIGN)).toBe("02-DESIGN");
    expect(stateToSDLCStage(ResilienceState.INTEGRATE)).toBe("03-INTEGRATE");
    expect(stateToSDLCStage(ResilienceState.BUILD)).toBe("04-BUILD");
    expect(stateToSDLCStage(ResilienceState.TEST)).toBe("05-TEST");
  });

  it("should return null for terminal states", () => {
    expect(stateToSDLCStage(ResilienceState.DONE)).toBeNull();
    expect(stateToSDLCStage(ResilienceState.ERROR)).toBeNull();
    expect(stateToSDLCStage(ResilienceState.PAUSED)).toBeNull();
  });
});

describe("sdlcStageToState", () => {
  it("should map SDLC stages to states", () => {
    expect(sdlcStageToState("00-FOUNDATION")).toBe(ResilienceState.INIT);
    expect(sdlcStageToState("01-PLANNING")).toBe(ResilienceState.PLANNING);
    expect(sdlcStageToState("02-DESIGN")).toBe(ResilienceState.DESIGN);
    expect(sdlcStageToState("03-INTEGRATE")).toBe(ResilienceState.INTEGRATE);
    expect(sdlcStageToState("04-BUILD")).toBe(ResilienceState.BUILD);
    expect(sdlcStageToState("05-TEST")).toBe(ResilienceState.TEST);
  });

  it("should default to INIT for unknown stages", () => {
    expect(sdlcStageToState("unknown")).toBe(ResilienceState.INIT);
  });
});
