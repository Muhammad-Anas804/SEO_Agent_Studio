powershell -ExecutionPolicy Bypass -File .\upgrade-all.ps1
python -m pip install -r requirements.txt
python -m pytest -q
