module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // SDK 54 + Reanimated 4 não usa mais 'react-native-reanimated/plugin'.
    // O suporte a worklets é automático via react-native-worklets.
  };
};
