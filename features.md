# SkillSync Deliverables & Feature Breakdown

---

## ?? EXACT DELIVERABLES

### Deliverable 1: Hand Tracking Pipeline
**Extract real-time (x, y, z) landmark coordinates from a video feed using computer vision**

- **1.1 Real-Time Hand Tracking (Foundation)**
  - Description: Captures live hand movements using MediaPipe and extracts 21 hand landmarks per frame.
  - Output: (x, y, z) coordinates for each landmark in real time.
  - Backend Module: `backend/app/features/hand_tracking/cv/hand_tracker.py`
  - Build Order: **FIRST** — Everything depends on accurate landmark detection.

- **1.2 Feature Extraction (Angles, Distances, Positions)**
  - Description: Processes raw landmarks to compute meaningful features such as joint angles, finger distances, and positional zones.
  - Output: Computed angles, inter-finger distances, grip position, zone location.
  - Backend Modules: `backend/app/features/hand_tracking/feature_engineering/`
  - Build Order: **SECOND** — Raw coordinates must be converted into usable signals.

---

### Deliverable 2: Procedure Schema (JSON-based)
**Encode a multi-step skill as spatial checkpoints with grip angle tolerances, zone transitions, and dwell time requirements**

- **2.1 Procedural Step Engine (State Machine)**
  - Description: Defines the sequence of steps (e.g., correct grip ? hold ? release ? complete) and ensures they are followed in order.
  - Output: Step progression state, current step ID, next expected step.
  - Backend Module: `backend/app/features/procedure_intelligence/engine/state_machine.py`
  - Build Order: **THIRD** — Introduces structure for guided procedure execution.
  - Schema Example:
    ```json
    {
      "procedure": "surgical_knot_tying",
      "steps": [
        {
          "id": "grip_init",
          "description": "Correct grip position",
          "constraints": {
            "thumb_index_angle": {"min": 20, "max": 45},
            "grip_distance": {"max": 0.15}
          },
          "dwell_time_ms": 500,
          "next_step": "hold_steady"
        }
      ]
    }
    ```

---

### Deliverable 3: Error Detection Engine
**Compare live landmark data to schema and classify deviations by type with corrective messages**

- **3.1 Precision Validation System (Rule Engine)**
  - Description: Validates whether the user''s hand posture meets defined constraints from the procedure schema.
  - Output: Valid/Invalid status, deviation magnitude, constraint that was violated.
  - Backend Module: `backend/app/features/procedure_intelligence/engine/rules.py`
  - Build Order: **FOURTH** — Core correctness checking.

- **3.2 Step Completion & Timing Validation**
  - Description: Ensures each step is held correctly for a required duration (dwell time) before marking it as complete.
  - Output: Step completion flag, time held, time remaining.
  - Backend Module: `backend/app/features/procedure_intelligence/engine/state_machine.py`
  - Build Order: **SIXTH** — Prevents false positives from momentary correct positions.

- **3.3 Explainable Feedback Engine**
  - Description: Generates real-time, actionable feedback with numerical explanations (e.g., "Increase thumb-index angle by +6°" or "Hold this position for 2 more seconds").
  - Output: Feedback items with code, message, severity, and numeric correction hint.
  - Backend Module: `backend/app/features/procedure_intelligence/engine/feedback.py`
  - Build Order: **FIFTH** — Transforms validation into user guidance.

---

### Deliverable 4: Real-Time UI
**Display live skeleton overlay and step checklist that updates as each sub-step is completed correctly**

- **4.1 Real-Time UI with Visualization**
  - Description: Displays camera feed, hand skeleton overlay with joints and edges, step progress checklist, feedback messages, stability score, and fatigue level.
  - Output: Live interactive dashboard with real-time updates via WebSocket.
  - Frontend Modules: `frontend/features/hand-tracking/`, `frontend/features/realtime-feedback/`, `frontend/features/step-tracker/`
  - Build Order: **LAST (9th)** — UI depends on all backend outputs being stable.
  - Components:
    - Camera feed (live video) — `frontend/features/hand-tracking/components/CameraFeed.tsx`
    - Hand skeleton overlay (21 joints + edges) — `frontend/features/hand-tracking/components/HandOverlay.tsx`
    - Step tracker (completed ? | active ? | pending ?) — `frontend/features/step-tracker/components/StepTracker.tsx`
    - Feedback panel (corrective messages) — `frontend/features/realtime-feedback/components/FeedbackPanel.tsx`
    - Metrics display (stability score, angles, distances) — `frontend/features/realtime-feedback/components/Metrics.tsx`

---

### Deliverable 5: Fatigue Detection Module
**Analyze coordinate jitter over time to detect hand tremor and enforce timed rest breaks**

- **5.1 Stability / Confidence Scoring**
  - Description: Measures how steady the hand is by analyzing landmark coordinate variance and jitter over a time window.
  - Output: Stability score (0.0 to 1.0), tremor level, variance metrics.
  - Backend Module: `backend/app/features/procedure_intelligence/engine/scoring.py`
  - Build Order: **SEVENTH** — Builds on raw feature data.

