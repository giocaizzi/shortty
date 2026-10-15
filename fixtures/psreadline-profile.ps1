# PowerShell profile (tests also run it with CRLF line endings)
Import-Module posh-git
Set-PSReadLineOption -EditMode Emacs
Set-PSReadLineKeyHandler -Chord 'Ctrl+d' -Function DeleteChar
Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
Set-PSReadLineKeyHandler -Chord 'Ctrl+UpArrow','Ctrl+DownArrow' -Function HistorySearchBackward
Set-PSReadLineKeyHandler Alt+w SelectAll
Remove-PSReadLineKeyHandler -Chord 'Ctrl+r'
Set-PSReadLineKeyHandler -Key 'Ctrl+Shift+b' `
    -BriefDescription BuildCurrentDirectory -ScriptBlock {
    [Microsoft.PowerShell.PSConsoleReadLine]::Insert("dotnet build")
}
# Set-PSReadLineKeyHandler -Chord 'Ctrl+q' -Function Abort
