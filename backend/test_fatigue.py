# backend/test_fatigue.py

import time
from app.features.procedure_intelligence.engine.fatigue import FatigueDetector


def run_demo():
    """Simulate a session and show fatigue levels changing over time."""
    
    detector = FatigueDetector(
        session_time_limit_minutes=1.0,
        warmup_seconds=5.0,
    )
    detector.start_session()

    # Override the time fatigue method for demo (1 minute instead of 60)
    original_method = detector._compute_time_fatigue

    def demo_time_fatigue(*args) -> float:
        """Demo version: 5 minutes = full fatigue cycle."""
        session_minutes = args[-1]  # Handle both bound and unbound calls
        if session_minutes <= 1.0:        # 0-1 min: fresh
            return 0.0
        elif session_minutes <= 2.0:      # 1-2 min: building
            return 0.3 * ((session_minutes - 1.0) / 1.0)
        elif session_minutes <= 3.0:      # 2-3 min: moderate
            return 0.3 + 0.3 * ((session_minutes - 2.0) / 1.0)
        elif session_minutes <= 4.0:      # 3-4 min: high
            return 0.6 + 0.4 * ((session_minutes - 3.0) / 1.0)
        else:                             # 4+ min: critical
            return 1.0
            
    detector._compute_time_fatigue = demo_time_fatigue

    print("=" * 70)
    print("FATIGUE DETECTION DEMO - 5 Minute Simulation")
    print("=" * 70)
    print()

    start = time.time()
    
    # Run for 330 seconds (5.5 min) to show all levels including critical
    while True:
        elapsed = time.time() - start
        
        if elapsed > 330:
            break

        # Simulate stability that gradually degrades
        if elapsed < 60:           # 0-1 min: good performance
            stability = 0.9
            error = False
        elif elapsed < 120:        # 1-2 min: slight decline
            stability = 0.75
            error = False
        elif elapsed < 180:        # 2-3 min: moderate decline
            stability = 0.6
            error = True
        elif elapsed < 240:        # 3-4 min: significant decline
            stability = 0.45
            error = True
        else:                      # 4-5 min: heavy decline
            stability = 0.3
            error = True

        result = detector.update(
            stability_score=stability,
            had_error=error,
        )

        print(
            f"[{elapsed:5.1f}s] "
            f"Level: {result.fatigue_level.value:<10s} "
            f"Score: {result.fatigue_score:.3f}  "
            f"Break: {result.recommended_break_seconds:3d}s  "
            f"Degradation: {result.performance_degradation_pct:5.1f}%  "
            f"Warning: {result.warning_message or '-'}"
        )

        time.sleep(2)

    print()
    print("=" * 70)
    print("DEMO COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    run_demo()