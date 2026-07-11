const { runScript } = require('./psRunner');

// Discord minimizes to the system tray on a plain window close rather than
// exiting, so a graceful WM_CLOSE wouldn't actually quit it — force-killing
// every process named "Discord" (it runs as several: renderer, GPU,
// utility) is the only mechanism that reliably works, and is low-risk for a
// chat client with no unsaved-document state.
async function closeDiscord() {
  return runScript('Stop-ProcessByName.ps1', ['-ProcessName', 'Discord']);
}

// `hotkey` must match a keybind the user has marked "Global" in Discord's
// own Settings → Keybinds — Discord has no local control API without
// registering an OAuth app for RPC, so simulating their own already-global
// hotkey is the only OS-level option available here.
async function toggleDiscordMute(hotkey) {
  if (!hotkey || !hotkey.trim()) {
    throw new Error('Set a mute hotkey in this key\'s settings, matching a Global keybind in Discord\'s own Settings → Keybinds');
  }
  return runScript('Send-Hotkey.ps1', ['-Combo', hotkey.trim()]);
}

module.exports = { closeDiscord, toggleDiscordMute };
