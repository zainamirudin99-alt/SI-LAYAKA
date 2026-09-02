---
name: bug-report-processor
description: Processes bug reports from markdown files exported from any ticket system (Linear, GitHub Issues, Bugzilla, etc.), extracts reproduction steps, error logs, and environment details. Manages debugging workflow through Detective Methodology including reproduction, investigation, root cause analysis, fix verification, and regression testing. Use when handling bug reports, debugging issues, or tracking bug resolution.
license: MIT
compatibility: Requires Python 3.9+, uv package manager, tesseract-ocr system package, pytest for test execution. Optional selenium or playwright for UI reproduction automation.
allowed-tools: Bash(uv:*) Bash(python:*) Bash(pytest:*) Read Write Edit Glob Grep
metadata:
  author: development-team
  version: "1.0.0"
  category: development-workflow
  tags:
    - bugs
    - debugging
    - qa-automation
    - issue-tracking
    - root-cause-analysis
---

# Bug Report Processor

## Overview

This skill automates bug report processing and systematic debugging through the **Detective Methodology**. It transforms markdown bug reports into structured JSON state files that track the entire resolution lifecycle.

**Core capabilities:**
- Parse bug reports from any ticket system (Linear, GitHub, Bugzilla, etc.)
- Extract and analyze stack traces (Python, JavaScript, Java, C#)
- OCR screenshots for error messages
- Track investigation notes and root cause analysis
- Automate reproduction verification
- Execute regression tests before closure

## Activation Triggers

Activate this skill when:
- User says "process bug report", "analyze error log", "reproduce this bug"
- User says "investigate issue", "debug problem", "start detective workflow"
- User provides a `.md` file containing bug report structure
- User mentions stack traces or error logs needing analysis

## Detective Methodology

The core workflow enforces systematic bug resolution. **Phases cannot be skipped.**

```
Bug Queue (by severity) → Reproduce → Investigate → Diagnose → Fix → Verify → Regression Test → Close
```

### Phase Requirements

| Phase | Entry Requirement | Exit Requirement |
|-------|------------------|------------------|
| reproduce | Bug report parsed | Bug reproduced OR marked needs-info |
| investigate | Bug reproduced | Hypotheses documented |
| diagnose | Investigation complete | Root cause identified |
| fix | Root cause documented | Fix implemented |
| verify | Fix implemented | Original bug no longer occurs |
| regression_test | Fix verified | All related tests pass |
| closed | Regression tests pass | Resolution documented |

## Quick Start

### Process a New Bug Report

```bash
uv run scripts/process_bug.py path/to/bug-report.md
```

This parses the bug report, extracts all structured data, and creates a JSON state file at `.bug-states/<bug-id>.json` in your current project directory.


### Check Bug Status

```bash
uv run scripts/process_bug.py --status <bug-id>
```

### Start Detective Workflow

```bash
uv run scripts/detective_engine.py --directory ./bugs
```

Processes bugs in severity order (critical → high → medium → low).

## CLI Commands

```bash
# Process bug report (auto-detect format)
uv run scripts/process_bug.py <bug.md>
uv run scripts/process_bug.py <bug.md> --format github

# Update investigation
uv run scripts/state_manager.py <bug-id> --note "Found null pointer in form handler"
uv run scripts/state_manager.py <bug-id> --hypothesis "Form ID mismatch after v2.1 deploy"
uv run scripts/state_manager.py <bug-id> --root-cause "Commit abc123 changed form ID"

# Reproduction and verification
uv run scripts/reproduce_bug.py <bug-id>
uv run scripts/verify_fix.py <bug-id>

# Regression testing
uv run scripts/regression_tester.py <bug-id>

# Severity analysis
uv run scripts/severity_analyzer.py <bug.md>

# Detective mode (auto-progression)
uv run scripts/detective_engine.py --directory ./bugs --auto
```

## Bug Report Formats

The skill supports multiple ticket system formats. Format is auto-detected or can be specified with `--format`.

### GitHub Issues Format

```markdown
# Bug: Title here

**Labels**: bug, priority
**Assignee**: @developer

## Description
What's happening

## Steps to Reproduce
1. Step one
2. Step two

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: Windows 11
- Browser: Chrome 120

## Error Logs
```
Stack trace here
```
```

### Linear Format

```markdown
# BUG-123 - Title

**Status**: In Progress
**Priority**: Urgent

## Problem
Description

## Reproduction Steps
1. Step one
2. Step two

## Stack Trace
```js
Error here
```
```

Custom formats can be configured via `config/custom.yaml`.

## JSON State Schema

Each bug generates a state file tracking all workflow data:

```json
{
  "bug_id": "BUG-456",
  "title": "Login button not responding",
  "type": "bug",
  "severity": "high",
  "priority": "urgent",
  "status": "investigating",
  "reproduction": {
    "steps": ["Step 1", "Step 2"],
    "status": "reproduced",
    "evidence": {}
  },
  "error_analysis": {
    "error_type": "TypeError",
    "stack_trace": [],
    "likely_cause": ""
  },
  "investigation": {
    "hypothesis": [],
    "root_cause": null,
    "notes": []
  },
  "fix": {
    "status": "pending",
    "commits": [],
    "verification": {}
  },
  "regression_testing": {
    "status": "pending",
    "test_suites": []
  },
  "detective_state": {
    "current_phase": "investigating",
    "phases_completed": ["reproduce"]
  }
}
```

See `references/JSON_SCHEMA.md` for complete schema documentation.

## Severity Classification

| Level | Criteria | Response Time |
|-------|----------|---------------|
| critical | System crash, data loss, security vulnerability | Immediate |
| high | Major feature broken, significant user impact | < 4 hours |
| medium | Feature degraded, workaround exists | < 24 hours |
| low | Minor issue, cosmetic | Next sprint |
| trivial | Typo, minor UI polish | Backlog |

The severity analyzer (`scripts/severity_analyzer.py`) automatically classifies based on:
- Error type (crash, exception, validation)
- Impact keywords (data loss, security, cannot, broken)
- Affected user count
- Regression flag

## Stack Trace Support

Supported languages for stack trace parsing:

| Language | Error Pattern | Example |
|----------|--------------|---------|
| Python | `Traceback (most recent call last):` | `File "app.py", line 10, in main` |
| JavaScript | `Error:` or `TypeError:` | `at functionName (file.js:10:5)` |
| Java | `Exception in thread` | `at com.example.Class.method(File.java:10)` |
| C# | `Unhandled Exception:` | `at Namespace.Class.Method() in File.cs:line 10` |

## Resources

### scripts/
Core Python modules for bug processing:
- `process_bug.py` - Main entry point, parses bug reports
- `parse_markdown.py` - Markdown parser with format detection
- `parse_stack_trace.py` - Multi-language stack trace analyzer
- `screenshot_ocr.py` - OCR text extraction from screenshots
- `state_manager.py` - JSON state file CRUD operations
- `reproduce_bug.py` - Automated reproduction attempts
- `verify_fix.py` - Fix verification runner
- `regression_tester.py` - Regression test executor
- `detective_engine.py` - Workflow orchestrator
- `severity_analyzer.py` - Severity/priority assessment

### references/
- `BUG_STRUCTURE.md` - Expected markdown formats for each ticket system
- `JSON_SCHEMA.md` - Complete state file schema documentation
- `DETECTIVE_METHOD.md` - Detective Methodology guide
- `STACK_TRACE_FORMATS.md` - Supported stack trace formats
- `SEVERITY_GUIDE.md` - Severity classification criteria

### config/
- `field_mappings.yaml` - Default field name mappings
- `github.yaml` - GitHub Issues format configuration
- `linear.yaml` - Linear format configuration
- `bugzilla.yaml` - Bugzilla format configuration
- `custom.yaml.template` - Template for custom formats

### assets/
- `templates/bug_state_template.json` - Initial state file template
- `templates/investigation_template.md` - Investigation notes template
- `examples/` - Sample bug reports in various formats
