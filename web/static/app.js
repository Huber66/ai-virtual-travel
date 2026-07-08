const sourceInput = document.getElementById("source-image");
const targetInput = document.getElementById("target-image");
const sourceCamera = document.getElementById("source-camera");
const virtualCameraPreview = document.getElementById("virtual-camera-preview");
const sourcePreview = document.getElementById("source-preview");
const targetPreview = document.getElementById("target-preview");
const openCameraButton = document.getElementById("open-camera-button");
const captureCameraButton = document.getElementById("capture-camera-button");
const closeCameraButton = document.getElementById("close-camera-button");
const qrUploadButton = document.getElementById("qr-upload-button");
const qrUploadModal = document.getElementById("qr-upload-modal");
const qrUploadImage = document.getElementById("qr-upload-image");
const qrUploadStatus = document.getElementById("qr-upload-status");
const qrUploadUrl = document.getElementById("qr-upload-url");
const qrUploadCloseButton = document.getElementById("qr-upload-close-button");
const quickUploadButton = document.getElementById("quick-upload-button");
const regenerateButton = document.getElementById("regenerate-button");
const cameraStatus = document.getElementById("camera-status");
const submitButton = document.getElementById("submit-button");
const statusText = document.getElementById("status-text");
const galleryStatus = document.getElementById("gallery-status");
const galleryShell = document.getElementById("gallery-shell");
const templateGallery = document.getElementById("template-gallery");
const sceneLabel = document.getElementById("scene-label");
const imageModeSection = document.getElementById("image-mode-section");
const customUploadShell = document.getElementById("custom-upload-shell");
const resultImage = document.getElementById("result-image");
const resultPlaceholder = document.getElementById("result-placeholder");
const resultMeta = document.getElementById("result-meta");
const promptId = document.getElementById("prompt-id");
const downloadLink = document.getElementById("download-link");
const sharePanel = document.getElementById("share-panel");
const shareHint = document.getElementById("share-hint");
const shareLink = document.getElementById("share-link");
const shareQrImage = document.getElementById("share-qr-image");
const flowSteps = Array.from(document.querySelectorAll(".hero-flow-step"));
const formatInputs = Array.from(document.querySelectorAll('input[name="download-format"]'));

const DOWNLOAD_FORMATS = {
  jpg: { mimeType: "image/jpeg", extension: "jpg" },
  png: { mimeType: "image/png", extension: "png" },
  webp: { mimeType: "image/webp", extension: "webp" },
};

const FORM_STATE_STORAGE_KEY = "ai_background_form_state";
const PENDING_GENERATION_STORAGE_KEY = "ai_background_pending_generation";
const NAVIGATION_DB_NAME = "ai_background_navigation";
const NAVIGATION_DB_VERSION = 1;
const NAVIGATION_FILE_STORE = "files";
const SOURCE_FILE_RECORD_KEY = "source-file";
const BACKGROUND_FILE_RECORD_KEY = "background-file";
const COMPOSITION_PAYLOAD_RECORD_KEY = "composition-payload";
const PRECOMPOSED_RESULT_FILE_RECORD_KEY = "precomposed-result-file";
const MEDIAPIPE_BASE_PATH = "/static/vendor/mediapipe";
const LANDSCAPE_BACKGROUND_WIDTH = 1920;
const LANDSCAPE_BACKGROUND_HEIGHT = 1080;
const CAMERA_CAPTURE_DELAY_SECONDS = 5;
const CAPTURE_CAMERA_BUTTON_LABEL = captureCameraButton?.textContent || "拍照";

let currentMode = "image";
let selectedTemplate = null;
let capturedSourceFile = null;
let capturedCompositionPayload = null;
let restoredSourceFile = null;
let restoredBackgroundFile = null;
let sourceCameraStream = null;
let cameraFrameRequest = null;
let personSegmenter = null;
let selectedBackgroundBitmap = null;
let latestPersonBBox = null;
let latestCameraCoverRect = null;
let latestPreviewBlob = null;
let capturedResultFile = null;
let capturedResultMeta = null;
let lastResultBlob = null;
let currentResultUrl = null;
let currentDownloadUrl = null;
let availableTemplates = [];
let selectedSceneKey = "beijing";
let qrUploadSessionId = null;
let qrUploadPollTimer = null;
let qrUploadLastVersion = 0;
let normalizedBackgroundFile = null;
let normalizedBackgroundCacheKey = "";
let cameraCaptureCountdownTimer = null;

const SCENE_DEFINITIONS = {
  "beijing": {
    "label": "\u5317\u4eac",
    "keywords": [
      "\u5317\u4eac",
      "\u6545\u5bab",
      "\u5929\u5b89\u95e8",
      "\u9890\u548c\u56ed",
      "\u516b\u8fbe\u5cad",
      "\u957f\u57ce",
      "\u6c34\u7acb\u65b9",
      "\u9e1f\u5de2",
      "\u5929\u575b",
      "\u5706\u660e\u56ed"
    ]
  },
  "xian": {
    "label": "\u897f\u5b89",
    "keywords": [
      "\u897f\u5b89",
      "\u5175\u9a6c\u4fd1",
      "\u5927\u96c1\u5854",
      "\u5927\u96c1\u697c",
      "\u949f\u697c",
      "\u57ce\u5899"
    ]
  },
  "henan": {
    "label": "\u6cb3\u5357",
    "keywords": [
      "\u6cb3\u5357",
      "\u5c11\u6797\u5bfa",
      "\u9f99\u95e8\u77f3\u7a9f",
      "\u6d1b\u9633",
      "\u5f00\u5c01"
    ]
  },
  "world": {
    "label": "\u4e16\u754c\u540d\u80dc",
    "keywords": [
      "\u4e16\u754c\u540d\u80dc",
      "\u57c3\u83f2\u5c14",
      "\u6bd4\u8428",
      "\u6597\u517d\u573a",
      "\u7f57\u9a6c",
      "\u91d1\u5b57\u5854",
      "\u57c3\u53ca",
      "\u5df4\u9ece",
      "\u4f26\u6566",
      "\u7ebd\u7ea6",
      "\u5a01\u5c3c\u65af",
      "\u96c5\u5178",
      "\u5723\u6258\u91cc\u5c3c",
      "\u8fea\u62dc",
      "\u83ab\u65af\u79d1",
      "\u610f\u5927\u5229",
      "\u6cd5\u56fd",
      "\u65e5\u672c",
      "\u5bcc\u58eb\u5c71",
      "\u4e1c\u4eac",
      "\u6d45\u8349\u5bfa",
      "\u4eac\u90fd",
      "\u5927\u962a",
      "\u5948\u826f",
      "\u6a31"
    ]
  },
  "virtual": {
    "label": "\u865a\u62df\u80cc\u666f",
    "keywords": [
      "\u865a\u62df\u80cc\u666f",
      "\u52a8\u6f2b",
      "\u5361\u901a",
      "\u8d5b\u535a",
      "\u865a\u62df",
      "\u4e8c\u6b21\u5143",
      "\u63d2\u753b",
      "\u68a6\u5e7b",
      "\u672a\u6765",
      "\u50cf\u7d20",
      "\u7ae5\u8bdd"
    ]
  },
  "guizhou": {
    "label": "\u8d35\u5dde",
    "keywords": [
      "\u8d35\u5dde",
      "\u68b5\u51c0\u5c71",
      "\u9ec4\u679c\u6811",
      "\u8354\u6ce2",
      "\u5c0f\u4e03\u5b54",
      "\u897f\u6c5f",
      "\u82d7\u5be8",
      "\u7ec7\u91d1\u6d1e"
    ]
  },
  "jiangxi": {
    "label": "\u6c5f\u897f",
    "keywords": [
      "\u6c5f\u897f",
      "\u4e95\u5188\u5c71",
      "\u6ed5\u738b\u9601",
      "\u5a7a\u6e90",
      "\u5fbd\u6d3e"
    ]
  },
  "nanjing": {
    "label": "\u5357\u4eac",
    "keywords": [
      "\u5357\u4eac",
      "\u592b\u5b50\u5e99",
      "\u7075\u8c37\u5bfa",
      "\u660e\u5b5d\u9675"
    ]
  },
  "sichuan": {
    "label": "\u56db\u5ddd",
    "keywords": [
      "\u56db\u5ddd",
      "\u5b89\u4ec1",
      "\u4e5d\u5be8\u6c9f",
      "\u4e50\u5c71",
      "\u5927\u4f5b"
    ]
  },
  "wuhan": {
    "label": "\u6b66\u6c49",
    "keywords": [
      "\u6b66\u6c49",
      "\u53e4\u7434\u53f0",
      "\u6674\u5ddd\u9601"
    ]
  },
  "yunnan": {
    "label": "\u4e91\u5357",
    "keywords": [
      "\u4e91\u5357",
      "\u5927\u7406",
      "\u6d31\u6d77",
      "\u9999\u683c\u91cc\u62c9",
      "\u7389\u9f99\u96ea\u5c71"
    ]
  },
  "custom": {
    "label": "\u81ea\u5b9a\u4e49",
    "keywords": []
  }
};

