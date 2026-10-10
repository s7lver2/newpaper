; Registro de newpaper como navegador candidato (por usuario). El usuario lo elige en
; Configuración › Aplicaciones predeterminadas; Windows no permite asociar solo dominios de noticias.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\newpaperURL" "" "newpaper URL"
  WriteRegStr HKCU "Software\Classes\newpaperURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\newpaperURL\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\newpaperURL\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper" "" "newpaper"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\Capabilities" "ApplicationName" "newpaper"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\Capabilities" "ApplicationDescription" "newpaper"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\Capabilities\URLAssociations" "http" "newpaperURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\Capabilities\URLAssociations" "https" "newpaperURL"
  WriteRegStr HKCU "Software\RegisteredApplications" "newpaper" "Software\Clients\StartMenuInternet\newpaper\Capabilities"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\newpaperURL"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\newpaper"
  DeleteRegValue HKCU "Software\RegisteredApplications" "newpaper"
!macroend
