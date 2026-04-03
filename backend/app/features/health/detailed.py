import sys
import os
from typing import Any


def check_python_version() -> dict[str, Any]:
    """Check Python version."""
    version = sys.version
    major, minor, micro = sys.version_info[:3]
    
    return {
        "status": "ok" if major >= 3 and minor >= 10 else "warning",
        "version": version,
        "major": major,
        "minor": minor,
        "micro": micro
    }


def check_mediapipe() -> dict[str, Any]:
    """Check if MediaPipe is installed and working."""
    try:
        import mediapipe as mp
        
        # Try to access the hand landmarker
        BaseOptions = mp.tasks.BaseOptions
        HandLandmarker = mp.tasks.vision.HandLandmarker
        
        return {
            "status": "ok",
            "version": mp.__version__
        }
    except ImportError as e:
        return {
            "status": "error",
            "detail": f"MediaPipe not installed: {str(e)}"
        }
    except Exception as e:
        return {
            "status": "error",
            "detail": f"MediaPipe error: {str(e)}"
        }


def check_opencv() -> dict[str, Any]:
    """Check if OpenCV is installed."""
    try:
        import cv2
        
        return {
            "status": "ok",
            "version": cv2.__version__
        }
    except ImportError as e:
        return {
            "status": "error",
            "detail": f"OpenCV not installed: {str(e)}"
        }


def check_camera() -> dict[str, Any]:
    """Check if camera is accessible."""
    try:
        import cv2
        
        cap = cv2.VideoCapture(0)
        
        if cap.isOpened():
            ret, frame = cap.read()
            cap.release()
            
            if ret and frame is not None:
                height, width = frame.shape[:2]
                return {
                    "status": "ok",
                    "resolution": f"{width}x{height}"
                }
            else:
                return {
                    "status": "warning",
                    "detail": "Camera opened but could not read frame"
                }
        else:
            return {
                "status": "unavailable",
                "detail": "No camera found or camera in use by another application"
            }
    except Exception as e:
        return {
            "status": "error",
            "detail": f"Camera check failed: {str(e)}"
        }


def check_model_file() -> dict[str, Any]:
    """Check if hand_landmarker.task model file exists."""
    model_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "hand_tracking",
        "cv",
        "hand_landmarker.task"
    )
    
    abs_path = os.path.abspath(model_path)
    
    if os.path.exists(abs_path):
        size_mb = os.path.getsize(abs_path) / (1024 * 1024)
        return {
            "status": "ok",
            "path": abs_path,
            "size_mb": round(size_mb, 2)
        }
    else:
        return {
            "status": "error",
            "detail": f"Model file not found at: {abs_path}"
        }


def check_feature_modules() -> dict[str, Any]:
    """Check if all feature modules can be imported."""
    modules_to_check = [
        ("hand_tracker", "app.features.hand_tracking.cv.hand_tracker", "HandTracker"),
        ("landmarks", "app.features.hand_tracking.cv.landmarks", "normalize_landmarks"),
        ("angles", "app.features.hand_tracking.feature_engineering.angles", "compute_angles"),
        ("distances", "app.features.hand_tracking.feature_engineering.distances", "compute_distances"),
        ("smoothing", "app.features.hand_tracking.feature_engineering.smoothing", "smooth_landmarks"),
        ("state_machine", "app.features.procedure_intelligence.engine.state_machine", "next_step"),
        ("rules", "app.features.procedure_intelligence.engine.rules", "validate_step"),
        ("feedback", "app.features.procedure_intelligence.engine.feedback", "generate_feedback"),
        ("scoring", "app.features.procedure_intelligence.engine.scoring", "compute_score"),
        ("pipeline", "app.features.realtime_feedback.service.pipeline", "process_frame"),
    ]
    
    results = {}
    all_ok = True
    
    for name, module_path, function_name in modules_to_check:
        try:
            module = __import__(module_path, fromlist=[function_name])
            func = getattr(module, function_name, None)
            
            if func is not None:
                results[name] = {"status": "ok"}
            else:
                results[name] = {
                    "status": "error",
                    "detail": f"Function '{function_name}' not found in module"
                }
                all_ok = False
        except ImportError as e:
            results[name] = {
                "status": "error",
                "detail": f"Import failed: {str(e)}"
            }
            all_ok = False
        except Exception as e:
            results[name] = {
                "status": "error",
                "detail": f"Unexpected error: {str(e)}"
            }
            all_ok = False
    
    return {
        "status": "ok" if all_ok else "degraded",
        "modules": results
    }


def run_detailed_health_check() -> dict[str, Any]:
    """Run all health checks and return comprehensive report."""
    
    checks = {
        "python": check_python_version(),
        "mediapipe": check_mediapipe(),
        "opencv": check_opencv(),
        "camera": check_camera(),
        "model_file": check_model_file(),
        "feature_modules": check_feature_modules()
    }
    
    # Determine overall status
    statuses = []
    for key, value in checks.items():
        if isinstance(value, dict) and "status" in value:
            statuses.append(value["status"])
    
    if all(s == "ok" for s in statuses):
        overall_status = "healthy"
    elif any(s == "error" for s in statuses):
        overall_status = "unhealthy"
    else:
        overall_status = "degraded"
    
    return {
        "status": overall_status,
        "checks": checks
    }