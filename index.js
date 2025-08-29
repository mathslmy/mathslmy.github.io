/*
 * 智能媒体助手 - 轻量版
 * 功能：图片处理、文档处理、API 支持（含模型列表实时拉取+切换）
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
    content: text.slice(0, 10000),
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

// ========== API 设置 ==========
function saveApiSettings() {
  const url = document.getElementById('api-url').value;
  const key = document.getElementById('api-key').value;
  const model = document.getElementById('api-model').value;
  localStorage.setItem('smartMediaApiUrl', url);
  localStorage.setItem('smartMediaApiKey', key);
  localStorage.setItem('smartMediaApiModel', model);
  alert(`✅ API 设置已保存 (模型: ${model})`);
}

function loadApiSettings() {
  document.getElementById('api-url').value = localStorage.getItem('smartMediaApiUrl') || '';
  document.getElementById('api-key').value = localStorage.getItem('smartMediaApiKey') || '';
  const savedModel = localStorage.getItem('smartMediaApiModel') || '';
  if (savedModel) {
    const modelSelect = document.getElementById('api-model');
    const opt = document.createElement("option");
    opt.value = savedModel;
    opt.textContent = savedModel + " (已保存)";
    modelSelect.appendChild(opt);
    modelSelect.value = savedModel;
  }
}

document.getElementById('btn-save-api').addEventListener('click', saveApiSettings);
loadApiSettings();

// ========== 拉取模型列表 ==========
async function fetchModels(url, key) {
  try {
    let response;
    if (url.includes("moonshot") || url.includes("openai")) {
      response = await fetch(url.replace(/\/chat\/completions$/, "") + "/models", {
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
      models = data.data.map(m => m.id); // OpenAI / Moonshot
    } else if (Array.isArray(data.models)) {
      models = data.models.map(m => m.name); // Gemini
    }

    const select = document.getElementById("api-model");
    select.innerHTML = "";
    models.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    });

    if (models.length > 0) {
      select.value = models[0];
      localStorage.setItem('smartMediaApiModel', models[0]);
    }

    alert(`✅ 成功加载 ${models.length} 个模型，已选择 ${models[0]}`);
  } catch (err) {
    alert("❌ 拉取模型失败: " + err.message);
  }
}

document.getElementById("btn-load-models").addEventListener("click", () => {
  const url = document.getElementById("api-url").value;
  const key = document.getElementById("api-key").value;
  if (!url || !key) {
    alert("请先填写 API 地址和密钥");
    return;
  }
  fetchModels(url, key);
});

// 用户切换模型 → 自动保存
document.getElementById("api-model").addEventListener("change", e => {
  const model = e.target.value;
  localStorage.setItem('smartMediaApiModel', model);
  console.log("✅ 已切换模型:", model);
});

// ========== 测试调用 ==========
document.getElementById('btn-test-api').addEventListener('click', async () => {
  const url = localStorage.getItem('smartMediaApiUrl');
  const key = localStorage.getItem('smartMediaApiKey');
  const model = localStorage.getItem('smartMediaApiModel');
  if (!url || !key || !model) {
    alert('请先填写并保存 API 地址、密钥和模型');
    return;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "你好，请简单介绍一下自己。" }]
      })
    });
    const data = await response.json();
    document.getElementById('api-result').innerText = JSON.stringify(data, null, 2);
  } catch (err) {
    document.getElementById('api-result').innerText = `❌ 调用失败: ${err.message}`;
  }
});
