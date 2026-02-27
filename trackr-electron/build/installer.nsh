; TRACKR — Custom NSIS installer hooks
; Adds/removes Windows Firewall rule for the API server (port 8755)

!macro customInstall
  ; Add inbound firewall rule for TRACKR executable
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="TRACKR API" dir=in action=allow program="$INSTDIR\TRACKR.exe" enable=yes profile=private,public protocol=tcp localport=8755'
!macroend

!macro customUnInstall
  ; Remove firewall rule on uninstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TRACKR API"'
!macroend
