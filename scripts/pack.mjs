import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";

const out = "dist/package";
await mkdir(out + "/dist", { recursive: true });
const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: out + "/server.mjs",
  metafile: true,
  banner: {
    js: "import {createRequire as _createRequire} from 'node:module';const require=_createRequire(import.meta.url);",
  },
});
await writeFile(out + "/dist/index.html", await readFile("dist/index.html"));
// Bundled server resolves ../dist/index.html; keep the portable relative path.
const server = (await readFile(out + "/server.mjs", "utf8")).replace(
  "../dist/index.html",
  "./dist/index.html",
);
await writeFile(out + "/server.mjs", server);
const manifest = {
  manifest_version: "0.3",
  name: "repository-review",
  display_name: "Repository Review",
  version: "0.2.0",
  description:
    "Shared highlighted repository and file version review for OpenMuse Desktop and paired Mobile.",
  author: { name: "OpenMuse contributors" },
  compatibility: {
    platforms: ["darwin", "linux", "win32"],
    runtimes: { node: ">=22.13.0" },
  },
  user_config: {
    provider_config: {
      type: "string",
      title: "Operator-owned repository grants and identity config file",
      required: true,
    },
  },
  server: {
    type: "node",
    entry_point: "server.mjs",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/server.mjs"],
      env: { REVIEW_CONFIG: "${user_config.provider_config}" },
    },
  },
};
await writeFile(
  out + "/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
const inputs = [
    ...Object.keys(result.metafile.inputs),
    ...JSON.parse(await readFile("dist/web-inputs.json", "utf8")),
  ],
  packages = new Set();
for (const input of inputs) {
  if (!input.includes("node_modules/")) continue;
  let dir = path.dirname(path.resolve(input));
  while (dir !== path.dirname(dir)) {
    if (await stat(path.join(dir, "package.json")).catch(() => null)) {
      packages.add(dir);
      break;
    }
    dir = path.dirname(dir);
  }
}
let notices = "";
for (const dir of [...packages].sort()) {
  const pkg = JSON.parse(
    await readFile(path.join(dir, "package.json"), "utf8"),
  );
  notices += pkg.name + " " + pkg.version + "\n";
  const files = (await readdir(dir)).filter((f) =>
    /^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)/i.test(f),
  );
  for (const file of files)
    if ((await stat(path.join(dir, file))).isFile())
      notices += (await readFile(path.join(dir, file), "utf8")) + "\n";
  if (!files.length) notices += "License identifier: " + pkg.license + "\n";
  notices += "\n";
}
await writeFile(out + "/THIRD-PARTY-NOTICES.txt", notices);
const zip = new JSZip();
for (const f of [
  "manifest.json",
  "server.mjs",
  "dist/index.html",
  "THIRD-PARTY-NOTICES.txt",
])
  zip.file(f, await readFile(out + "/" + f), {
    date: new Date("2020-01-01T00:00:00Z"),
    createFolders: false,
  });
const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  }),
  sha = (b) => createHash("sha256").update(b).digest("hex");
await writeFile("dist/repository-review-0.2.0.mcpb", bytes);
const release = {
  profile: "openmuse.installed-app/1",
  status: "acceptance-candidate",
  pluginId: "io.openmuse.repository-review",
  version: "0.2.0",
  uiResourceUri: "ui://repository-review/main",
  uiDigest: sha(await readFile("dist/index.html")),
  packageDigest: sha(bytes),
  executionModes: ["local-stdio", "remote-mcp"],
  remoteRequires: ["trusted-backend-binding", "serverTools"],
  targets: ["darwin", "android", "ios"],
  marketApproved: false,
};
await writeFile(
  "dist/release.candidate.json",
  JSON.stringify(release, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    package: "dist/repository-review-0.2.0.mcpb",
    bytes: bytes.length,
    sha256: sha(bytes),
    marketApproved: false,
  }),
);
