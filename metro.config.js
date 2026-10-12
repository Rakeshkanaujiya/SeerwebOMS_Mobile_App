const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  apiurl: path.resolve(__dirname, 'apiurl.tsx'),
  components: path.resolve(__dirname, 'components'),
  context: path.resolve(__dirname, 'context'),
  screens: path.resolve(__dirname, 'screens'),
  src: path.resolve(__dirname, 'src'),
  types: path.resolve(__dirname, 'types'),
};

module.exports = withNativeWind(config, { input: './global.css' });
