powershell -ExecutionPolicy Bypass -File .\upgrade-kb.ps1
python -m pip install -r requirements.txt
python -m pytest -q