const SCENE_ORDER_HINTS = {
  "beijing": [
    "\u5317\u4eac",
    "\u6545\u5bab",
    "\u5929\u5b89\u95e8",
    "\u9890\u548c\u56ed",
    "\u516b\u8fbe\u5cad",
    "\u957f\u57ce",
    "\u6c34\u7acb\u65b9",
    "\u9e1f\u5de2",
    "\u5929\u575b",
    "\u5706\u660e\u56ed"
  ],
  "xian": [
    "\u897f\u5b89",
    "\u5175\u9a6c\u4fd1",
    "\u5927\u96c1\u5854",
    "\u5927\u96c1\u697c",
    "\u949f\u697c",
    "\u57ce\u5899"
  ],
  "henan": [
    "\u6cb3\u5357",
    "\u5c11\u6797\u5bfa",
    "\u9f99\u95e8\u77f3\u7a9f",
    "\u6d1b\u9633",
    "\u5f00\u5c01"
  ],
  "world": [
    "\u4e16\u754c\u540d\u80dc",
    "\u57c3\u83f2\u5c14",
    "\u6bd4\u8428",
    "\u6597\u517d\u573a",
    "\u7f57\u9a6c",
    "\u91d1\u5b57\u5854",
    "\u57c3\u53ca",
    "\u5df4\u9ece",
    "\u4f26\u6566",
    "\u7ebd\u7ea6",
    "\u5a01\u5c3c\u65af",
    "\u96c5\u5178",
    "\u5723\u6258\u91cc\u5c3c",
    "\u8fea\u62dc",
    "\u83ab\u65af\u79d1",
    "\u610f\u5927\u5229",
    "\u6cd5\u56fd",
    "\u65e5\u672c",
    "\u5bcc\u58eb\u5c71",
    "\u4e1c\u4eac",
    "\u6d45\u8349\u5bfa",
    "\u4eac\u90fd",
    "\u5927\u962a",
    "\u5948\u826f",
    "\u6a31"
  ],
  "virtual": [
    "\u865a\u62df\u80cc\u666f",
    "\u52a8\u6f2b",
    "\u5361\u901a",
    "\u8d5b\u535a",
    "\u865a\u62df",
    "\u4e8c\u6b21\u5143",
    "\u63d2\u753b",
    "\u68a6\u5e7b",
    "\u672a\u6765",
    "\u50cf\u7d20",
    "\u7ae5\u8bdd"
  ],
  "guizhou": [
    "\u8d35\u5dde",
    "\u68b5\u51c0\u5c71",
    "\u9ec4\u679c\u6811",
    "\u8354\u6ce2",
    "\u5c0f\u4e03\u5b54",
    "\u897f\u6c5f",
    "\u82d7\u5be8",
    "\u7ec7\u91d1\u6d1e"
  ],
  "jiangxi": [
    "\u6c5f\u897f",
    "\u4e95\u5188\u5c71",
    "\u6ed5\u738b\u9601",
    "\u5a7a\u6e90",
    "\u5fbd\u6d3e"
  ],
  "nanjing": [
    "\u5357\u4eac",
    "\u592b\u5b50\u5e99",
    "\u7075\u8c37\u5bfa",
    "\u660e\u5b5d\u9675"
  ],
  "sichuan": [
    "\u56db\u5ddd",
    "\u5b89\u4ec1",
    "\u4e5d\u5be8\u6c9f",
    "\u4e50\u5c71",
    "\u5927\u4f5b"
  ],
  "wuhan": [
    "\u6b66\u6c49",
    "\u53e4\u7434\u53f0",
    "\u6674\u5ddd\u9601"
  ],
  "yunnan": [
    "\u4e91\u5357",
    "\u5927\u7406",
    "\u6d31\u6d77",
    "\u9999\u683c\u91cc\u62c9",
    "\u7389\u9f99\u96ea\u5c71"
  ],
  "custom": []
};

function setMode(mode) {
  currentMode = "image";
  imageModeSection.classList.remove("hidden");
  const customScene = isCustomScene();

  if (imageModeSection) {
    imageModeSection.classList.toggle("is-custom", customScene);
  }

  if (customUploadShell) {
    customUploadShell.classList.toggle("hidden", !customScene);
  }
  galleryShell.classList.add("hidden");

  if (customScene) {
    clearTemplateSelection();
    setOptionalText(galleryStatus, targetInput.files?.[0] || restoredBackgroundFile ? "当前背景：手动上传风景图" : "自定义场景：请上传背景图");
    if (!targetInput.files?.[0] && !restoredBackgroundFile) {
      targetPreview.classList.add("hidden");
    }
  } else {
    targetInput.value = "";
    clearRestoredBackground();
    setOptionalText(galleryStatus, selectedTemplate ? `当前背景：${selectedTemplate.label}` : "请从背景画廊点选背景图");
    if (!selectedTemplate) {
      targetPreview.classList.add("hidden");
    }
  }

  updateFlowState();
  syncActionButtons();
}

function isCustomScene() {
  return selectedSceneKey === "custom";
}

function resolveSelectedSceneFromQuery() {
  const queryScene = new URLSearchParams(window.location.search).get("scene");
  if (queryScene && SCENE_DEFINITIONS[queryScene]) {
    return queryScene;
  }
  return "beijing";
}

function hasExplicitSceneInQuery() {
  const queryScene = new URLSearchParams(window.location.search).get("scene");
  return Boolean(queryScene && SCENE_DEFINITIONS[queryScene]);
}

function resolveTemplateFromQuery() {
  const queryTemplate = new URLSearchParams(window.location.search).get("template");
  return queryTemplate ? decodeURIComponent(queryTemplate) : "";
}

function syncSceneLabel() {
  if (!sceneLabel) {
    return;
  }
  sceneLabel.textContent = SCENE_DEFINITIONS[selectedSceneKey]?.label || "北京";
}

function templateSearchText(template) {
  if (typeof template === "string") {
    return template;
  }
  return `${template?.label || ""} ${template?.name || ""} ${template?.group || ""}`;
}

function isTemplateInScene(template, sceneKey) {
  const scene = SCENE_DEFINITIONS[sceneKey];
  if (!scene) {
    return false;
  }

  const haystack = templateSearchText(template);
  return scene.keywords.some((keyword) => haystack.includes(keyword));
}

function getTemplateOrderRank(template, sceneKey) {
  const orderHints = SCENE_ORDER_HINTS[sceneKey] || [];
  const haystack = templateSearchText(template);
  const matchedIndex = orderHints.findIndex((hint) => haystack.includes(hint));
  return matchedIndex >= 0 ? matchedIndex : 999;
}

function compareTemplatesInScene(leftTemplate, rightTemplate, sceneKey) {
  const leftRank = getTemplateOrderRank(leftTemplate, sceneKey);
  const rightRank = getTemplateOrderRank(rightTemplate, sceneKey);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return leftTemplate.label.localeCompare(rightTemplate.label, "zh-CN");
}

