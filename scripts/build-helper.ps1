$PYTHON = "C:\Users\Brendan Cameron\.conda\envs\ems_extractor\python.exe"
$POMBUILDER = "C:\Users\Brendan Cameron\Desktop\POMBUILDER"

$piCheck = & $PYTHON -c "import PyInstaller; print('ok')" 2>&1
if ($piCheck -ne "ok") {
    & $PYTHON -m pip install pyinstaller==6.14.2
}

Set-Location $POMBUILDER
& $PYTHON -m PyInstaller "helper\pom_helper.spec" --distpath "helper\dist" --workpath "helper\build" -y
