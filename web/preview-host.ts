import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
const bridge = new AppBridge(
  null,
  { name: "Repository Review local web inspection", version: "0.1.0" },
  { serverTools: {} },
);
bridge.oncalltool = async (params) => {
  const result = await fetch("/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!result.ok) throw Error("Inspection bridge unavailable");
  return result.json();
};
await bridge.connect(
  new PostMessageTransport(frame.contentWindow!, frame.contentWindow!),
);
frame.src = "/view";
