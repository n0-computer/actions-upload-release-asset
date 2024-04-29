"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const upload_release_asset_1 = require("./upload-release-asset");
async function run() {
    try {
        const required = { required: true };
        const githubToken = core.getInput("github_token", required);
        const uploadUrl = core.getInput("upload_url", required);
        const assetPaths = core.getInput("asset_path", required).split(",");
        const assetName = core.getInput("asset_name");
        const assetContentType = core.getInput("asset_content_type");
        const overwrite = core.getBooleanInput("overwrite", required);
        const outputs = [];
        for (const assetPath of assetPaths) {
            const output = await (0, upload_release_asset_1.upload)({
                githubToken,
                uploadUrl,
                assetPath,
                assetName,
                assetContentType,
                overwrite,
            });
            outputs.push(output.browser_download_url);
        }
        core.setOutput("browser_download_urls", outputs);
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error);
        }
        else {
            core.setFailed(`${error}`);
        }
    }
}
void run();
