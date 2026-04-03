import os
import cv2
import mediapipe as mp
from typing import Any

class HandTracker:
    """Wrapper for MediaPipe Hands integration using the Tasks API."""

    def __init__(self) -> None:
        BaseOptions = mp.tasks.BaseOptions
        HandLandmarker = mp.tasks.vision.HandLandmarker
        HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        model_path = os.path.join(os.path.dirname(__file__), 'hand_landmarker.task')

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=VisionRunningMode.IMAGE,
            num_hands=1,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5
        )

        self._tracker = HandLandmarker.create_from_options(options)

    def process(self, frame: Any) -> list[list[float]]:
        # Convert the BGR image to RGB before processing.
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Convert to MediaPipe Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        
        result = self._tracker.detect(mp_image)
        
        landmarks = []
        if result.hand_landmarks:
            hand_landmarks = result.hand_landmarks[0]
            for lm in hand_landmarks:
                landmarks.append([lm.x, lm.y, lm.z])
                
        return landmarks

