Option Explicit
' ============================================================
'  ciyuan-kedu launcher entry
'  Job: locate node.exe, hand over to launcher.js, exit.
'  All user-facing messages are in launcher.js (UTF-8 safe).
'  Keep this file ASCII-only: wscript reads .vbs as ANSI,
'  Chinese text saved as UTF-8 would come out garbled.
' ============================================================

Dim fso, shell, rootDir, nodePath, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = rootDir

nodePath = FindNode(fso, shell)

If nodePath = "" Then
  MsgBox "Node.js not found." & vbCrLf & vbCrLf & _
         "ciyuan-kedu needs Node.js 22 or newer to run." & vbCrLf & _
         "Download: https://nodejs.org/" & vbCrLf & vbCrLf & _
         "Already installed? Add its folder to PATH and retry.", _
         16, "ciyuan-kedu"
  WScript.Quit 1
End If

cmd = """" & nodePath & """ --disable-warning=ExperimentalWarning """ & rootDir & "\launcher.js"""
shell.Run cmd, 0, False

Function FindNode(fso, shell)
  Dim p, paths, reg, exec, line
  FindNode = ""

  ' 1) install path recorded by the Node.js MSI
  On Error Resume Next
  reg = shell.RegRead("HKLM\SOFTWARE\Node.js\InstallPath")
  If Err.Number = 0 And Len(reg) > 0 Then
    If fso.FileExists(reg & "node.exe") Then FindNode = reg & "node.exe"
  End If
  Err.Clear
  On Error GoTo 0
  If FindNode <> "" Then Exit Function

  ' 2) common install locations
  paths = Array( _
    "C:\Program Files\nodejs\node.exe", _
    "C:\Program Files (x86)\nodejs\node.exe", _
    "D:\nodejs\node.exe", _
    "E:\nodejs\node.exe", _
    shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node.exe", _
    shell.ExpandEnvironmentStrings("%APPDATA%") & "\npm\node.exe" _
  )
  For Each p In paths
    If fso.FileExists(p) Then
      FindNode = p
      Exit Function
    End If
  Next

  ' 3) whatever PATH resolves to
  On Error Resume Next
  Set exec = shell.Exec("cmd /c where node.exe")
  If Not exec.StdOut.AtEndOfStream Then
    line = Trim(exec.StdOut.ReadLine())
    If fso.FileExists(line) Then FindNode = line
  End If
  Err.Clear
  On Error GoTo 0
End Function
