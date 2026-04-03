"""
Centralized error handling for SkillSync.
All custom exceptions inherit from SkillSyncError.
"""


class SkillSyncError(Exception):
    """Base exception for all SkillSync errors."""
    
    def __init__(self, message: str, code: str = "UNKNOWN_ERROR"):
        self.message = message
        self.code = code
        super().__init__(self.message)


# ---------- Hand Tracking Errors ----------

class HandTrackingError(SkillSyncError):
    """Base class for hand tracking subsystem errors."""
    pass


class CameraNotFoundError(HandTrackingError):
    """Camera device not available."""
    
    def __init__(self):
        super().__init__(
            message="No camera device found. Please connect a camera and ensure it's not in use by another application.",
            code="CAMERA_NOT_FOUND"
        )


class NoHandDetectedError(HandTrackingError):
    """No hand visible in the frame."""
    
    def __init__(self):
        super().__init__(
            message="No hand detected in frame. Please show your hand clearly to the camera.",
            code="NO_HAND_DETECTED"
        )


# ---------- Procedure Errors ----------

class ProcedureError(SkillSyncError):
    """Base class for procedure intelligence subsystem errors."""
    pass


class InvalidSchemaError(ProcedureError):
    """Procedure schema is malformed or invalid."""
    
    def __init__(self, detail: str):
        super().__init__(
            message=f"Invalid procedure schema: {detail}",
            code="INVALID_SCHEMA"
        )


class StepSequenceError(ProcedureError):
    """Steps executed out of required order."""
    
    def __init__(self, expected: str, got: str):
        super().__init__(
            message=f"Step sequence error: expected '{expected}' but got '{got}'",
            code="STEP_SEQUENCE_ERROR"
        )


# ---------- Pipeline Errors ----------

class PipelineError(SkillSyncError):
    """Errors from the integration pipeline."""
    
    def __init__(self, detail: str):
        super().__init__(
            message=f"Pipeline processing error: {detail}",
            code="PIPELINE_ERROR"
        )


# ---------- Fatigue Errors ----------

class FatigueError(SkillSyncError):
    """Errors from the fatigue detection module."""
    
    def __init__(self, detail: str):
        super().__init__(
            message=f"Fatigue detection error: {detail}",
            code="FATIGUE_ERROR"
        )