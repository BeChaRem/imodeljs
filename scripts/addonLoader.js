"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

function getPlatformDir() {
    const arch = process.arch;
    if (process.platform === "win32") {
        return "win" + arch;
    }
    return process.platform + arch;
}
function computeAddonPackageName() {
    // Examples:
    // @bentley/imodeljs-n_8_2-winx64 1.0.44
    // @bentley/imodeljs-e_1_6_11-winx64 1.0.44
    let versionCode;
    const electronVersion = process.versions.electron;
    if (typeof (electronVersion) !== "undefined") {
        versionCode = "e_" + electronVersion.replace(/\./g, '_');
    }
    else {
        const nodeVersion = process.version.substring(1).split('.'); // strip off the character 'v' from the start of the string
        versionCode = "n_" + nodeVersion[0] + '_' + nodeVersion[1]; // use only major and minor version numbers
    }
    return "@bentley/imodeljs-" + versionCode + "-" + getPlatformDir();
}
exports.computeAddonPackageName = computeAddonPackageName;
function loadNodeAddon() {
    if (typeof (process) === "undefined" || process.version === "")
        return undefined;
    // tslint:disable-next-line:no-var-requires
    const addon = (process.env.ADDON_PATH !== undefined) ? require(process.env.ADDON_PATH + computeAddonPackageName() + "/addon/imodeljs.node") : require(computeAddonPackageName() + "/addon/imodeljs.node");
    if (!addon)
        return undefined;

    if (addon.setTickKicker) {
        addon.setTickKicker(function() {});    
    }
    
    return addon;
}
exports.loadNodeAddon = loadNodeAddon;

