$content = Get-Content requirements.txt
$content = $content -replace "mediapipe==0.10.21", "mediapipe>=0.10.30"
$content = $content -replace "numpy==1.26.4", "numpy"
$content | Out-File temp_req.txt -Encoding utf8
.\.venv\Scripts\pip.exe install -r temp_req.txt
Remove-Item temp_req.txt
