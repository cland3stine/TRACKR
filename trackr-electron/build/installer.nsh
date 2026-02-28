; TRACKR — Custom NSIS installer hooks
; Adds/removes Windows Firewall rule for the API server (port 8755)

!macro customInstall
  ; Remove any existing rule first (idempotent — prevents "rule already exists" failure)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TRACKR API"'
  ; Add inbound firewall rule for TRACKR API port
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="TRACKR API" dir=in action=allow protocol=tcp localport=8755 enable=yes profile=private,public'
!macroend

!macro customUnInstall
  ; Remove firewall rule on uninstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="TRACKR API"'
!macroend
