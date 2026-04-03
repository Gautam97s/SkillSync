# Features & Build Order

## 1. Real-Time Hand Tracking (Foundation)

**Description:**
Captures live hand movements using MediaPipe and extracts 21 hand landmarks per frame. This forms the base of the entire system.

**Why First:**
Everything depends on accurate landmark detection. If this fails, the entire project fails.

---

## 2. Feature Extraction (Angles, Distances, Positions)

**Description:**
Processes raw landmarks to compute meaningful features such as joint angles, finger distances, and positional zones.

**Why Next:**
Raw coordinates are useless without interpretation. This layer converts data into usable signals for validation.

---

## 3. Procedural Step Engine (State Machine)

**Description:**
Defines the sequence of steps (e.g., correct grip → hold → complete) and ensures they are followed in order.

**Why Next:**
Introduces structure and transforms the system from tracking → guided procedure execution.

---

## 4. Precision Validation System (Rule Engine)

**Description:**
Validates whether the user’s hand posture meets defined constraints (angle ranges, distances, positions).

**Why Next:**
Enables correctness checking, which is the core purpose of the system.

---

## 5. Explainable Feedback Engine

**Description:**
Generates real-time, actionable feedback with numerical explanations (e.g., angle deviation and required correction).

**Why Next:**
Transforms raw validation into meaningful user guidance, making the system interactive and useful.

---

## 6. Step Completion & Timing Validation

**Description:**
Ensures each step is held correctly for a required duration before marking it as complete.

**Why Next:**
Adds reliability by preventing false positives from momentary correct positions.

---

## 7. Stability / Confidence Scoring

**Description:**
Measures how steady the hand is by analyzing landmark variance over time and outputs a stability score.

**Why Next:**
Enhances system intelligence and provides deeper insight into user performance.

---

## 8. Fatigue Detection Module

**Description:**
Detects increasing instability (jitter, variance, repeated errors) over time to estimate user fatigue and suggest breaks.

**Why Next:**
Builds on stability metrics and adds a higher-level behavioral insight.

---

## 9. Real-Time UI with Visualization

**Description:**
Displays camera feed, hand skeleton overlay, step progress, feedback messages, stability score, and fatigue level.

**Why Last:**
UI depends on all backend outputs. It should be built after core logic is stable.

---

# 🧠 Final Build Flow

```text
Hand Tracking
→ Feature Extraction
→ Step Engine
→ Validation
→ Feedback
→ Timing Validation
→ Stability Scoring
→ Fatigue Detection
→ UI Integration
```

---

# ⚠️ Notes

* Do not skip order — each feature depends on the previous one
* Focus on making each layer stable before moving forward
* Avoid adding extra features beyond this list within the hackathon timeframe

---
