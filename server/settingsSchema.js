// Validates a key instance's settings object against its bound action's
// declared settingsSchema. Two passes exist because two different things can
// go stale: the shape of the settings object (checked here, at write time)
// and the liveness of a dynamically-sourced value like a device id (checked
// again at use time, by validateDynamicOption, since a device can disappear
// between when a key was configured and when it's pressed).

function validateSettings(schema, settings) {
  schema = schema || {};
  settings = settings || {};
  const errors = [];

  for (const key of Object.keys(settings)) {
    if (!(key in schema)) errors.push(`Unknown setting: ${key}`);
  }

  for (const [key, field] of Object.entries(schema)) {
    if (!(key in settings)) continue;
    const value = settings[key];

    if (field.type === 'text' && typeof value !== 'string') {
      errors.push(`Setting "${key}" must be a string`);
      continue;
    }

    if (field.type === 'select') {
      if (typeof value !== 'string') {
        errors.push(`Setting "${key}" must be a string`);
      } else if (Array.isArray(field.options) && !field.options.includes(value)) {
        errors.push(`Setting "${key}" has invalid value: ${value}`);
      }
      // field.optionsFrom names a live source and cannot be checked here —
      // see validateDynamicOption, applied at the point of use.
    }
  }

  return errors;
}

function validateDynamicOption(liveOptions, value) {
  return Array.isArray(liveOptions) && liveOptions.some((o) => o.id === value);
}

module.exports = { validateSettings, validateDynamicOption };
