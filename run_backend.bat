@echo off
cd backend
echo Starting GripSense Backend...
uvicorn app.main:app --reload
pause