function renderTemplateGallery() {
  if (isCustomScene()) {
    templateGallery.innerHTML = "";
    setOptionalText(galleryStatus, "自定义场景：请上传背景图");
    return;
  }

  const filteredTemplates = availableTemplates
    .filter((template) => isTemplateInScene(template, selectedSceneKey))
    .sort((leftTemplate, rightTemplate) => compareTemplatesInScene(leftTemplate, rightTemplate, selectedSceneKey));

  templateGallery.innerHTML = "";

  if (!filteredTemplates.length) {
    setOptionalText(galleryStatus, `${SCENE_DEFINITIONS[selectedSceneKey]?.label || "当前场景"} 暂时还没有可用背景图。`);
    if (selectedTemplate) {
      clearTemplateSelection();
      targetPreview.classList.add("hidden");
    }
    updateFlowState();
    syncActionButtons();
    return;
  }

  if (selectedTemplate && !isTemplateInScene(selectedTemplate, selectedSceneKey)) {
    clearTemplateSelection();
    targetPreview.classList.add("hidden");
  }

  if (!selectedTemplate) {
    const defaultTemplate = filteredTemplates[0];
    clearNormalizedBackgroundCache();
    selectedTemplate = defaultTemplate;
    targetPreview.onload = () => applyBackgroundAspect(targetPreview.naturalWidth, targetPreview.naturalHeight);
    targetPreview.src = defaultTemplate.url;
    targetPreview.classList.remove("hidden");
    setOptionalText(cameraStatus, "\u80cc\u666f\u5df2\u5c31\u7eea\uff0c\u6253\u5f00\u6444\u50cf\u5934\u5f00\u59cb\u53d6\u666f\u3002");
    refreshSelectedBackgroundBitmap().catch(() => {});
  }

  filteredTemplates.forEach((template) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "template-card";
    card.dataset.templateName = template.name;
    card.innerHTML = `
      <img src="${template.thumbnail_url || template.url}" alt="${template.label}" loading="lazy" decoding="async" />
      <span>${template.label}</span>
    `;
    if (selectedTemplate?.name === template.name) {
      card.classList.add("selected");
    }
    card.addEventListener("click", () => selectTemplate(template, card));
    templateGallery.appendChild(card);
  });

  setOptionalText(galleryStatus, `当前场景：${SCENE_DEFINITIONS[selectedSceneKey]?.label || "北京"}，共 ${filteredTemplates.length} 张背景图`);
}

window.__AI_BACKGROUND_GENERATION_BRIDGE__ = {
  prepareRequest: async () => {
    const sourceFile = buildSourceFile();
    if (!sourceFile) {
      throw new Error("请先上传人物照，或先打开摄像头拍照。");
    }

    if (currentMode === "image") {
      const uploadedBackground = targetInput.files?.[0] || null;
      if (isCustomScene() && uploadedBackground) {
        return {
          mode: "image",
          sourceFile,
          backgroundFile: uploadedBackground,
          compositionPayload: capturedCompositionPayload || null,
          precomposedResultFile: capturedResultFile,
          precomposedResultMeta: capturedResultMeta,
        };
      }

      if (!selectedTemplate?.name) {
        throw new Error(isCustomScene() ? "请先上传自定义背景图" : "请从背景画廊选择背景图");
      }

      return {
        mode: "image",
        sourceFile,
        backgroundTemplateName: selectedTemplate.name,
        compositionPayload: capturedCompositionPayload || null,
        precomposedResultFile: capturedResultFile,
        precomposedResultMeta: capturedResultMeta,
      };
    }
  },
};

function openNavigationDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(NAVIGATION_DB_NAME, NAVIGATION_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(NAVIGATION_FILE_STORE)) {
        database.createObjectStore(NAVIGATION_FILE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("页面暂存空间初始化失败"));
  });
}

async function writeNavigationFile(recordKey, file) {
  const database = await openNavigationDatabase();

  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(NAVIGATION_FILE_STORE, "readwrite");
      const store = transaction.objectStore(NAVIGATION_FILE_STORE);
      store.put(file, recordKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("页面文件暂存失败"));
      transaction.onabort = () => reject(transaction.error || new Error("页面文件暂存失败"));
    });
  } finally {
    database.close();
  }
}

async function readNavigationFile(recordKey) {
  const database = await openNavigationDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(NAVIGATION_FILE_STORE, "readonly");
      const store = transaction.objectStore(NAVIGATION_FILE_STORE);
      const request = store.get(recordKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("页面文件读取失败"));
    });
  } finally {
    database.close();
  }
}

async function deleteNavigationFile(recordKey) {
  const database = await openNavigationDatabase();

  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(NAVIGATION_FILE_STORE, "readwrite");
      const store = transaction.objectStore(NAVIGATION_FILE_STORE);
      store.delete(recordKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("页面文件清理失败"));
      transaction.onabort = () => reject(transaction.error || new Error("页面文件清理失败"));
    });
  } finally {
    database.close();
  }
}

function applyBackgroundAspect(width, height) {
  if (!width || !height) {
    return;
  }

  const aspectValue = `${width} / ${height}`;
  document.querySelectorAll(".source-dropzone .preview-shell, .background-mode-panel .preview-shell").forEach((shell) => {
    shell.style.setProperty("--selected-background-aspect", aspectValue);
    shell.style.setProperty("--selected-background-ratio", String(width / height));
    shell.classList.toggle("is-portrait-background", height > width);
    shell.classList.add("has-background-aspect");
  });
}

function clearBackgroundAspect() {
  document.querySelectorAll(".source-dropzone .preview-shell, .background-mode-panel .preview-shell").forEach((shell) => {
    shell.style.removeProperty("--selected-background-aspect");
    shell.style.removeProperty("--selected-background-ratio");
    shell.classList.remove("is-portrait-background");
    shell.classList.remove("has-background-aspect");
  });
}

function drawImageCover(context, image, targetWidth, targetHeight) {
  const sourceWidth = image.videoWidth || image.naturalWidth || image.width;
  const sourceHeight = image.videoHeight || image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
    return null;
  }

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return { sourceWidth, sourceHeight, drawWidth, drawHeight, offsetX, offsetY };
}

function drawImageContain(context, image, targetWidth, targetHeight) {
  const sourceWidth = image.videoWidth || image.naturalWidth || image.width;
  const sourceHeight = image.videoHeight || image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
    return null;
  }

  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return { sourceWidth, sourceHeight, drawWidth, drawHeight, offsetX, offsetY };
}

