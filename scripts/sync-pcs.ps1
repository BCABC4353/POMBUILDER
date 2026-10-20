$EXTRACTOR = "C:\Users\Brendan Cameron\Desktop\EXTRACTOR"
$HELPER = "C:\Users\Brendan Cameron\Desktop\POMBUILDER\helper"

New-Item -ItemType Directory -Force -Path "$HELPER\pcs" | Out-Null
New-Item -ItemType Directory -Force -Path "$HELPER\pcs forms" | Out-Null
New-Item -ItemType Directory -Force -Path "$HELPER\config" | Out-Null

foreach ($f in Get-ChildItem -Path "$EXTRACTOR\pcs" -Filter "*.py") {
    Copy-Item -Path $f.FullName -Destination "$HELPER\pcs\$($f.Name)" -Force
}

foreach ($f in Get-ChildItem -Path "$EXTRACTOR\pcs forms" -Filter "*.pdf") {
    Copy-Item -Path $f.FullName -Destination "$HELPER\pcs forms\$($f.Name)" -Force
}

Copy-Item -Path "$EXTRACTOR\config\pcs.json" -Destination "$HELPER\config\pcs.json" -Force
