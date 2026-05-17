const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const {
    wrapWithReanimatedMetroConfig,
} = require('react-native-reanimated/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

const wrappedConfig = withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
    cssEntryFile: path.resolve(workspaceRoot, 'packages/app/global.css'),
});

const defaultResolveRequest = wrappedConfig.resolver.resolveRequest;
const yallistV4Path = path.resolve(
    workspaceRoot,
    'node_modules/lru-cache/node_modules/yallist/yallist.js',
);

wrappedConfig.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'yallist') {
        return {
            type: 'sourceFile',
            filePath: yallistV4Path,
        };
    }

    if (defaultResolveRequest) {
        return defaultResolveRequest(context, moduleName, platform);
    }

    return context.resolveRequest(context, moduleName, platform);
};

module.exports = wrappedConfig;
