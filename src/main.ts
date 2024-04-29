import * as core from "@actions/core";
import { upload } from "./upload-release-asset";

async function run(): Promise<void> {
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
      const output = await upload({
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
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error);
    } else {
      core.setFailed(`${error}`);
    }
  }
}

void run();
