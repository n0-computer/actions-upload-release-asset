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
exports.getApiBaseUrl = exports.parseUploadUrl = exports.canonicalName = exports.upload = void 0;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const glob = __importStar(require("@actions/glob"));
const http = __importStar(require("@actions/http-client"));
const mime = __importStar(require("mime-types"));
const path = __importStar(require("path"));
const url = __importStar(require("url"));
const newGitHubClient = (token) => {
    return new http.HttpClient("n0-actions-upload-release-asset/v1", [], {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });
};
// minium implementation of upload a release asset API.
// https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28#upload-a-release-asset
const uploadReleaseAsset = async (params) => {
    const client = newGitHubClient(params.githubToken);
    let rawurl = params.url;
    rawurl = rawurl.replace(/[{][^}]*[}]$/, "");
    const u = new url.URL(rawurl);
    if (params.name) {
        u.searchParams.append("name", params.name);
    }
    if (params.label) {
        u.searchParams.append("label", params.label);
    }
    const resp = await client.request("POST", u.toString(), params.data, params.headers);
    const statusCode = resp.message.statusCode;
    const contents = await resp.readBody();
    if (statusCode !== 201) {
        throw new Error(`unexpected status code: ${statusCode}\n${contents}`);
    }
    return {
        data: JSON.parse(contents),
    };
};
// minium implementation of delete a release asset API.
// https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28#delete-a-release-asset
const deleteReleaseAsset = async (params) => {
    const client = newGitHubClient(params.githubToken);
    const resp = await client.request("DELETE", params.url, "", {});
    const statusCode = resp.message.statusCode;
    const contents = await resp.readBody();
    if (statusCode !== 204) {
        throw new Error(`unexpected status code: ${statusCode}\n${contents}`);
    }
    return;
};
// minium implementation of get a release API.
// https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#get-a-release
const getRelease = async (params) => {
    const client = newGitHubClient(params.githubToken);
    const apiUrl = `${getApiBaseUrl()}/repos/${params.owner}/${params.repo}/releases/${params.releaseId}`;
    const resp = await client.request("GET", apiUrl, "", {});
    const statusCode = resp.message.statusCode;
    const contents = await resp.readBody();
    if (statusCode !== 200) {
        throw new Error(`unexpected status code: ${statusCode}\n${contents}`);
    }
    return {
        data: JSON.parse(contents),
    };
};
async function upload(opts) {
    const uploader = opts.uploadReleaseAsset || uploadReleaseAsset;
    const globber = await glob.create(opts.assetPath);
    const files = await globber.glob();
    await validateFilenames(files, opts);
    const urls = await Promise.all(files.map(async (file) => {
        const name = canonicalName(opts.assetName || path.basename(file));
        const content_type = opts.assetContentType || mime.lookup(file) || "application/octet-stream";
        const stat = await fsStats(file);
        core.info(`uploading ${file} as ${name}: size: ${stat.size}`);
        const response = await uploader({
            githubToken: opts.githubToken,
            url: opts.uploadUrl,
            headers: {
                "content-type": content_type,
                "content-length": stat.size,
            },
            name,
            data: fs.createReadStream(file),
        });
        core.debug(JSON.stringify(response));
        return response.data.browser_download_url;
    }));
    return {
        browser_download_url: urls.join("\n"),
    };
}
exports.upload = upload;
async function fsStats(file) {
    return new Promise((resolve, reject) => {
        fs.stat(file, (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stats);
        });
    });
}
async function validateFilenames(files, opts) {
    if (files.length > 1 && opts.assetName !== "") {
        throw new Error("validation error: cannot upload multiple files with asset_name option");
    }
    // get assets already uploaded
    const assets = {};
    const getter = opts.getRelease || getRelease;
    const { owner, repo, releaseId } = parseUploadUrl(opts.uploadUrl);
    const release = await getter({
        owner,
        repo,
        releaseId,
        githubToken: opts.githubToken,
    });
    for (const asset of release.data.assets) {
        assets[asset.name] = {
            name: asset.name,
            asset,
            files: [],
        };
    }
    // check duplications
    const duplications = [];
    for (const file of files) {
        const name = canonicalName(opts.assetName || path.basename(file));
        if (name in assets) {
            const asset = assets[name];
            duplications.push(asset);
            asset.files.push(file);
        }
        else {
            assets[name] = {
                name,
                files: [file],
            };
        }
    }
    // report the result of validation
    let errorCount = 0;
    for (const item of duplications) {
        if (item.files.length > 1) {
            core.error(`validation error: file name "${item.name}" is duplicated. (${item.files.join(", ")})`);
            errorCount++;
        }
    }
    // report the result of validation
    const deleteAssets = [];
    for (const item of duplications) {
        if (item.files.length === 1 && item.asset) {
            deleteAssets.push(item.asset);
        }
    }
    if (!opts.overwrite) {
        for (const item of deleteAssets) {
            core.error(`validation error: file name "${item.name}" already exists`);
            errorCount++;
        }
    }
    if (errorCount > 0) {
        throw new Error("validation error");
    }
    if (!opts.overwrite || deleteAssets.length === 0) {
        return;
    }
    const deleter = opts.deleteReleaseAsset || deleteReleaseAsset;
    await Promise.all(deleteAssets.map(async (asset) => {
        core.info(`deleting asset ${asset.name} before uploading`);
        await deleter({
            url: asset.url,
            githubToken: opts.githubToken,
        });
    }));
}
// we rename the filenames here to avoid being renamed by API.
//
// https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28#upload-a-release-asset
// > GitHub renames asset filenames that have special characters,
// > non-alphanumeric characters, and leading or trailing periods.
// > The "List assets for a release" endpoint lists the renamed filenames.
function canonicalName(name) {
    name = name.replace(/[,/]/g, ".");
    name = name.replace(/[^-+@_.a-zA-Z0-9]/g, "");
    name = name.replace(/[.]+/g, ".");
    if (name.match(/^[.].+$/)) {
        return `default${name.replace(/[.]$/, "")}`;
    }
    if (name.match(/^[^.]+[.]$/)) {
        return `default.${name.replace(/[.]$/, "")}`;
    }
    return name.replace(/[.]$/, "");
}
exports.canonicalName = canonicalName;
const regexUploadUrl = new RegExp("/repos/(?<owner>[^/]+)/(?<repo>[^/]+)/releases/(?<release_id>[0-9]+)/");
function parseUploadUrl(rawurl) {
    const match = rawurl.match(regexUploadUrl);
    if (!match || !match.groups) {
        throw new Error(`failed to parse the upload url: ${rawurl}`);
    }
    const groups = match.groups;
    return {
        owner: groups["owner"],
        repo: groups["repo"],
        releaseId: groups["release_id"],
    };
}
exports.parseUploadUrl = parseUploadUrl;
function getApiBaseUrl() {
    return process.env["GITHUB_API_URL"] || "https://api.github.com";
}
exports.getApiBaseUrl = getApiBaseUrl;
