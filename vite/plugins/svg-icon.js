import fs from "fs";
import path from "path";
import fg from "fast-glob";

const virtualModuleId = "virtual:svg-icons-register";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;
const spriteElementId = "__app_svg_sprite__";

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function getSymbolId(iconDir, file) {
  const relativePath = normalizePath(path.relative(iconDir, file));
  const parsed = path.parse(relativePath);
  const dir = normalizePath(parsed.dir).replace(/\//g, "-");
  return dir ? `icon-${dir}-${parsed.name}` : `icon-${parsed.name}`;
}

function createSymbol(file, iconDir) {
  const svg = fs
    .readFileSync(file, "utf8")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .trim();

  const match = svg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!match) {
    return "";
  }

  const attrs = match[1] || "";
  const body = match[2] || "";
  const viewBoxMatch = attrs.match(/\bviewBox=(['"])(.*?)\1/i);
  let viewBoxAttr = viewBoxMatch ? ` viewBox="${viewBoxMatch[2]}"` : "";

  if (!viewBoxAttr) {
    const widthMatch = attrs.match(/\bwidth=(['"])(.*?)\1/i);
    const heightMatch = attrs.match(/\bheight=(['"])(.*?)\1/i);
    if (widthMatch && heightMatch) {
      viewBoxAttr = ` viewBox="0 0 ${widthMatch[2]} ${heightMatch[2]}"`;
    }
  }

  return `<symbol id="${getSymbolId(iconDir, file)}"${viewBoxAttr}>${body}</symbol>`;
}

function createSprite(iconDir) {
  const files = fg.sync("**/*.svg", {
    cwd: iconDir,
    absolute: true,
  });

  const symbols = files.map((file) => createSymbol(file, iconDir)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" id="${spriteElementId}">${symbols}</svg>`;
}

export default function createSvgIcon() {
  const iconDir = path.resolve(process.cwd(), "app/assets/icons/svg");

  return {
    name: "local-svg-sprite",
    enforce: "pre",
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) {
        return null;
      }

      const sprite = JSON.stringify(createSprite(iconDir));
      return `
const sprite = ${sprite};

function mountSvgSprite() {
  if (typeof document === "undefined") return;
  if (document.getElementById("${spriteElementId}")) return;
  document.body.insertAdjacentHTML("afterbegin", sprite);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountSvgSprite, { once: true });
} else {
  mountSvgSprite();
}

export default mountSvgSprite;
`;
    },
    configureServer(server) {
      server.watcher.add(iconDir);
    },
    handleHotUpdate(ctx) {
      if (!normalizePath(ctx.file).startsWith(normalizePath(iconDir))) {
        return;
      }

      const module = ctx.server.moduleGraph.getModuleById(resolvedVirtualModuleId);
      if (module) {
        ctx.server.moduleGraph.invalidateModule(module);
      }
      ctx.server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}
