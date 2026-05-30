module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated v4 worklets plugin — MUST be listed last.
    plugins: ['react-native-worklets/plugin'],
  };
};