async function blobFromCanvas(canvas, type = "image/png", quality) {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("画面保存失败"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function getSelectedBackgroundCacheKey() {
  if (isCustomScene()) {
    const customFile = targetInput.files?.[0] || restoredBackgroundFile || null;
    return customFile ? `custom:${customFile.name}:${customFile.size}:${customFile.lastModified || 0}` : "";
  }

  return selectedTemplate?.name ? `template:${selectedTemplate.name}` : "";
}

function clearNormalizedBackgroundCache() {
  normalizedBackgroundFile = null;
  normalizedBackgroundCacheKey = "";
}

async function normalizeBackgroundFileForDisplay(sourceFile, cacheKey) {
  if (!sourceFile) {
    return null;
  }

  if (normalizedBackgroundFile && normalizedBackgroundCacheKey === cacheKey) {
    return normalizedBackgroundFile;
  }

  const bitmap = await createImageBitmap(sourceFile);
  try {
    if (bitmap.width >= bitmap.height) {
      normalizedBackgroundFile = sourceFile;
      normalizedBackgroundCacheKey = cacheKey;
      return normalizedBackgroundFile;
    }

    const canvas = document.createElement("canvas");
    canvas.width = LANDSCAPE_BACKGROUND_WIDTH;
    canvas.height = LANDSCAPE_BACKGROUND_HEIGHT;
    const context = canvas.getContext("2d");

    context.save();
    context.filter = "blur(34px) saturate(1.08)";
    drawImageCover(context, bitmap, canvas.width, canvas.height);
    context.restore();

    context.fillStyle = "rgba(4, 9, 22, 0.24)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.24)";
    context.shadowBlur = 28;
    context.shadowOffsetY = 10;
    drawImageContain(context, bitmap, canvas.width, canvas.height);
    context.restore();

    const blob = await blobFromCanvas(canvas, "image/png");
    const cleanName = (sourceFile.name || "background").replace(/\.[^.]+$/, "");
    normalizedBackgroundFile = new File([blob], `${cleanName}_landscape.png`, { type: "image/png" });
    normalizedBackgroundCacheKey = cacheKey;
    return normalizedBackgroundFile;
  } finally {
    bitmap.close();
  }
}

async function resolveNormalizedSelectedBackgroundFile() {
  const backgroundFile = await resolveSelectedBackgroundFile();
  if (!backgroundFile) {
    clearNormalizedBackgroundCache();
    return null;
  }

  return backgroundFile;
}

async function resolveSelectedBackgroundFile() {
  if (isCustomScene()) {
    return targetInput.files?.[0] || restoredBackgroundFile || null;
  }

  if (!selectedTemplate?.url) {
    return null;
  }

  const response = await fetch(selectedTemplate.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("背景图片下载失败");
  }

  const blob = await response.blob();
  return new File([blob], selectedTemplate.name, { type: blob.type || "image/jpeg" });
}

async function refreshSelectedBackgroundBitmap() {
  const backgroundFile = await resolveNormalizedSelectedBackgroundFile();
  if (!backgroundFile) {
    return null;
  }

  if (selectedBackgroundBitmap) {
    selectedBackgroundBitmap.close();
    selectedBackgroundBitmap = null;
  }

  selectedBackgroundBitmap = await createImageBitmap(backgroundFile);
  applyBackgroundAspect(selectedBackgroundBitmap.width, selectedBackgroundBitmap.height);
  return selectedBackgroundBitmap;
}

function clearCapturedCameraShot(message) {
  if (!capturedSourceFile && !capturedCompositionPayload && !latestPreviewBlob && !capturedResultFile) {
    return;
  }

  capturedSourceFile = null;
  capturedCompositionPayload = null;
  latestPreviewBlob = null;
  capturedResultFile = null;
  capturedResultMeta = null;
  latestPersonBBox = null;
  latestCameraCoverRect = null;
  sourcePreview.src = "";
  sourcePreview.classList.add("hidden");
  if (message) {
    setOptionalText(cameraStatus, message);
  }
}

async function ensurePersonSegmenter() {
  if (personSegmenter) {
    return personSegmenter;
  }

  const { FilesetResolver, ImageSegmenter } = await import(`${MEDIAPIPE_BASE_PATH}/vision_bundle.mjs`);
  const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE_PATH}/wasm`);
  personSegmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
      modelAssetPath: `${MEDIAPIPE_BASE_PATH}/selfie_segmenter_landscape.tflite`,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    outputCategoryMask: true,
    outputConfidenceMasks: true,
  });
  return personSegmenter;
}

function getMaskValues(mask) {
  if (!mask) {
    return null;
  }

  const width = typeof mask.width === "function" ? mask.width() : mask.width;
  const height = typeof mask.height === "function" ? mask.height() : mask.height;
  const values = mask.getAsFloat32Array?.() || mask.getAsUint8Array?.();
  if (!width || !height || !values) {
    return null;
  }
  return { width, height, values };
}

function choosePersonMask(result) {
  const confidenceMasks = Array.from(result.confidenceMasks || []);
  let bestMask = null;
  let bestArea = 1;

  confidenceMasks.forEach((mask) => {
    const maskValues = getMaskValues(mask);
    if (!maskValues) {
      return;
    }
    let activePixels = 0;
    for (let index = 0; index < maskValues.values.length; index += 1) {
      if (maskValues.values[index] > 0.45) {
        activePixels += 1;
      }
    }
    const area = activePixels / Math.max(1, maskValues.values.length);
    if (area > 0.01 && area < bestArea) {
      bestArea = area;
      bestMask = { ...maskValues, threshold: 0.58 };
    }
  });

  if (bestMask) {
    return bestMask;
  }

  const categoryMask = getMaskValues(result.categoryMask);
  return categoryMask ? { ...categoryMask, threshold: 0.5, isCategory: true } : null;
}

function buildAlphaMaskCanvas(maskValues) {
  const maskCanvas = buildAlphaMaskCanvas.canvas || document.createElement("canvas");
  buildAlphaMaskCanvas.canvas = maskCanvas;
  maskCanvas.width = maskValues.width;
  maskCanvas.height = maskValues.height;

  const maskContext = maskCanvas.getContext("2d");
  const imageData = maskContext.createImageData(maskValues.width, maskValues.height);
  const threshold = maskValues.threshold ?? 0.58;
  const featherStart = Math.max(0.1, threshold - 0.22);
  const featherRange = Math.max(0.01, 1 - featherStart);
  let left = maskValues.width;
  let top = maskValues.height;
  let right = 0;
  let bottom = 0;

  for (let index = 0; index < maskValues.values.length; index += 1) {
    const rawValue = maskValues.values[index];
    const alpha = maskValues.isCategory
      ? (rawValue > 0 ? 255 : 0)
      : Math.round(Math.max(0, Math.min(1, (rawValue - featherStart) / featherRange)) * 255);
    const dataIndex = index * 4;
    imageData.data[dataIndex] = 255;
    imageData.data[dataIndex + 1] = 255;
    imageData.data[dataIndex + 2] = 255;
    imageData.data[dataIndex + 3] = alpha;

    if (alpha >= 96) {
      const x = index % maskValues.width;
      const y = Math.floor(index / maskValues.width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }

  maskContext.putImageData(imageData, 0, 0);
  const bbox = right > left && bottom > top ? { left, top, right, bottom } : null;
  return { maskCanvas, bbox };
}

function projectMaskBBox(maskBBox, maskSize, coverRect, targetWidth, targetHeight) {
  if (!maskBBox || !coverRect) {
    return null;
  }

  const scaleX = coverRect.drawWidth / maskSize.width;
  const scaleY = coverRect.drawHeight / maskSize.height;
  const left = Math.max(0, coverRect.offsetX + maskBBox.left * scaleX);
  const top = Math.max(0, coverRect.offsetY + maskBBox.top * scaleY);
  const right = Math.min(targetWidth, coverRect.offsetX + maskBBox.right * scaleX);
  const bottom = Math.min(targetHeight, coverRect.offsetY + maskBBox.bottom * scaleY);
  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left / targetWidth,
    y: top / targetHeight,
    width: (right - left) / targetWidth,
    height: (bottom - top) / targetHeight,
  };
}

function renderVirtualCameraFrame() {
  if (!sourceCameraStream || !selectedBackgroundBitmap || !virtualCameraPreview || !sourceCamera.videoWidth || !sourceCamera.videoHeight) {
    return;
  }

  const canvas = virtualCameraPreview;
  if (canvas.width !== selectedBackgroundBitmap.width || canvas.height !== selectedBackgroundBitmap.height) {
    canvas.width = selectedBackgroundBitmap.width;
    canvas.height = selectedBackgroundBitmap.height;
  }

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawImageCover(context, selectedBackgroundBitmap, canvas.width, canvas.height);

  try {
    const result = personSegmenter.segmentForVideo(sourceCamera, performance.now());
    const maskValues = choosePersonMask(result);
    if (maskValues) {
      const { maskCanvas, bbox } = buildAlphaMaskCanvas(maskValues);
      const personCanvas = renderVirtualCameraFrame.personCanvas || document.createElement("canvas");
      renderVirtualCameraFrame.personCanvas = personCanvas;
      personCanvas.width = canvas.width;
      personCanvas.height = canvas.height;
      const personContext = personCanvas.getContext("2d");
      personContext.clearRect(0, 0, canvas.width, canvas.height);
      const coverRect = drawImageCover(personContext, sourceCamera, canvas.width, canvas.height);
      if (coverRect) {
        latestCameraCoverRect = {
          x: coverRect.offsetX / canvas.width,
          y: coverRect.offsetY / canvas.height,
          width: coverRect.drawWidth / canvas.width,
          height: coverRect.drawHeight / canvas.height,
          source_width: coverRect.sourceWidth,
          source_height: coverRect.sourceHeight,
        };
      } else {
        latestCameraCoverRect = null;
      }
      personContext.globalCompositeOperation = "destination-in";
      drawImageCover(personContext, maskCanvas, canvas.width, canvas.height);
      personContext.globalCompositeOperation = "source-over";
      context.drawImage(personCanvas, 0, 0);
      latestPersonBBox = projectMaskBBox(bbox, maskValues, coverRect, canvas.width, canvas.height);
    }
  } catch (error) {
    latestPersonBBox = null;
  }

  cameraFrameRequest = window.requestAnimationFrame(renderVirtualCameraFrame);
}

function startVirtualCameraLoop() {
  if (cameraFrameRequest) {
    window.cancelAnimationFrame(cameraFrameRequest);
  }
  cameraFrameRequest = window.requestAnimationFrame(renderVirtualCameraFrame);
}

function collectGenerationResponseMeta(response) {
  return {
    promptId: response.headers.get("X-Comfy-Prompt-Id") || "",
    resultId: response.headers.get("X-Result-Id") || "",
    resultShareUrl: response.headers.get("X-Result-Share-Url") || "",
    resultImageUrl: response.headers.get("X-Result-Image-Url") || "",
    resultDownloadUrl: response.headers.get("X-Result-Download-Url") || "",
    resultQrUrl: response.headers.get("X-Result-Qr-Url") || "",
    editorFaceBounds: response.headers.get("X-Editor-Face-Bounds") || "",
    editorFaceMaskUrl: response.headers.get("X-Editor-Face-Mask-Url") || "",
    generationWarning: response.headers.get("X-Generation-Warning") || "",
  };
}

async function generateHighQualityCameraPreview() {
  if (!capturedSourceFile || !capturedCompositionPayload) {
    return;
  }

  const backgroundFile = await buildBackgroundFile();
  if (!backgroundFile) {
    throw new Error(isCustomScene() ? "请先上传自定义背景图" : "请从背景画廊选择背景图");
  }

  const formData = new FormData();
  formData.append("person_image", capturedSourceFile);
  formData.append("background_image", backgroundFile);
  formData.append("composition_payload", JSON.stringify(capturedCompositionPayload));

  const response = await fetch("/api/swap", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let detail = "高清预览生成失败";
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      detail = `高清预览生成失败，状态码 ${response.status}`;
    }
    throw new Error(detail);
  }

  const resultBlob = await response.blob();
  capturedResultFile = new File([resultBlob], `travel_camera_result_${Date.now()}.png`, { type: resultBlob.type || "image/png" });
  capturedResultMeta = collectGenerationResponseMeta(response);
  setImagePreview(capturedResultFile, sourcePreview);
}

function readStoredFormState() {
  const rawValue = window.sessionStorage.getItem(FORM_STATE_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function clearRestoredSource() {
  restoredSourceFile = null;
}

function clearRestoredBackground() {
  restoredBackgroundFile = null;
}

function findTemplateCardByName(templateName) {
  return Array.from(templateGallery.querySelectorAll(".template-card")).find((card) => card.dataset.templateName === templateName) || null;
}

function restoreTemplateSelection(templateName) {
  if (!templateName) {
    return;
  }

  const template = availableTemplates.find((item) => item.name === templateName);
  if (!template) {
    return;
  }

  // Prevent leaking an old scene's template into the current scene when restoring state.
  if (!isTemplateInScene(template.label || "", selectedSceneKey)) {
    return;
  }

  selectTemplate(template, findTemplateCardByName(templateName));
}

async function storeGenerationState() {
  const sourceFile = buildSourceFile();
  if (!sourceFile) {
    throw new Error("请先上传人物照，或先打开摄像头拍照。");
  }

  const state = {
    selectedSceneKey,
    backgroundTemplateName: null,
    hasBackgroundFile: false,
    compositionPayload: capturedCompositionPayload || null,
    hasPrecomposedResultFile: Boolean(capturedResultFile),
    precomposedResultMeta: capturedResultMeta,
  };

  const normalizedBackground = await buildBackgroundFile();
  if (!normalizedBackground) {
    throw new Error(isCustomScene() ? "璇峰厛涓婁紶鑷畾涔夎儗鏅浘" : "璇蜂粠鑳屾櫙鐢诲粖閫夋嫨鑳屾櫙鍥?");
  }
  await writeNavigationFile(BACKGROUND_FILE_RECORD_KEY, normalizedBackground);
  state.hasBackgroundFile = true;

  await writeNavigationFile(SOURCE_FILE_RECORD_KEY, sourceFile);
  if (capturedResultFile) {
    await writeNavigationFile(PRECOMPOSED_RESULT_FILE_RECORD_KEY, capturedResultFile);
  } else {
    await deleteNavigationFile(PRECOMPOSED_RESULT_FILE_RECORD_KEY);
  }

  if (!isCustomScene()) {
    if (!selectedTemplate?.name) {
      throw new Error("请从背景画廊选择背景图");
    }
    state.backgroundTemplateName = selectedTemplate.name;
  }

  const serializedState = JSON.stringify(state);
  window.sessionStorage.setItem(FORM_STATE_STORAGE_KEY, serializedState);
  window.sessionStorage.setItem(PENDING_GENERATION_STORAGE_KEY, serializedState);
}

async function restoreStoredFormState() {
  const state = readStoredFormState();
  if (!state) {
    return;
  }

  const explicitSceneInQuery = hasExplicitSceneInQuery();

  sourceInput.value = "";
  targetInput.value = "";
  clearCapturedSource();
  clearRestoredSource();
  clearRestoredBackground();

  if (!explicitSceneInQuery && state.selectedSceneKey && SCENE_DEFINITIONS[state.selectedSceneKey]) {
    selectedSceneKey = state.selectedSceneKey;
    syncSceneLabel();
    renderTemplateGallery();
  }

  const storedSourceFile = await readNavigationFile(SOURCE_FILE_RECORD_KEY);
  if (storedSourceFile) {
    restoredSourceFile = storedSourceFile;
    if (state.compositionPayload) {
      capturedSourceFile = storedSourceFile;
      capturedCompositionPayload = state.compositionPayload;
    }
    const storedResultFile = state.hasPrecomposedResultFile ? await readNavigationFile(PRECOMPOSED_RESULT_FILE_RECORD_KEY) : null;
    if (storedResultFile) {
      capturedResultFile = storedResultFile;
      capturedResultMeta = state.precomposedResultMeta || null;
      setImagePreview(storedResultFile, sourcePreview);
    } else {
      setImagePreview(storedSourceFile, sourcePreview);
    }
    setOptionalText(cameraStatus, `当前人物照：${storedSourceFile.name}`);
  }

  setMode("image");

  if (state.hasBackgroundFile && isCustomScene()) {
    const storedBackgroundFile = await readNavigationFile(BACKGROUND_FILE_RECORD_KEY);
    if (storedBackgroundFile) {
      restoredBackgroundFile = storedBackgroundFile;
      setImagePreview(storedBackgroundFile, targetPreview);
      setOptionalText(galleryStatus, "当前背景：手动上传风景图");
    }
  } else if (!isCustomScene()) {
    restoreTemplateSelection(state.backgroundTemplateName);
  }

  updateFlowState();
  syncActionButtons();
}

function revokeObjectUrl(url) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function isPrivateIpv4(hostname) {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!match) {
    return false;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  return first === 10 || first === 127 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
}

function buildLoopbackBaseUrl() {
  const port = window.location.port ? `:${window.location.port}` : "";
  return `${window.location.protocol}//127.0.0.1${port}`;
}

function maybeRedirectPrivateHostToLoopback() {
  if (window.location.protocol === "https:" || !isPrivateIpv4(window.location.hostname) || window.location.hostname === "127.0.0.1") {
    return false;
  }

  const loopbackBaseUrl = buildLoopbackBaseUrl();
  if (loopbackBaseUrl === window.location.origin) {
    return false;
  }

  window.location.replace(`${loopbackBaseUrl}${window.location.pathname}${window.location.search}${window.location.hash}`);
  return true;
}

function setOptionalText(element, message) {
  if (element) {
    element.textContent = message;
  }
}

function setStatus(message) {
  setOptionalText(statusText, message);
}

function setCameraButtons(isActive) {
  openCameraButton.disabled = isActive;
  captureCameraButton.disabled = !isActive;
  closeCameraButton.disabled = !isActive;
}

function setDownloadEnabled(isEnabled) {
  downloadLink.classList.toggle("is-disabled", !isEnabled);
  downloadLink.setAttribute("aria-disabled", String(!isEnabled));
  if (!isEnabled) {
    downloadLink.removeAttribute("href");
  }
}

function resetSharePanel() {
  sharePanel.classList.add("hidden");
  shareLink.href = "#";
  shareQrImage.removeAttribute("src");
  setOptionalText(shareHint, "生成完成后会自动创建二维码，微信扫码即可打开下载页。");
}

function buildShareHint(shareUrl) {
  return shareUrl ? "微信扫码即可打开下载页。" : "二维码已生成，微信扫码即可打开下载页。";
}

function updateSharePanel(shareUrl) {
  if (!shareUrl) {
    resetSharePanel();
    return;
  }

  shareLink.href = shareUrl;
  shareQrImage.src = `/api/qr?content=${encodeURIComponent(shareUrl)}&v=${encodeURIComponent(shareUrl)}`;
  sharePanel.classList.remove("hidden");
  setOptionalText(shareHint, buildShareHint(shareUrl));
}

function hasSourceSelected() {
  return Boolean(sourceInput.files?.[0] || capturedSourceFile || restoredSourceFile);
}

function hasImageBackgroundSelected() {
  if (isCustomScene()) {
    return Boolean(targetInput.files?.[0] || restoredBackgroundFile);
  }
  return Boolean(selectedTemplate);
}

function isGenerationReady() {
  return hasSourceSelected() && hasImageBackgroundSelected();
}

function currentWorkflowStep() {
  if (isGenerationReady()) {
    return 3;
  }

  if (hasSourceSelected()) {
    return 2;
  }

  return 1;
}

function updateFlowState(resultReady = false) {
  const activeStep = resultReady ? 3 : currentWorkflowStep();

  flowSteps.forEach((step) => {
    const stepNumber = Number(step.dataset.step || 0);
    step.classList.toggle("is-active", stepNumber === activeStep);
    step.classList.toggle("is-complete", stepNumber < activeStep || (resultReady && stepNumber < 3));
  });
}

function syncActionButtons(isGenerating = false) {
  regenerateButton.disabled = isGenerating || !isGenerationReady();
}

function getSelectedDownloadFormat() {
  return formatInputs.find((input) => input.checked)?.value || "png";
}

async function convertBlobToFormat(blob, mimeType) {
  if (mimeType === "image/png") {
    return blob;
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d");
  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (convertedBlob) => {
        if (!convertedBlob) {
          reject(new Error("下载格式转换失败"));
          return;
        }

        resolve(convertedBlob);
      },
      mimeType,
      0.96,
    );
  });
}

