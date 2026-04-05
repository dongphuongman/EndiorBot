# BUG-001: ops run Fails on Python Projects with Custom Install Scripts

**ID:** BUG-001
**Severity:** P1 (High)
**Status:** FIXED (Sprint 129)
**Component:** EndiorBot CLI / DevOps / Ecosystem Detection
**Discovered:** 2026-04-05 — VideoLingo test (Python + Streamlit + ML deps)

---

## Problem

`endiorbot ops run` crashes with `ModuleNotFoundError` on Python ML projects that have dependencies installed via custom scripts (`install.py`) rather than `requirements.txt` alone.

**Root cause:** Many ML projects split their dependency installation:
- `requirements.txt` — standard Python packages
- `install.py` — custom script for packages with version conflicts (e.g., `demucs` + `torchaudio` version pinning)

EndiorBot's `ops build` only ran `pip install -r requirements.txt`, missing the custom install step.

## Fix (3 changes)

### 1. `ops build` — detect and run `install.py` / `setup.py` (Step 1b)

After standard `pip install`, if `install.py` exists → run it automatically.
If `setup.py` exists → run `pip install -e .` for editable install.

### 2. `ops run` — diagnose `ModuleNotFoundError` (error guidance)

When Python process exits with error, parse stderr for `ModuleNotFoundError`.
Show actionable message:
```
❌ Missing Python module: demucs

   This project has an install.py script that installs additional dependencies.
   → Run: python install.py
   → Then retry: endiorbot ops run --skip-gate-check
```

### 3. Python entry point detection — add `launch.py`, `run.py`

Detection chain: `manage.py → app.py → main.py → launch.py → run.py → src/__main__.py`

## Verification

```bash
endiorbot bootstrap https://github.com/Huanshere/VideoLingo.git --tier STANDARD
endiorbot start VideoLingo
endiorbot ops build --skip-gate-check   # Now runs install.py automatically
endiorbot ops run --skip-gate-check     # Detects launch.py, diagnoses errors
```

## Files Changed

- `src/cli/commands/devops.ts` — capture stderr, diagnose Python errors, run install.py
- `src/cli/commands/ecosystem-detector.ts` — add launch.py/run.py to entry detection
