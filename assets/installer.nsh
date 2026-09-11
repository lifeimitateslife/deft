!macro deftAssociate EXT
  WriteRegNone SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "DEFT.Document"
  WriteRegStr SHCTX "Software\Classes\Applications\DEFT.exe\SupportedTypes" ".${EXT}" ""
  WriteRegStr SHCTX "Software\DEFT\Capabilities\FileAssociations" ".${EXT}" "DEFT.Document"
!macroend

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\DEFT.Document" "" "DEFT document"
  WriteRegStr SHCTX "Software\Classes\DEFT.Document\DefaultIcon" "" '$"$INSTDIR\resources\document.ico$"'
  WriteRegStr SHCTX "Software\Classes\DEFT.Document\shell\open\command" "" '$"$INSTDIR\DEFT.exe$" $"%1$"'
  WriteRegStr SHCTX "Software\Classes\Applications\DEFT.exe\shell\open\command" "" '$"$INSTDIR\DEFT.exe$" $"%1$"'
  WriteRegStr SHCTX "Software\DEFT\Capabilities" "ApplicationName" "DEFT"
  WriteRegStr SHCTX "Software\DEFT\Capabilities" "ApplicationDescription" "A fast, focused text and Markdown editor."
  WriteRegStr SHCTX "Software\RegisteredApplications" "DEFT" "Software\DEFT\Capabilities"
  !insertmacro deftAssociate "md"
  !insertmacro deftAssociate "markdown"
  !insertmacro deftAssociate "mdown"
  !insertmacro deftAssociate "txt"
  !insertmacro deftAssociate "log"
!macroend

!macro deftUnassociate EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "DEFT.Document"
!macroend

!macro customUnInstall
  !insertmacro deftUnassociate "md"
  !insertmacro deftUnassociate "markdown"
  !insertmacro deftUnassociate "mdown"
  !insertmacro deftUnassociate "txt"
  !insertmacro deftUnassociate "log"
  DeleteRegKey SHCTX "Software\Classes\DEFT.Document"
  DeleteRegKey SHCTX "Software\Classes\Applications\DEFT.exe"
  DeleteRegKey SHCTX "Software\DEFT"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "DEFT"
!macroend
