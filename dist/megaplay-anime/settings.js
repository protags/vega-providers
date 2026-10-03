// settings.js — defines custom settings for Protags Network provider
// Works on both vega-app (MMKV) and vega-desktop (localStorage via Tauri)
exports.getSettingsSchema = async function getSettingsSchema({ providerContext }) {
  return [
    {
      key: "serverUrl",
      type: "text",
      label: "Backend Server URL",
      description: "URL of your running Express backend server (e.g. https://cdn.originory.com). Leave blank to use the default.",
      placeholder: "https://cdn.originory.com",
      defaultValue: "https://cdn.originory.com"
    }
  ];
};
