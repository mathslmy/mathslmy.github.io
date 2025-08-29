/*
 * 智能媒体助手 - 轻量版
 * 功能：图片处理、文档处理、API 支持
 * 作者: mathslmy
 */

// ========== 文件类型定义 ==========
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
const DOC_TYPES = [
  "text/plain", "application/json", "text/markdown", "text/csv",
  "text/html", "text/xml", "application/xml",
  "text/javascript", "application/javascript", "text/css", "application/rtf"
];

// ========== 文件类型检测 ==========
window.__isDocumentFile = function(file) {
  return DOC_TYPES.includes(file.type) || /\.(txt|json|md|csv|html|xml|js|css|rtf|log|conf|config|ini|yaml|yml)$/i.test(file.name);
};

window.__getSupportedFileTypes = function() {
  return { images: IMAGE_TYPES, documents: DOC_TYPES };
};

// ========== 图片处理 ==========
window.__uploadImageByPlugin = async function(file) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("不支持的图片类型");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const maxDim = 2048;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          resolve({
            success: true,
            file: blob,
            metadata: { width, height, type: blob.type, size: blob.size }
          });
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
};

// ========== 文档处理 ==========
window.__processDocumentByPlugin = async function(file) {
  if (!window.__isDocumentFile(file)) throw new Error("不支持的文档类型");
  const text = await file.text();
  return {
    success: true,
    content: text.slice(0, 10000), // 避免过大
    metadata: { type: file.type, size: file.size, name: file.name }
  };
};

// ========== 通用处理 ==========
window.__processFileByPlugin = async function(file) {
  if (IMAGE_TYPES.includes(file.type)) {
    return window.__uploadImageByPlugin(file);
  } else if (window.__isDocumentFile(file)) {
    return window.__processDocumentByPlugin(file);
  } else {
    throw new Error("不支持的文件类型");
  }
};
