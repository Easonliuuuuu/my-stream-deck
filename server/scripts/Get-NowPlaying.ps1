# Reads now-playing metadata from Windows System Media Transport Controls (SMTC).
# This works for whatever app currently holds the media session (Spotify, browser, etc.)
# without any per-app API/OAuth integration.
#
# WinRT APIs return IAsyncOperation, which PowerShell can't `await` natively. The
# AsTask/Await bridge below is a well-known community workaround for calling WinRT
# async methods directly from PowerShell.

# Windows PowerShell defaults redirected stdout to the system's legacy OEM
# codepage, which mangles non-ASCII track/artist names. Force UTF-8 so Node
# reads the JSON correctly.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

# Bounded wait (was Wait(-1), i.e. forever): the WinRT bridge above is a
# known deadlock risk (see comment at top of file). A permanently hung
# powershell.exe here used to mean the now-playing poll never recovered on
# its own — every 1.5s tick just piled up another process. Timing out and
# throwing lets the caller's try/catch fall back to idle instead.
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  if (-not $netTask.Wait(8000)) {
    throw "WinRT call timed out after 8s"
  }
  $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.RandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

# Any of these WinRT calls can throw transiently (session torn down mid-call,
# app that owned it just exited, etc). Previously an unhandled exception here
# meant a non-zero exit for the whole script, which the Node side treats as a
# hard poll failure (see wsHub.js's refreshNowPlaying) — the strip just stays
# blank forever with nothing surfaced to the user. Degrade to the same empty
# '{}' idle response a "no session" case already produces instead.
try {
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $session = $manager.GetCurrentSession()

  if ($null -eq $session) {
    [Console]::Error.WriteLine('Get-NowPlaying: no active SMTC session (GetCurrentSession returned null)')
    Write-Output '{}'
    exit
  }

  $info = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $playback = $session.GetPlaybackInfo()
}
catch {
  [Console]::Error.WriteLine("Get-NowPlaying: $($_.Exception.Message)")
  Write-Output '{}'
  exit
}

$artBase64 = $null
if ($null -ne $info.Thumbnail) {
  try {
    $stream = Await ($info.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $size = [uint32]$stream.Size
    if ($size -gt 0) {
      $reader = New-Object Windows.Storage.Streams.DataReader($stream)
      Await ($reader.LoadAsync($size)) ([UInt32]) | Out-Null
      $bytes = New-Object byte[] $size
      $reader.ReadBytes($bytes)
      $artBase64 = [Convert]::ToBase64String($bytes)
    }
  }
  catch {
    $artBase64 = $null
  }
}

$result = [PSCustomObject]@{
  title     = $info.Title
  artist    = $info.Artist
  album     = $info.AlbumTitle
  isPlaying = ($playback.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
  art       = $artBase64
}

$result | ConvertTo-Json -Depth 3