async function refreshDownloadLink() {
  revokeObjectUrl(currentDownloadUrl);
  currentDownloadUrl = null;

  if (!lastResultBlob) {
    setDownloadEnabled(false);
    return;
  }

  const selectedFormat = getSelectedDownloadFormat();
  const formatConfig = DOWNLOAD_FORMATS[selectedFormat];

  try {
    const preparedBlob =
      formatConfig.mimeType === lastResultBlob.type
        ? lastResultBlob
        : await convertBlobToFormat(lastResultBlob, formatConfig.mimeType);

    currentDownloadUrl = URL.createObjectURL(preparedBlob);
    downloadLink.href = currentDownloadUrl;
    downloadLink.download = `travel-checkin-result.${formatConfig.extension}`;
    setDownloadEnabled(true);
  } catch (error) {
    setDownloadEnabled(false);
    setStatus(`结果已生成，但导出格式转换失败：${error.message}`);
  }
}

function setImagePreview(file, previewElement) {
  if (!file) {
    previewElement.src = "";
    previewElement.classList.add("hidden");
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  previewElement.src = objectUrl;
  previewElement.classList.remove("hidden");
  if (previewElement === targetPreview) {
    previewElement.onload = () => applyBackgroundAspect(previewElement.naturalWidth, previewElement.naturalHeight);
  }
}

function setPreview(input, previewElement) {
  const [file] = input.files || [];
  setImagePreview(file, previewElement);
  return file;
}

function setQrUploadStatus(message) {
  if (qrUploadStatus) {
    qrUploadStatus.textContent = message;
  }
}

function showQrUploadModal() {
  qrUploadModal?.classList.remove("hidden");
  qrUploadModal?.setAttribute("aria-hidden", "false");
}

function hideQrUploadModal() {
  qrUploadModal?.classList.add("hidden");
  qrUploadModal?.setAttribute("aria-hidden", "true");
}

function stopQrUploadPolling() {
  if (qrUploadPollTimer) {
    window.clearInterval(qrUploadPollTimer);
    qrUploadPollTimer = null;
  }
}

function applyQrUploadedPersonFile(file) {
  stopCameraStream();
  sourceInput.value = "";
  clearCapturedSource();
  clearRestoredSource();
  capturedSourceFile = file;
  setImagePreview(file, sourcePreview);
  resetResult();
  setOptionalText(cameraStatus, `已通过扫码上传人物图：${file.name}`);
  setStatus("已接收扫码上传的人物图，可以继续开始打卡。");
  updateFlowState();
  syncActionButtons();
}

async function fetchAndApplyQrUploadedImage(sessionId, payload) {
  const version = Number(payload.version || 0);
  if (!sessionId || !version || version === qrUploadLastVersion) {
    return;
  }

  const imageUrl = payload.image_url || `/api/person-upload-sessions/${sessionId}/image?v=${version}`;
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("无法读取手机上传的人物图");
  }

  const blob = await response.blob();
  const filename = payload.filename || `scan_upload_${version}.png`;
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  qrUploadLastVersion = version;
  applyQrUploadedPersonFile(file);
  setQrUploadStatus("上传成功，已同步到大屏。继续在手机上传会覆盖当前人物图。");
  hideQrUploadModal();
}

