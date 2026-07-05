# Reads now-playing metadata from Windows System Media Transport Controls (SMTC).
# This works for whatever app currently holds the media session (Spotify, browser, etc.)
# without any per-app API/OAuth integration.
#
# WinRT APIs return IAsyncOperation, which PowerShell can't `await` natively. The
# AsTask/Await bridge below is a well-known community workaround for calling WinRT
# async methods directly from PowerShell.

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.RandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetCurrentSession()

if ($null -eq $session) {
  Write-Output '{}'
  exit
}

$info = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$playback = $session.GetPlaybackInfo()

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
