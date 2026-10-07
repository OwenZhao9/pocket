const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
// The deployment addresses live in ../config so contracts, server and app share one file.
config.watchFolders = [path.resolve(__dirname, "../config")];

module.exports = config;