async function pollQrUploadStatus() {
  if (!qrUploadSessionId) {
    return;
  }

  try {
    const response = await fetch(`/api/person-upload-sessions/${qrUploadSessionId}/status`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("扫码上传状态读取失败");
    }
    const payload = await response.json();
    if (payload.status === "expired") {
      stopQrUploadPolling();
      setQrUploadStatus("二维码已过期，请重新点击扫码上传。");
      setStatus("扫码上传二维码已过期，请重新打开。");
      return;
    }
    if (payload.status === "uploaded") {
      await fetchAndApplyQrUploadedImage(qrUploadSessionId, payload);
    } else {
      setQrUploadStatus("等待手机上传人物图...");
    }
  } catch (error) {
    setQrUploadStatus(error.message || "扫码上传暂时不可用，请稍后重试。");
  }
}

function startQrUploadPolling(sessionId) {
  stopQrUploadPolling();
  qrUploadSessionId = sessionId;
  qrUploadPollTimer = window.setInterval(pollQrUploadStatus, 1000);
  pollQrUploadStatus();
}

async function openQrUploadSession() {
  showQrUploadModal();
  setQrUploadStatus("正在生成二维码...");
  if (qrUploadImage) {
    qrUploadImage.removeAttribute("src");
  }
  if (qrUploadUrl) {
    qrUploadUrl.removeAttribute("href");
    qrUploadUrl.textContent = "手机无法扫码时可打开此链接";
  }

  try {
    const response = await fetch("/api/person-upload-sessions", { method: "POST", cache: "no-store" });
    if (!response.ok) {
      throw new Error("二维码生成失败");
    }
    const payload = await response.json();
    qrUploadLastVersion = 0;
    if (qrUploadImage) {
      qrUploadImage.src = `${payload.qr_url}&v=${encodeURIComponent(payload.session_id)}`;
    }
    if (qrUploadUrl) {
      qrUploadUrl.href = payload.upload_url;
      qrUploadUrl.textContent = payload.upload_url;
    }
    setQrUploadStatus("请用手机扫码上传人物图，二维码 10 分钟内有效。");
    startQrUploadPolling(payload.session_id);
  } catch (error) {
    stopQrUploadPolling();
    setQrUploadStatus(error.message || "二维码生成失败，请重试。");
  }
}

function stopCameraStream() {
  cancelCameraCaptureCountdown();
  if (cameraFrameRequest) {
    window.cancelAnimationFrame(cameraFrameRequest);
    cameraFrameRequest = null;
  }

  if (sourceCameraStream) {
    sourceCameraStream.getTracks().forEach((track) => track.stop());
    sourceCameraStream = null;
  }

  sourceCamera.srcObject = null;
  sourceCamera.classList.add("hidden");
  virtualCameraPreview?.classList.add("hidden");
  setCameraButtons(false);
}

function cancelCameraCaptureCountdown(message) {
  if (!cameraCaptureCountdownTimer) {
    return;
  }
  window.clearInterval(cameraCaptureCountdownTimer);
  cameraCaptureCountdownTimer = null;
  if (captureCameraButton) {
    captureCameraButton.textContent = CAPTURE_CAMERA_BUTTON_LABEL;
    captureCameraButton.disabled = !sourceCameraStream;
  }
  if (message) {
    setOptionalText(cameraStatus, message);
  }
}

