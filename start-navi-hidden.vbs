' Starts the Minima agent server with no window. Used by AUTOSTART-ON.bat.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = here
py = here & "\.venv\Scripts\python.exe"
If fso.FileExists(py) Then
  sh.Run """" & py & """ -m uvicorn backend.server:app --host 127.0.0.1 --port 8000", 0, False
End If
