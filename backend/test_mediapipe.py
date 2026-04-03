import sys
import os

# Ensure the backend directory is in the path to allow absolute imports from app module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import cv2
import mediapipe as mp
from app.features.hand_tracking.cv.hand_tracker import HandTracker
from app.features.hand_tracking.feature_engineering.distances import compute_distances
from app.features.hand_tracking.feature_engineering.angles import compute_angles

def main():
    # Initialize our HandTracker (now using Tasks API)
    tracker = HandTracker()
    
    # Standard MediaPipe Hand Connections to draw the skeleton
    HAND_CONNECTIONS = [
        (0, 1), (1, 2), (2, 3), (3, 4),
        (0, 5), (5, 6), (6, 7), (7, 8),
        (5, 9), (9, 10), (10, 11), (11, 12),
        (9, 13), (13, 14), (14, 15), (15, 16),
        (13, 17), (0, 17), (17, 18), (18, 19), (19, 20)
    ]
    
    # Open the default webcam
    cap = cv2.VideoCapture(0)
    print("Starting webcam... Press 'q' to quit.")
    
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("Ignoring empty camera frame.")
            continue
            
        # Flip frame horizontally for a selfie-view display
        frame = cv2.flip(frame, 1)
        
        # Process the frame to get landmarks ([x, y, z] for 21 points)
        landmarks = tracker.process(frame)
        
        if landmarks:
            # We compute some features
            dists = compute_distances(landmarks)
            angles = compute_angles(landmarks)
            
            # Print features to the frame
            cv2.putText(frame, f"Thumb-Index Dist (norm): {dists['thumb_index_distance']:.2f}", (10, 30), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)
            cv2.putText(frame, f"Thumb-Index Angle: {angles['thumb_index_angle']:.1f} deg", (10, 60), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)
            cv2.putText(frame, f"Wrist-Finger Angle: {angles['wrist_finger_angle']:.1f} deg", (10, 90), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)
            
            h, w, c = frame.shape
            
            # Draw standard connections manually
            for connection in HAND_CONNECTIONS:
                idx1 = connection[0]
                idx2 = connection[1]
                if idx1 < len(landmarks) and idx2 < len(landmarks):
                    # Scale normalized coordinates back to pixel values for drawing
                    x1, y1 = int(landmarks[idx1][0] * w), int(landmarks[idx1][1] * h)
                    x2, y2 = int(landmarks[idx2][0] * w), int(landmarks[idx2][1] * h)
                    cv2.line(frame, (x1, y1), (x2, y2), (255, 255, 255), 2)

            # Draw the 21 landmarks with their labels
            for idx, lm in enumerate(landmarks):
                cx, cy = int(lm[0] * w), int(lm[1] * h)
                cv2.circle(frame, (cx, cy), 5, (255, 0, 255), cv2.FILLED)
                cv2.putText(frame, str(idx), (cx + 8, cy - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
                    
        # Display the resulting frame
        cv2.imshow('MediaPipe Hand Tracking Test', frame)
        if cv2.waitKey(5) & 0xFF == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    main()
