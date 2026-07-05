const HID = require('node-hid');

const SONY_VENDOR_ID = 0x054c;
const DUALSENSE_PRODUCT_ID = 0x0ce6;
const BT_REPORT_ID = 0x31;

// Best-known offset from community reverse-engineering of the DualSense
// Bluetooth input report (report ID 0x31). Bluetooth reports carry a leading
// report-ID byte plus extra header bytes not present in the USB report, which
// shifts this offset relative to USB, and it has been known to vary by
// firmware. Run `npm run calibrate-controller` against your actual controller
// and adjust this value if the parsed battery doesn't track real charge/drain.
const BATTERY_BYTE_INDEX = 54;

// Report ID of the feature report to request once on connect. Over
// Bluetooth the DualSense starts out sending only a short input report
// (no sensor/battery data) until the host requests this feature report —
// the same handshake DualShock4 needs — after which it switches to the
// full BT_REPORT_ID input report.
const WAKE_FEATURE_REPORT_ID = 0x05;
const WAKE_FEATURE_REPORT_LENGTH = 41;

const DISCONNECTED_STATE = { connected: false, battery: null, charging: null };

let device = null;
let lastState = { ...DISCONNECTED_STATE };

function findDualSense() {
  return HID.devices().find((d) => d.vendorId === SONY_VENDOR_ID && d.productId === DUALSENSE_PRODUCT_ID);
}

function parseBatteryByte(byte) {
  const level = byte & 0x0f; // 0-10 steps
  const charging = (byte & 0x10) !== 0;
  const full = (byte & 0x20) !== 0;
  return {
    battery: full ? 100 : Math.min(100, Math.round((level / 10) * 100)),
    charging,
  };
}

function connect() {
  try {
    const info = findDualSense();
    if (!info) {
      lastState = { ...DISCONNECTED_STATE };
      device = null;
      return;
    }

    device = new HID.HID(info.path);
    lastState = { connected: true, battery: lastState.battery, charging: lastState.charging };

    try {
      device.getFeatureReport(WAKE_FEATURE_REPORT_ID, WAKE_FEATURE_REPORT_LENGTH);
    } catch {
      // If the handshake isn't supported in this connection state, `connected`
      // still reports correctly; battery just won't populate until a future
      // reconnect succeeds in requesting it.
    }

    device.on('data', (data) => {
      if (data[0] !== BT_REPORT_ID || data.length <= BATTERY_BYTE_INDEX) return;
      lastState = { connected: true, ...parseBatteryByte(data[BATTERY_BYTE_INDEX]) };
    });

    device.on('error', () => {
      lastState = { ...DISCONNECTED_STATE };
      device = null;
    });
  } catch (e) {
    lastState = { ...DISCONNECTED_STATE };
    device = null;
  }
}

function getControllerState() {
  if (!device) connect();
  return lastState;
}

function calibrate() {
  const info = findDualSense();
  if (!info) {
    console.log('No DualSense found. Make sure it is paired and connected over Bluetooth.');
    return;
  }
  console.log(`Found DualSense at ${info.path}.`);
  const d = new HID.HID(info.path);
  try {
    d.getFeatureReport(WAKE_FEATURE_REPORT_ID, WAKE_FEATURE_REPORT_LENGTH);
  } catch (e) {
    console.log(`Warning: wake handshake failed (${e.message}) — reports may stay in short/basic mode.`);
  }
  console.log('Dumping raw input reports — press Ctrl+C to stop.');
  console.log('Plug/unplug the charging cable and watch which byte changes to find the real battery offset.');
  d.on('data', (data) => {
    console.log([...data].map((b) => b.toString(16).padStart(2, '0')).join(' '));
  });
}

if (require.main === module && process.argv.includes('--calibrate')) {
  calibrate();
}

module.exports = { getControllerState, parseBatteryByte };
