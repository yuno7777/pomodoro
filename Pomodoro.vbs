' Double-click launcher for the Pomodoro app.
' Runs the Electron launcher script with no visible terminal window.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir
' Clear ELECTRON_RUN_AS_NODE for this process tree, then launch silently.
sh.Run "cmd /c set ""ELECTRON_RUN_AS_NODE="" && node start.js", 0, False