- **5.2 Fatigue Detection Module**
  - Description: Detects increasing instability (jitter, variance, repeated errors) over time to estimate user fatigue and suggest breaks.
  - Output: Fatigue level, recommended break duration, performance degradation warning.
  - Backend Module: `backend/app/features/procedure_intelligence/engine/feedback.py` (extended)
  - Build Order: **EIGHTH** — Builds on stability metrics for higher-level behavioral insight.

---

# ?? Build Order Flow

```
Priority 1: Hand Tracking
  +- Real-Time Hand Tracking (1.1)

Priority 2: Feature Extraction
  +- Feature Extraction (1.2)

Priority 3: Procedure Schema
  +- Procedural Step Engine (2.1)

Priority 4: Validation Logic
  +- Precision Validation System (3.1)

Priority 5: User Feedback
  +- Explainable Feedback Engine (3.3)

Priority 6: Timing & Completion
  +- Step Completion & Timing Validation (3.2)

Priority 7: Performance Metrics
  +- Stability / Confidence Scoring (5.1)

Priority 8: Behavioral Insights
  +- Fatigue Detection Module (5.2)

Priority 9: UI & Visualization
  +- Real-Time UI with Visualization (4.1)
```

---

# ?? Parallel Implementation Strategy (4-Person Team)

## Member 1: Hand Tracking & Feature Engineering
- **Tasks:** 1.1, 1.2
- **Deliverable:** Processable (x, y, z) landmark data with angles and distances
- **Output:** Backend `hand_tracking` feature fully functional
- **Files to modify:** 
  - `backend/app/features/hand_tracking/cv/hand_tracker.py`
  - `backend/app/features/hand_tracking/cv/landmarks.py`
  - `backend/app/features/hand_tracking/feature_engineering/angles.py`
  - `backend/app/features/hand_tracking/feature_engineering/distances.py`
  - `backend/app/features/hand_tracking/feature_engineering/smoothing.py`

## Member 2: Procedure Intelligence & Validation
- **Tasks:** 2.1, 3.1, 3.3, 3.2, 5.1
- **Deliverable:** JSON schema support, rule validation, explainable feedback, timing, stability scoring
- **Output:** Backend `procedure_intelligence` feature fully functional
- **Files to modify:** 
  - `backend/app/features/procedure_intelligence/engine/state_machine.py`
  - `backend/app/features/procedure_intelligence/engine/rules.py`
  - `backend/app/features/procedure_intelligence/engine/feedback.py`
  - `backend/app/features/procedure_intelligence/engine/scoring.py`

## Member 3: Frontend Live Experience
- **Tasks:** 4.1
- **Deliverable:** Live skeleton UI, step tracker, feedback panel, metrics, WebSocket connection
- **Output:** Frontend features fully wired and connected
- **Files to modify:** 
  - `frontend/features/hand-tracking/components/CameraFeed.tsx`
  - `frontend/features/hand-tracking/components/HandOverlay.tsx`
  - `frontend/features/realtime-feedback/components/FeedbackPanel.tsx`
  - `frontend/features/realtime-feedback/components/Metrics.tsx`
  - `frontend/features/step-tracker/components/StepTracker.tsx`
  - `frontend/features/realtime-feedback/websocket/useWebSocket.ts`

## Member 4: Integration & Fatigue / Bug Triage
- **Tasks:** 5.2, end-to-end WebSocket, health checks, error handling
- **Deliverable:** System-wide fatigue detection, integration testing, bug fixes
- **Output:** Complete end-to-end pipeline working
- **Files to modify:** 
  - `backend/app/features/procedure_intelligence/engine/feedback.py` (fatigue extension)
  - `backend/app/features/realtime_feedback/service/pipeline.py`
  - `backend/app/main.py`
  - Both frontend and backend for integration testing

---

# ?? Implementation Notes

- **Do not skip order** — Each priority depends on the previous one.
- **Parallel tracks** — Members 1 & 2 work in parallel first, Member 3 joins as soon as WebSocket contract is defined.
- **Member 4 owns integration** — Catches bugs and integration breaks immediately.
- **JSON schema is critical** — Finalize procedure schema format early (Priority 3) so Member 2 can validate against it.
- **Test with real data** — Use a real medical or vocational procedure (e.g., surgical knot tying, dental crown prep) as the test case.
- **Daily syncs** — 15-minute standups to catch blockers early.

---

# ?? Example Use Case: Surgical Knot Tying

**Procedure:** Surgeon learns to tie a surgical knot correctly

**Steps:**
1. Grip thread with thumb-index pinch (angle 20-45°, distance < 0.15)
2. Hold position for 500ms (stability > 0.7)
3. Cross threads without tremor (stability > 0.75)
4. Pull complete (force detection via jitter analysis)

**Success Criteria:**
- All steps completed in sequence
- No premature fatigue detection
- All angles within tolerance
- No tremor during critical hold windows

---
