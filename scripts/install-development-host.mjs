// Explicit local developer-profile installation; no market publication.
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const directory = option("--directory");
if (!directory || !path.isAbsolute(directory))
  throw Error("Explicit absolute --directory required");
const endpoint = new URL(option("--endpoint"));
if (
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash ||
  (endpoint.protocol !== "https:" &&
    !(
      endpoint.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(endpoint.hostname)
    ))
) {
  throw Error("Trusted MCP endpoint required");
}
const ui = await readFile(new URL("../dist/index.html", import.meta.url));
const definition = {
  id: "io.openmuse.repository-review",
  title: "Repository Review",
  version: JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ).version,
  desktopNavigation: 1,
  navigationIcon: "review",
  endpoint: endpoint.href,
  uiResourceUri: "ui://repository-review/main",
  uiFile: "repository-review.html",
  uiSha256: createHash("sha256").update(ui).digest("hex"),
};
let list = [];
try {
  list = JSON.parse(await readFile(path.join(directory, "apps.json"), "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const previous = list.find((app) => app.id === definition.id);
if (previous?.owner) definition.owner = previous.owner;
let token;
if (!previous?.owner) {
  const file = option("--credential-file");
  if (!file || !path.isAbsolute(file))
    throw Error(
      "Explicit private --credential-file required for first installation",
    );
  token = (await readFile(file, "utf8")).trim();
  if (!token || /[\r\n]/.test(token)) throw Error("Invalid credential file");
}
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
await writeFile(path.join(directory, definition.uiFile), ui, { mode: 0o600 });
await writeFile(
  path.join(directory, "apps.json"),
  JSON.stringify(
    [...list.filter((app) => app.id !== definition.id), definition],
    null,
    2,
  ),
  { mode: 0o600 },
);
if (token)
  await writeFile(path.join(directory, definition.id + ".token"), token, {
    mode: 0o600,
  });
console.log(
  "Reviewed Repository Review UI installed into the explicit Desktop developer profile.",
);
