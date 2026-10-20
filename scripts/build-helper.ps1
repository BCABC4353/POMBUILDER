$ErrorActionPreference = "Stop"
$BASE_PYTHON = "C:\Users\Brendan Cameron\.conda\envs\ems_extractor\python.exe"
$POMBUILDER = "C:\Users\Brendan Cameron\Desktop\POMBUILDER"
$VENV = Join-Path $env:LOCALAPPDATA "pom-builder-venv"
$PYTHON = Join-Path $VENV "Scripts\python.exe"

& $BASE_PYTHON -m venv --clear $VENV
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $PYTHON -m pip install --disable-pip-version-check -r "$POMBUILDER\helper\requirements.txt"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location $POMBUILDER
& $PYTHON -m PyInstaller "helper\pom_helper.spec" --distpath "helper\dist" --workpath "helper\build" -y
exit $LASTEXITCODE
