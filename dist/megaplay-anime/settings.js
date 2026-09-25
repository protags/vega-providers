// settings.js — defines custom settings for MegaPlay Anime provider in Vega App
exports.getSettingsSchema = async function getSettingsSchema({ providerContext }) {
  return [
    {
      key: "serverUrl",
      type: "text",
      label: "Backend Server URL",
      description: "URL of your running Express backend server",
      placeholder: "https://cdn.originory.com",
      defaultValue: "https://cdn.originory.com"
    }
  ];
};
