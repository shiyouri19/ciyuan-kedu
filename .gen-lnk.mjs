import fs from 'node:fs';

/**
 * 生成一个无弹窗的快捷方式创建脚本。
 * PowerShell 直接 new COM 对象被安全策略拦了，所以走 wscript。
 * 保持 ASCII + UTF-16LE BOM，中文注释才不会被 ANSI 解析成乱码。
 */
const vbs = `Option Explicit
Dim fso, shell, rootDir, made
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
made = 0
If MakeLink(shell.SpecialFolders("Desktop") & "\\次元刻度.lnk") Then made = made + 1
If MakeLink(shell.SpecialFolders("Programs") & "\\次元刻度.lnk") Then made = made + 1
WScript.Echo "created=" & made

Function MakeLink(lnkPath)
  On Error Resume Next
  Dim link
  Set link = shell.CreateShortcut(lnkPath)
  link.TargetPath = "wscript.exe"
  link.Arguments = """" & rootDir & "\\次元刻度.vbs"""
  link.WorkingDirectory = rootDir
  link.IconLocation = rootDir & "\\web\\icon.ico,0"
  link.Description = "次元刻度"
  link.WindowStyle = 1
  link.Save
  If Err.Number = 0 Then MakeLink = True Else MakeLink = False
  Err.Clear
  On Error GoTo 0
End Function
`;

const target = 'E:/次元刻度/.make-lnk.vbs';
fs.writeFileSync(target, '\ufeff' + vbs, 'utf16le');
console.log('已生成', target);
