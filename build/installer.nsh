!ifndef BUILD_UNINSTALLER

!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh

Var pomOutputDir
Var pomBrowseButton

Function PomOutputDirBrowse
  ${NSD_GetText} $pomOutputDir $0
  nsDialogs::SelectFolderDialog "Choose where POM Builder saves print files" $0
  Pop $0
  ${If} $0 != error
  ${AndIf} $0 != ""
    ${NSD_SetText} $pomOutputDir $0
  ${EndIf}
FunctionEnd

Function PomOutputDirCreate
  ReadRegStr $1 HKCU "Software\POM Builder" "OutputDir"
  ${If} ${Silent}
  ${OrIf} $1 != ""
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Choose where POM Builder saves print files" "Print files, manifests and gate lists are saved here."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "POM Builder saves each day's print file, manifest and gate list in a dated folder inside this folder. You can change it later from the app."
  Pop $0
  ${NSD_CreateText} 0 30u 78% 12u "$DOCUMENTS\POM Builder"
  Pop $pomOutputDir
  ${NSD_CreateBrowseButton} 80% 29u 20% 14u "Browse..."
  Pop $pomBrowseButton
  ${NSD_OnClick} $pomBrowseButton PomOutputDirBrowse
  nsDialogs::Show
FunctionEnd

Function PomOutputDirLeave
  ${NSD_GetText} $pomOutputDir $1
  ${If} $1 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Choose a folder for the print files."
    Abort
  ${EndIf}
  StrCpy $2 $1 2
  StrCpy $3 $1 2 1
  ${If} $2 != "\\"
  ${AndIf} $3 != ":\"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Enter a full folder path, for example C:\Users\you\Documents\POM Builder."
    Abort
  ${EndIf}
  ClearErrors
  CreateDirectory $1
  ${IfNot} ${FileExists} "$1\*.*"
    MessageBox MB_OK|MB_ICONEXCLAMATION "POM Builder could not create the folder $1. Choose another folder."
    Abort
  ${EndIf}
  WriteRegStr HKCU "Software\POM Builder" "OutputDir" $1
FunctionEnd

!macro customPageAfterChangeDir
  Page custom PomOutputDirCreate PomOutputDirLeave
!macroend

!endif
