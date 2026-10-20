!include nsDialogs.nsh

Var pomOutputDir

Function PomOutputDirCreate
  ReadRegStr $1 HKCU "Software\POM Builder" "OutputDir"
  ${If} ${Silent}
  ${OrIf} $1 != ""
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 12u "Where should POM Builder save the print files?"
  Pop $0
  ${NSD_CreateDirRequest} 0 15u 100% 12u "$DOCUMENTS\POM Builder"
  Pop $pomOutputDir
  nsDialogs::Show
FunctionEnd

Function PomOutputDirLeave
  ${NSD_GetText} $pomOutputDir $1
  CreateDirectory $1
  WriteRegStr HKCU "Software\POM Builder" "OutputDir" $1
FunctionEnd

!macro customPageAfterChangeDir
  Page custom PomOutputDirCreate PomOutputDirLeave
!macroend