async function openCamera() {
  if (!hasImageBackgroundSelected()) {
    const message = isCustomScene() ? "请先上传自定义背景图，再打开摄像头。" : "请先选择背景图，再打开摄像头。";
    setOptionalText(cameraStatus, message);
    setStatus(message);
    updateFlowState();
    syncActionButtons();
    return;
  }

  if (!window.isSecureContext) {
    setOptionalText(cameraStatus, `当前页面不是安全上下文，请改用 ${buildLoopbackBaseUrl()}/ 打开后再使用摄像头。`);
    setStatus("摄像头只能在安全上下文中使用，已建议切换到本机地址。");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setOptionalText(cameraStatus, "当前浏览器不支持摄像头调用。");
    return;
  }

  stopCameraStream();

  try {
    setOptionalText(cameraStatus, "正在准备虚拟背景摄像头...");
    await refreshSelectedBackgroundBitmap();
    await ensurePersonSegmenter();

    sourceCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });

    sourceInput.value = "";
    capturedSourceFile = null;
    capturedCompositionPayload = null;
    latestPreviewBlob = null;
    latestPersonBBox = null;
    latestCameraCoverRect = null;
    clearRestoredSource();
    sourceCamera.srcObject = sourceCameraStream;
    await sourceCamera.play();
    sourcePreview.classList.add("hidden");
    sourceCamera.classList.add("hidden");
    virtualCameraPreview.classList.remove("hidden");
    startVirtualCameraLoop();
    setOptionalText(cameraStatus, "虚拟背景摄像头已开启，站到合适位置后点击拍照。");
    setCameraButtons(true);
    updateFlowState();
    syncActionButtons();
  } catch (error) {
    setOptionalText(cameraStatus, `无法打开摄像头：${error.message || "请检查浏览器权限"}`);
    setStatus("摄像头开启失败，请检查浏览器权限设置。");
  }
}

function capturePhotoFromCamera() {
  if (!sourceCameraStream || !sourceCamera.videoWidth || !sourceCamera.videoHeight) {
    setOptionalText(cameraStatus, "\u6444\u50cf\u5934\u753b\u9762\u8fd8\u6ca1\u6709\u51c6\u5907\u597d\uff0c\u8bf7\u7a0d\u5019\u518d\u62cd\u7167\u3002");
    return;
  }

  if (!latestPersonBBox || !latestCameraCoverRect) {
    setOptionalText(cameraStatus, "\u6682\u672a\u8bc6\u522b\u5230\u6e05\u6670\u4eba\u7269\uff0c\u8bf7\u7ad9\u5230\u753b\u9762\u4e2d\u95f4\u540e\u518d\u62cd\u7167\u3002");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = sourceCamera.videoWidth;
  canvas.height = sourceCamera.videoHeight;

  const context = canvas.getContext("2d");
  context.drawImage(sourceCamera, 0, 0, canvas.width, canvas.height);

  Promise.all([blobFromCanvas(canvas), blobFromCanvas(virtualCameraPreview)])
    .then(([rawBlob, previewBlob]) => {
      const capturedAt = Date.now();
      capturedSourceFile = new File([rawBlob], `travel_capture_raw_${capturedAt}.png`, { type: "image/png" });
      latestPreviewBlob = new File([previewBlob], `travel_capture_preview_${capturedAt}.png`, { type: "image/png" });
      capturedResultFile = null;
      capturedResultMeta = null;
      capturedCompositionPayload = {
        mode: "camera_virtual_background_v2",
        canvas_width: virtualCameraPreview.width,
        canvas_height: virtualCameraPreview.height,
        background_fit: "cover",
        camera_cover_rect: latestCameraCoverRect,
        person_bbox: latestPersonBBox,
      };
      stopCameraStream();
      sourcePreview.src = "";
      sourcePreview.classList.add("hidden");
      setOptionalText(cameraStatus, "\u62cd\u7167\u5b8c\u6210\uff0c\u6b63\u5728\u8c03\u7528 ComfyUI \u4f18\u5316\u4eba\u7269\u8fb9\u7f18\uff0c\u4f4d\u7f6e\u548c\u5927\u5c0f\u4f1a\u4fdd\u6301\u4e0d\u53d8\u3002");
      setStatus("\u6b63\u5728\u4f7f\u7528 ComfyUI \u4f18\u5316\u6444\u50cf\u5934\u7167\u7247\uff1b\u4e0d\u4f1a\u91cd\u65b0\u7f29\u653e\u6216\u79fb\u52a8\u4eba\u7269\u3002");
      captureCameraButton.disabled = true;
      submitButton.disabled = true;
      updateFlowState();
      syncActionButtons();
      return generateHighQualityCameraPreview();
    })
    .then(() => {
      setOptionalText(cameraStatus, "ComfyUI \u4f18\u5316\u9884\u89c8\u5df2\u751f\u6210\uff0c\u4eba\u7269\u5927\u5c0f\u548c\u4f4d\u7f6e\u6cbf\u7528\u62cd\u7167\u65f6\u753b\u9762\u3002");
      setStatus("ComfyUI \u4f18\u5316\u9884\u89c8\u5df2\u751f\u6210\uff0c\u53ef\u4ee5\u8fdb\u5165\u7ed3\u679c\u9875\u4e0b\u8f7d\u6216\u626b\u7801\u3002");
      submitButton.disabled = false;
      updateFlowState(true);
      syncActionButtons();
    })
    .catch((error) => {
      submitButton.disabled = false;
      setOptionalText(cameraStatus, `ComfyUI \u4f18\u5316\u5931\u8d25\uff1a${error.message || "\u8bf7\u91cd\u8bd5"}`);
      setStatus(`ComfyUI \u4f18\u5316\u5931\u8d25\uff1a${error.message || "\u8bf7\u91cd\u8bd5"}`);
      updateFlowState();
      syncActionButtons();
    });
}

function startCameraCaptureCountdown() {
  if (cameraCaptureCountdownTimer) {
    return;
  }

  if (!sourceCameraStream || !sourceCamera.videoWidth || !sourceCamera.videoHeight) {
    setOptionalText(cameraStatus, "\u6444\u50cf\u5934\u753b\u9762\u8fd8\u6ca1\u6709\u51c6\u5907\u597d\uff0c\u8bf7\u7a0d\u5019\u518d\u62cd\u7167\u3002");
    return;
  }

  let remainingSeconds = CAMERA_CAPTURE_DELAY_SECONDS;
  captureCameraButton.disabled = true;
  captureCameraButton.textContent = `${remainingSeconds}s`;
  setOptionalText(cameraStatus, `${remainingSeconds} 秒后自动拍照，请保持姿势。`);

  cameraCaptureCountdownTimer = window.setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds > 0) {
      captureCameraButton.textContent = `${remainingSeconds}s`;
      setOptionalText(cameraStatus, `${remainingSeconds} 秒后自动拍照，请保持姿势。`);
      return;
    }

    window.clearInterval(cameraCaptureCountdownTimer);
    cameraCaptureCountdownTimer = null;
    captureCameraButton.textContent = CAPTURE_CAMERA_BUTTON_LABEL;
    captureCameraButton.disabled = false;
    capturePhotoFromCamera();
  }, 1000);
}

function clearCapturedSource() {
  capturedSourceFile = null;
  capturedCompositionPayload = null;
  latestPreviewBlob = null;
  capturedResultFile = null;
  capturedResultMeta = null;
  latestPersonBBox = null;
  latestCameraCoverRect = null;
}

function resetResult() {
  revokeObjectUrl(currentResultUrl);
  revokeObjectUrl(currentDownloadUrl);
  currentResultUrl = null;
  currentDownloadUrl = null;
  lastResultBlob = null;

  resultImage.src = "";
  resultImage.classList.add("hidden");
  resultMeta.classList.add("hidden");
  resultPlaceholder.classList.remove("hidden");
  promptId.textContent = "";
  setDownloadEnabled(false);
  resetSharePanel();
}

function clearTemplateSelection() {
  selectedTemplate = null;
  document.querySelectorAll(".template-card.selected").forEach((card) => {
    card.classList.remove("selected");
  });
}

