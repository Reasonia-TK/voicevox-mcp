param(
    [Parameter(Mandatory = $true)]
    [string]$WavPath
)

$ErrorActionPreference = 'Stop'
$resolved = Resolve-Path -LiteralPath $WavPath
$player = New-Object System.Media.SoundPlayer

try {
    $player.SoundLocation = $resolved.Path
    $player.Load()
    $player.PlaySync()
}
finally {
    $player.Dispose()
}
