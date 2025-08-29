/*
 * 智能媒体助手 - 轻量版
 * 功能：图片处理、文档处理、API 支持（含模型列表实时拉取+切换）
 * 规范：SillyTavern 扩展（使用 extensionSettings、saveSettingsDebounced）
 */

import {
    getContext,
    saveSettingsDebounced,
} from "../../../extensions.js";

const MODULE_NAME = "smartMedia";
const context = getContext();

const DEFAULT_CONFIG = {
    apiUrl: "",
    apiKey: "",
    apiModel: "",
};

function getConfig() {
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = { ...DEFAULT_CONFIG };
    }
    return context.extensionSettings[MODULE_NAME];
}

// ========== 文件类型 ==========
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
const DOC_TYPES = [
    "text/plain", "application/json", "text/markdown", "text/csv",
    "text/html", "text/xml", "application/xml",
    "text/javascript", "application/javascript", "text/css", "application/rtf"
];

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
        content: text.slice(0, 10000),
        metadata: { type: file.type, size: file.size, name: file.name }
    };
};

window.__processFileByPlugin = async function(file) {
    if (IMAGE_TYPES.includes(file.type)) {
        return window.__uploadImageByPlugin(file);
    } else if (window.__isDocumentFile(file)) {
        return window.__processDocumentByPlugin(file);
    } else {
        throw new Error("不支持的文件类型");
    }
};

// ========== API 设置 ==========
async function fetchModels() {
    const config = getConfig();
    const url = config.apiUrl.trim();
    const key = config.apiKey.trim();

    if (!url || !key) {
        toastr.warning("请先填写 API 地址和密钥");
        return;
    }

    try {
        let response;
        if (url.includes("moonshot") || url.includes("openai")) {
            let base = url.replace(/\/chat\/completions$/, "").replace(/\/$/, "");
            response = await fetch(base + "/models", {
                headers: { Authorization: `Bearer ${key}` }
            });
        } else if (url.includes("googleapis")) {
            const endpoint = "https://generativelanguage.googleapis.com/v1beta/models?key=" + key;
            response = await fetch(endpoint);
        } else {
            throw new Error("不支持的 API 地址");
        }

        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.json();

        let models = [];
        if (Array.isArray(data.data)) {
            models = data.data.map(m => m.id);
        } else if (Array.isArray(data.models)) {
            models = data.models.map(m => m.name);
        }

        const select = $("#smartMedia-api-model");
        select.empty();
        models.forEach(m => {
            select.append($("<option>", { value: m, text: m }));
        });

        if (models.length > 0) {
            config.apiModel = models[0];
            select.val(models[0]);
            saveSettingsDebounced();
        }

        toastr.success(`成功加载 ${models.length} 个模型`);
    } catch (err) {
        toastr.error("拉取模型失败: " + err.message);
    }
}

async function testApiCall() {
    const config = getConfig();
    const { apiUrl: url, apiKey: key, apiModel: model } = config;

    if (!url || !key || !model) {
        toastr.warning("请先填写并保存 API 地址、密钥和模型");
        return;
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: "你好，请简单介绍一下自己。" }]
            })
        });
        const data = await response.json();
        $("#smartMedia-api-result").text(JSON.stringify(data, null, 2));
    } catch (err) {
        $("#smartMedia-api-result").text(`❌ 调用失败: ${err.message}`);
    }
}

// ========== 设置面板 ==========
function createSettingsHTML() {
    return `
    <div id="smartMedia-settings" class="collapsible-block">
      <div class="collapsible-block-header">📂 智能媒体助手设置</div>
      <div class="collapsible-block-content">
        <label>API 地址</label>
        <input id="smartMedia-api-url" type="text" class="text_pole" placeholder="https://api.moonshot.cn/v1/chat/completions">
        <label>API 密钥</label>
        <input id="smartMedia-api-key" type="password" class="text_pole">
        <label>选择模型</label>
        <select id="smartMedia-api-model" class="text_pole"></select>
        <button id="smartMedia-load-models" class="menu_button">拉取模型列表</button>
        <button id="smartMedia-save-settings" class="menu_button">保存设置</button>
        <button id="smartMedia-test-api" class="menu_button">测试调用模型</button>
        <pre id="smartMedia-api-result" style="white-space:pre-wrap; background:#111; color:#0f0; padding:10px; border-radius:6px; max-height:200px; overflow:auto;"></pre>
      </div>
    </div>`;
}

function injectSettingsPanel() {
    $("#extensions_settings").append(createSettingsHTML());

    const config = getConfig();
    $("#smartMedia-api-url").val(config.apiUrl);
    $("#smartMedia-api-key").val(config.apiKey);
    if (config.apiModel) {
        $("#smartMedia-api-model").append($("<option>", { value: config.apiModel, text: config.apiModel })).val(config.apiModel);
    }

    $("#smartMedia-save-settings").on("click", () => {
        config.apiUrl = $("#smartMedia-api-url").val().trim();
        config.apiKey = $("#smartMedia-api-key").val().trim();
        config.apiModel = $("#smartMedia-api-model").val().trim();
        saveSettingsDebounced();
        toastr.success("API 设置已保存");
    });

    $("#smartMedia-load-models").on("click", fetchModels);
    $("#smartMedia-test-api").on("click", testApiCall);
    $("#smartMedia-api-model").on("change", () => {
        config.apiModel = $("#smartMedia-api-model").val();
        saveSettingsDebounced();
    });
}

// ========== 初始化 ==========
jQuery(async () => {
    injectSettingsPanel();
});

export {
    __processFileByPlugin,
    __uploadImageByPlugin,
    __processDocumentByPlugin,
    __isDocumentFile,
    __getSupportedFileTypes,
};