function selectTemplate(template, cardElement) {
  clearCapturedCameraShot("背景已切换，请重新打开摄像头拍照以记录人物位置。");
  clearTemplateSelection();
  clearRestoredBackground();
  clearNormalizedBackgroundCache();
  selectedTemplate = template;
  targetPreview.onload = () => applyBackgroundAspect(targetPreview.naturalWidth, targetPreview.naturalHeight);
  targetPreview.src = template.url;
  targetPreview.classList.remove("hidden");
  cardElement?.classList.add("selected");
  setOptionalText(galleryStatus, `当前背景：${template.label}`);
  refreshSelectedBackgroundBitmap().catch(() => {});
  updateFlowState();
  syncActionButtons();
}

function setMode(mode) {
  currentMode = "image";
  imageModeSection.classList.remove("hidden");
  const customScene = isCustomScene();

  if (customUploadShell) {
    customUploadShell.classList.toggle("hidden", !customScene);
    customUploadShell.style.display = customScene ? "grid" : "none";
  }
  galleryShell.classList.add("hidden");


  if (customScene) {
    clearTemplateSelection();
    setOptionalText(galleryStatus, targetInput.files?.[0] || restoredBackgroundFile ? "当前背景：手动上传风景图" : "自定义场景：请上传背景图");
    if (!targetInput.files?.[0] && !restoredBackgroundFile) {
      targetPreview.classList.add("hidden");
      clearBackgroundAspect();
    }
  } else {
    targetInput.value = "";
    clearRestoredBackground();
    setOptionalText(galleryStatus, selectedTemplate ? `当前背景：${selectedTemplate.label}` : "请从背景画廊点选背景图");
    if (!selectedTemplate) {
      targetPreview.classList.add("hidden");
      clearBackgroundAspect();
    }
  }

  updateFlowState();
  syncActionButtons();
}

async function loadTemplateGallery() {
  if (isCustomScene()) {
    renderTemplateGallery();
    return;
  }

  setOptionalText(galleryStatus, "正在加载背景...");

  try {
    const response = await fetch("/api/templates");
    if (!response.ok) {
      throw new Error(`背景读取失败，状态码 ${response.status}`);
    }

    const payload = await response.json();
    const templates = payload.templates || [];
    availableTemplates = templates;

    if (!availableTemplates.length) {
      setOptionalText(galleryStatus, "暂时还没有可用背景图。");
      return;
    }

    renderTemplateGallery();
  } catch (error) {
    setOptionalText(galleryStatus, `背景加载失败：${error.message}`);
  }
}

async function buildBackgroundFile() {
  return resolveNormalizedSelectedBackgroundFile();
}

function buildSourceFile() {
  const uploadedSource = sourceInput.files?.[0];
  if (uploadedSource) {
    return uploadedSource;
  }

  return capturedSourceFile || restoredSourceFile;
}

async function generateTravelCheckin() {
  const sourceFile = buildSourceFile();
  if (!sourceFile) {
    setStatus("请先上传人物照，或先打开摄像头拍照。");
    updateFlowState();
    syncActionButtons();
    return;
  }

  resetResult();
  submitButton.disabled = true;
  syncActionButtons(true);
  setStatus("正在生成文旅打卡成片，请稍候...");

  const formData = new FormData();
  formData.append("person_image", sourceFile);

  const endpoint = "/api/swap";

  try {
    const backgroundFile = await buildBackgroundFile();
    if (!backgroundFile) {
      throw new Error(isCustomScene() ? "请先上传自定义背景图" : "请从背景画廊选择背景图");
    }
    formData.append("background_image", backgroundFile);
    if (capturedCompositionPayload) {
      formData.append("composition_payload", JSON.stringify(capturedCompositionPayload));
    }

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let detail = "请求失败";
      try {
        const payload = await response.json();
        detail = payload.detail || detail;
      } catch {
        detail = `请求失败，状态码 ${response.status}`;
      }
      throw new Error(detail);
    }

    lastResultBlob = await response.blob();
    currentResultUrl = URL.createObjectURL(lastResultBlob);

    const currentPromptId = response.headers.get("X-Comfy-Prompt-Id") || "未返回 prompt_id";
    const resultShareUrl = response.headers.get("X-Result-Share-Url");

    resultImage.src = currentResultUrl;
    resultImage.classList.remove("hidden");
    resultPlaceholder.classList.add("hidden");
    resultMeta.classList.remove("hidden");
    promptId.textContent = `生成编号：${currentPromptId}`;

    await refreshDownloadLink();
    updateSharePanel(resultShareUrl);

    setStatus("打卡成片已生成，可以本地下载，也可以微信扫码打开下载页。");
    updateFlowState(true);
  } catch (error) {
    setStatus(`生成失败：${error.message}`);
    updateFlowState();
  } finally {
    submitButton.disabled = false;
    syncActionButtons();
  }
}

async function openGenerationPage() {
  if (!hasSourceSelected()) {
    setStatus("请先上传人物照，或先打开摄像头拍照。");
    updateFlowState();
    syncActionButtons();
    return;
  }

  if (!hasImageBackgroundSelected()) {
    setStatus(isCustomScene() ? "请先上传自定义背景图，再开始生成。" : "请先选择背景图，再开始生成。");
    updateFlowState();
    syncActionButtons();
    return;
  }

  try {
    await storeGenerationState();
  } catch (error) {
    setStatus(error.message || "当前内容暂存失败，请重试。");
    return;
  }

  setStatus("正在进入生成页，请稍候...");
  window.location.assign(`/generate?v=${Date.now()}`);
}

sourceInput.addEventListener("change", () => {
  stopCameraStream();
  clearCapturedSource();
  clearRestoredSource();
  const file = setPreview(sourceInput, sourcePreview);

  if (file) {
    setOptionalText(cameraStatus, `当前人物照：${file.name}`);
  } else {
    setOptionalText(cameraStatus, "可上传人物照片，也可直接打开摄像头拍照");
  }

  updateFlowState();
  syncActionButtons();
});

targetInput.addEventListener("change", () => {
  if (!isCustomScene()) {
    targetInput.value = "";
    setStatus("仅“自定义”场景支持上传背景图，请先切换到自定义。");
    return;
  }

  clearTemplateSelection();
  clearRestoredBackground();
  clearNormalizedBackgroundCache();
  clearCapturedCameraShot("背景已切换，请重新打开摄像头拍照以记录人物位置。");
  const file = setPreview(targetInput, targetPreview);
  setOptionalText(galleryStatus, file ? "当前背景：手动上传风景图" : "自定义场景：请上传背景图");
  if (file) {
    refreshSelectedBackgroundBitmap().catch(() => {});
  }
  updateFlowState();
  syncActionButtons();
});

quickUploadButton?.addEventListener("click", () => {
  document.getElementById("upload-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  sourceInput.click();
});

qrUploadButton?.addEventListener("click", openQrUploadSession);
qrUploadCloseButton?.addEventListener("click", hideQrUploadModal);
qrUploadModal?.addEventListener("click", (event) => {
  if (event.target === qrUploadModal) {
    hideQrUploadModal();
  }
});

openCameraButton.addEventListener("click", openCamera);
captureCameraButton.addEventListener("click", startCameraCaptureCountdown);
closeCameraButton.addEventListener("click", () => {
  stopCameraStream();
  setOptionalText(cameraStatus, "摄像头已关闭，可重新打开或直接上传人物照。");
  updateFlowState();
  syncActionButtons();
});

submitButton.addEventListener("click", openGenerationPage);
regenerateButton.addEventListener("click", openGenerationPage);

downloadLink.addEventListener("click", (event) => {
  if (downloadLink.classList.contains("is-disabled")) {
    event.preventDefault();
  }
});

formatInputs.forEach((input) => {
  input.addEventListener("change", () => {
    refreshDownloadLink();
  });
});

setDownloadEnabled(false);
resetSharePanel();
setMode("image");
updateFlowState();
syncActionButtons();

async function initializePage() {
  const redirected = maybeRedirectPrivateHostToLoopback();
  if (redirected) {
    return;
  }

  selectedSceneKey = resolveSelectedSceneFromQuery();
  const queryTemplate = resolveTemplateFromQuery();
  syncSceneLabel();
  setMode("image");
  await loadTemplateGallery();
  await restoreStoredFormState();
  if (queryTemplate) {
    restoreTemplateSelection(queryTemplate);
  }
}

initializePage();
