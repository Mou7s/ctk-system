const nodeModule = require('node:module') || require('module');
const originalCreateRequire = nodeModule.createRequire;
if (originalCreateRequire) {
  nodeModule.createRequire = function (filename) {
    if (typeof filename === 'string' && (filename === 'file:///_entry.js' || filename.startsWith('file:///_'))) {
      return originalCreateRequire(__filename);
    }
    try {
      return originalCreateRequire(filename);
    } catch (e) {
      return originalCreateRequire(__filename);
    }
  };
}
