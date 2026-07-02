const backButton = document.getElementById("back-button");
const errorBackButton = document.getElementById("error-back-button");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");
const resultState = document.getElementById("result-state");
const resultImage = document.getElementById("generation-result-image");
const resultBackdrop = document.getElementById("result-backdrop");
const promptId = document.getElementById("generation-prompt-id");
const generationWarning = document.getElementById("generation-warning");
const qrShell = document.getElementById("generation-qr-shell");
const qrImage = document.getElementById("generation-qr-image");
const downloadLink = document.getElementById("generation-download-link");
const shareLink = document.getElementById("generation-share-link");
const openEditorButton = document.getElementById("open-editor-button");
const editorModal = document.getElementById("editor-modal");
const closeEditorButton = document.getElementById("close-editor-button");
const cancelEditorButton = document.getElementById("cancel-editor-button");
const applyEditorButton = document.getElementById("apply-editor-button");
const resetEditorButton = document.getElementById("reset-editor-button");
const removeStickerButton = document.getElementById("remove-sticker-button");
const textStickerInput = document.getElementById("text-sticker-input");
const addTextStickerButton = document.getElementById("add-text-sticker-button");
const exposureRange = document.getElementById("face-exposure-range");
const smoothingRange = document.getElementById("face-smoothing-range");
const personSizeRange = document.getElementById("person-size-range");
const stickerSizeRange = document.getElementById("sticker-size-range");
const editorCanvas = document.getElementById("editor-canvas");
const stickerButtons = Array.from(document.querySelectorAll(".sticker-chip"));
const filterButtons = Array.from(document.querySelectorAll(".filter-chip"));

const PENDING_GENERATION_STORAGE_KEY = "ai_background_pending_generation";
const NAVIGATION_DB_NAME = "ai_background_navigation";
const NAVIGATION_DB_VERSION = 1;
const NAVIGATION_FILE_STORE = "files";
const SOURCE_FILE_RECORD_KEY = "source-file";
const BACKGROUND_FILE_RECORD_KEY = "background-file";
const PRECOMPOSED_RESULT_FILE_RECORD_KEY = "precomposed-result-file";

let currentResultUrl = null;
let currentDownloadUrl = null;
let currentResultId = null;
let resultImageBlob = null;
let resultImageBitmap = null;
let currentGenerationPayload = null;
let editorBackgroundBitmap = null;
let editorPersonLayerBitmap = null;
let editorPersonLocalMaskCanvas = null;
let editorPersonLocalMaskData = null;
let editorFaceBounds = null;
let editorFaceMaskCanvas = null;
let editorFaceMaskData = null;
let editorDraft = null;
let dragState = null;

const editorContext = editorCanvas.getContext("2d");

const FILTER_PRESETS = {
  original: { filter: "none" },
  warm: { filter: "brightness(1.05) saturate(1.14) sepia(0.14) hue-rotate(-10deg)" },
  cool: { filter: "brightness(1.04) contrast(1.06) saturate(0.94) hue-rotate(12deg)" },
  film: { filter: "contrast(1.12) saturate(0.9) sepia(0.22) brightness(0.96)" },
  dream: { filter: "brightness(1.08) saturate(1.08) contrast(0.94) blur(0.6px)" },
  mono: { filter: "grayscale(1) contrast(1.08) brightness(1.02)" },
};

function isPrivateIpv4(hostname) {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!match) {
    return false;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  return first === 10 || first === 127 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
}

function maybeRedirectPrivateHostToLoopback() {
  if (window.location.protocol === "https:" || !isPrivateIpv4(window.location.hostname) || window.location.hostname === "127.0.0.1") {
    return false;
  }

  const port = window.location.port ? `:${window.location.port}` : "";
  const loopbackBaseUrl = `${window.location.protocol}//127.0.0.1${port}`;
  if (loopbackBaseUrl === window.location.origin) {
    return false;
  }

  window.location.replace(`${loopbackBaseUrl}${window.location.pathname}${window.location.search}${window.location.hash}`);
  return true;
}

function buildStickerSvgDataUrl(svgMarkup) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`;
}

const STICKER_PRESETS = {
  sunglasses: {
    type: "image",
    widthRatio: 1.38,
    dataUrl: buildStickerSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 120">
        <rect x="16" y="34" width="90" height="54" rx="18" fill="#111827" stroke="#60a5fa" stroke-width="8"/>
        <rect x="154" y="34" width="90" height="54" rx="18" fill="#111827" stroke="#60a5fa" stroke-width="8"/>
        <rect x="102" y="50" width="56" height="14" rx="7" fill="#60a5fa"/>
        <path d="M12 54 C24 40, 40 36, 54 38" fill="none" stroke="#111827" stroke-width="10" stroke-linecap="round"/>
        <path d="M248 54 C236 40, 220 36, 206 38" fill="none" stroke="#111827" stroke-width="10" stroke-linecap="round"/>
      </svg>
    `),
  },
  mustache: {
    type: "image",
    widthRatio: 1.55,
    dataUrl: buildStickerSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 130">
        <path d="M148 62 C126 26, 62 26, 42 64 C30 88, 40 106, 70 108 C98 110, 124 96, 150 72 C176 96, 202 110, 230 108 C260 106, 270 88, 258 64 C238 26, 174 26, 152 62 Z" fill="#3f2b1f"/>
        <path d="M150 72 C134 82, 118 88, 102 88 C114 72, 126 64, 150 60 C174 64, 186 72, 198 88 C182 88, 166 82, 150 72 Z" fill="#4f3526"/>
      </svg>
    `),
  },
  "rabbit-ears": {
    type: "image",
    widthRatio: 1.08,
    dataUrl: buildStickerSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 260">
        <ellipse cx="72" cy="90" rx="34" ry="88" transform="rotate(-18 72 90)" fill="#ffffff" stroke="#e5e7eb" stroke-width="8"/>
        <ellipse cx="148" cy="90" rx="34" ry="88" transform="rotate(18 148 90)" fill="#ffffff" stroke="#e5e7eb" stroke-width="8"/>
        <ellipse cx="74" cy="92" rx="16" ry="58" transform="rotate(-18 74 92)" fill="#f9a8d4"/>
        <ellipse cx="146" cy="92" rx="16" ry="58" transform="rotate(18 146 92)" fill="#f9a8d4"/>
        <path d="M62 174 C92 154, 128 154, 158 174" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/>
      </svg>
    `),
  },
  blush: {
    type: "image",
    widthRatio: 1.62,
    dataUrl: buildStickerSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120">
        <ellipse cx="82" cy="60" rx="54" ry="28" fill="#fb7185" opacity="0.5"/>
        <ellipse cx="218" cy="60" rx="54" ry="28" fill="#fb7185" opacity="0.5"/>
        <path d="M52 60 H112" stroke="#fda4af" stroke-width="10" stroke-linecap="round" opacity="0.55"/>
        <path d="M188 60 H248" stroke="#fda4af" stroke-width="10" stroke-linecap="round" opacity="0.55"/>
      </svg>
    `),
  },
  "sparkle-band": {
    type: "image",
    widthRatio: 1.7,
    dataUrl: buildStickerSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 140">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#c084fc"/>
            <stop offset="0.5" stop-color="#f9a8d4"/>
            <stop offset="1" stop-color="#60a5fa"/>
          </linearGradient>
        </defs>
        <rect x="14" y="48" width="312" height="42" rx="21" fill="url(#g)" opacity="0.85"/>
        <path d="M92 18 L100 40 L122 48 L100 56 L92 78 L84 56 L62 48 L84 40 Z" fill="#ffffff" opacity="0.95"/>
        <path d="M242 30 L248 46 L264 52 L248 58 L242 74 L236 58 L220 52 L236 46 Z" fill="#ffffff" opacity="0.9"/>
      </svg>
    `),
  },
};

const stickerAssetCache = new Map();
const stickerMeasureCanvas = document.createElement("canvas");
const stickerMeasureContext = stickerMeasureCanvas.getContext("2d");

function getStickerAsset(sticker) {
  if (sticker.type !== "image") {
    return null;
  }

  const preset = STICKER_PRESETS[sticker.presetId];
  if (!preset) {
    return null;
  }

  let cachedAsset = stickerAssetCache.get(sticker.presetId);
  if (!cachedAsset) {
    const image = new Image();
    image.decoding = "async";
    image.src = preset.dataUrl;
    cachedAsset = { image, widthRatio: preset.widthRatio || 1 };
    stickerAssetCache.set(sticker.presetId, cachedAsset);
  }

  return cachedAsset;
}

function getTextStickerDimensions(sticker) {
  const fontSize = Math.max(28, sticker.size * 0.42);
  stickerMeasureContext.font = `800 ${fontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
  const metrics = stickerMeasureContext.measureText(sticker.text || "文字");
  const width = Math.max(fontSize * 1.6, metrics.width + fontSize * 0.6);
  const height = fontSize * 1.35;
  return { width, height, fontSize };
}

function getStickerDimensions(sticker) {
  if (sticker.type === "image") {
    const widthRatio = getStickerAsset(sticker)?.widthRatio || 1;
    return {
      width: sticker.size * widthRatio,
      height: sticker.size,
      fontSize: 0,
    };
  }

  if (sticker.type === "text") {
    return getTextStickerDimensions(sticker);
  }

  return {
    width: sticker.size,
    height: sticker.size,
    fontSize: sticker.size,
  };
}

function revokeObjectUrl(url) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

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

function readPendingGenerationState() {
  const rawValue = window.sessionStorage.getItem(PENDING_GENERATION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  window.sessionStorage.removeItem(PENDING_GENERATION_STORAGE_KEY);

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

async function buildPayloadFromStoredState(state) {
  if (!state) {
    return null;
  }

  const sourceFile = await readNavigationFile(SOURCE_FILE_RECORD_KEY);
  if (!sourceFile) {
    throw new Error("未找到待生成的人物照，请返回上一步重新选择。");
  }
  const precomposedResultFile = state.hasPrecomposedResultFile ? await readNavigationFile(PRECOMPOSED_RESULT_FILE_RECORD_KEY) : null;

  if (state.hasBackgroundFile) {
    const backgroundFile = await readNavigationFile(BACKGROUND_FILE_RECORD_KEY);
    if (!backgroundFile) {
      throw new Error("未找到待生成的背景图，请返回上一步重新选择。");
    }

    return {
      mode: "image",
      sourceFile,
      backgroundFile,
      compositionPayload: state.compositionPayload || null,
      precomposedResultFile,
      precomposedResultMeta: state.precomposedResultMeta || null,
    };
  }

  if (!state.backgroundTemplateName) {
    throw new Error("未找到待生成的背景模板，请返回上一步重新选择。");
  }

  return {
    mode: "image",
    sourceFile,
    backgroundTemplateName: state.backgroundTemplateName,
    compositionPayload: state.compositionPayload || null,
    precomposedResultFile,
    precomposedResultMeta: state.precomposedResultMeta || null,
  };
}

function buildCachedResponse(meta = {}) {
  const headerMap = new Map([
    ["x-comfy-prompt-id", meta.promptId || "cached-camera-preview"],
    ["x-result-id", meta.resultId || ""],
    ["x-result-image-url", meta.resultImageUrl || ""],
    ["x-result-download-url", meta.resultDownloadUrl || ""],
    ["x-result-share-url", meta.resultShareUrl || ""],
    ["x-result-qr-url", meta.resultQrUrl || ""],
    ["x-editor-face-bounds", meta.editorFaceBounds || ""],
    ["x-editor-face-mask-url", meta.editorFaceMaskUrl || ""],
    ["x-generation-warning", meta.generationWarning || ""],
  ]);

  return {
    headers: {
      get(name) {
        return headerMap.get(String(name).toLowerCase()) || null;
      },
    },
  };
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  if (window.opener && !window.opener.closed) {
    window.close();
    return;
  }

  window.location.href = "/";
}

function showError(message) {
  loadingState.classList.add("hidden");
  resultState.classList.add("hidden");
  errorState.classList.remove("hidden");
  errorMessage.textContent = message;
}

function createDefaultEditorDraft() {
  return {
    exposure: 0,
    smoothing: 0,
    filterPreset: "original",
    personOffsetX: 0,
    personOffsetY: 0,
    personScale: 1,
    selectedLayer: null,
    stickers: [],
    selectedStickerId: null,
  };
}

function cloneEditorDraft(sourceDraft) {
  return {
    exposure: sourceDraft.exposure,
    smoothing: sourceDraft.smoothing,
    filterPreset: sourceDraft.filterPreset,
    personOffsetX: sourceDraft.personOffsetX || 0,
    personOffsetY: sourceDraft.personOffsetY || 0,
    personScale: clampPersonScale(sourceDraft.personScale || 1),
    selectedLayer: sourceDraft.selectedLayer || null,
    selectedStickerId: sourceDraft.selectedStickerId,
    stickers: sourceDraft.stickers.map((sticker) => ({ ...sticker })),
  };
}

function clampPersonScale(value) {
  return Math.max(0.6, Math.min(1.8, Number.isFinite(value) ? value : 1));
}

function drawBitmapCover(context, bitmap, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / bitmap.width, targetHeight / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;
  context.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);
}

async function loadEditorBackgroundBitmap(payload) {
  if (!payload) {
    return null;
  }

  if (payload.backgroundFile) {
    return createImageBitmap(payload.backgroundFile);
  }

  if (!payload.backgroundTemplateName) {
    return null;
  }

  const response = await fetch(`/template-files/${encodeURIComponent(payload.backgroundTemplateName)}`, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const backgroundBlob = await response.blob();
  return createImageBitmap(backgroundBlob);
}

function buildShiftedMaskCanvas(maskCanvas, offsetX, offsetY) {
  if (!maskCanvas) {
    return null;
  }

  const shiftedCanvas = document.createElement("canvas");
  shiftedCanvas.width = maskCanvas.width;
  shiftedCanvas.height = maskCanvas.height;
  const shiftedContext = shiftedCanvas.getContext("2d");
  shiftedContext.drawImage(maskCanvas, offsetX, offsetY);
  return shiftedCanvas;
}

function getCanvasImageData(canvas) {
  const context = canvas.getContext("2d");
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function loadMaskCanvasFromUrl(maskUrl) {
  if (!maskUrl) {
    return { canvas: null, imageData: null };
  }

  try {
    const response = await fetch(maskUrl, { cache: "no-store" });
    if (!response.ok) {
      return { canvas: null, imageData: null };
    }

    const maskBlob = await response.blob();
    const maskBitmap = await createImageBitmap(maskBlob);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = maskBitmap.width;
    maskCanvas.height = maskBitmap.height;
    const maskContext = maskCanvas.getContext("2d");
    maskContext.drawImage(maskBitmap, 0, 0);
    const maskImageData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    maskBitmap.close();
    return { canvas: maskCanvas, imageData: maskImageData };
  } catch {
    return { canvas: null, imageData: null };
  }
}

async function loadBitmapFromUrl(assetUrl) {
  if (!assetUrl) {
    return null;
  }

  try {
    const response = await fetch(assetUrl, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const assetBlob = await response.blob();
    return createImageBitmap(assetBlob);
  } catch {
    return null;
  }
}

function buildCompositePersonMaskCanvas(maskImageData) {
  if (!maskImageData) {
    return null;
  }

  const compositeMaskCanvas = document.createElement("canvas");
  compositeMaskCanvas.width = maskImageData.width;
  compositeMaskCanvas.height = maskImageData.height;
  const compositeMaskContext = compositeMaskCanvas.getContext("2d");
  const compositeMaskImageData = compositeMaskContext.createImageData(maskImageData.width, maskImageData.height);

  for (let index = 0; index < maskImageData.data.length; index += 4) {
    const rawAlpha = maskImageData.data[index + 3];
    let normalizedAlpha = 0;

    if (rawAlpha <= 16) {
      normalizedAlpha = 0;
    } else if (rawAlpha >= 84) {
      normalizedAlpha = 255;
    } else {
      const progress = (rawAlpha - 16) / (84 - 16);
      normalizedAlpha = Math.round(progress * progress * (3 - 2 * progress) * 255);
    }

    compositeMaskImageData.data[index] = 255;
    compositeMaskImageData.data[index + 1] = 255;
    compositeMaskImageData.data[index + 2] = 255;
    compositeMaskImageData.data[index + 3] = normalizedAlpha;
  }

  compositeMaskContext.putImageData(compositeMaskImageData, 0, 0);
  return compositeMaskCanvas;
}

function canMovePersonInEditor() {
  return Boolean(editorBackgroundBitmap && editorFaceMaskCanvas && resultImageBitmap);
}

function buildMaskAssetsFromBounds(maskImageData, bounds) {
  if (!maskImageData || !bounds) {
    return null;
  }

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = bounds.width;
  croppedCanvas.height = bounds.height;
  const croppedContext = croppedCanvas.getContext("2d");
  const croppedImageData = croppedContext.createImageData(bounds.width, bounds.height);

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const sourceIndex = ((bounds.y + y) * maskImageData.width + (bounds.x + x)) * 4;
      const targetIndex = (y * bounds.width + x) * 4;
      const alpha = maskImageData.data[sourceIndex + 3];
      croppedImageData.data[targetIndex] = 255;
      croppedImageData.data[targetIndex + 1] = 255;
      croppedImageData.data[targetIndex + 2] = 255;
      croppedImageData.data[targetIndex + 3] = alpha;
    }
  }

  croppedContext.putImageData(croppedImageData, 0, 0);
  return {
    canvas: croppedCanvas,
    imageData: croppedImageData,
    sourceBounds: bounds,
  };
}

function getPersonMaskAssets() {
  if (editorPersonLocalMaskCanvas && editorPersonLocalMaskData) {
    const localMaskBounds = getLocalMaskBounds();
    if (!localMaskBounds) {
      return null;
    }

    return {
      canvas: editorPersonLocalMaskCanvas,
      imageData: editorPersonLocalMaskData,
      sourceBounds: localMaskBounds,
      isExportedLayer: true,
    };
  }

  const faceMaskBounds = getMaskBounds(editorFaceMaskData);
  if (!faceMaskBounds) {
    return null;
  }

  return {
    ...buildMaskAssetsFromBounds(editorFaceMaskData, faceMaskBounds),
    isExportedLayer: false,
  };
}

function getLocalMaskBounds() {
  return getMaskBounds(editorPersonLocalMaskData);
}

function isPointOnPerson(position) {
  if (!editorDraft) {
    return false;
  }

  const personMaskAssets = getPersonMaskAssets();
  const personLayerCanvas = buildPersonLayerCanvas(personMaskAssets);
  const personPlacementRect = getPersonPlacementRect(personLayerCanvas, personMaskAssets);
  if (!personMaskAssets?.imageData || !personPlacementRect) {
    return false;
  }

  const relativeX = (position.x - personPlacementRect.x) / personPlacementRect.width;
  const relativeY = (position.y - personPlacementRect.y) / personPlacementRect.height;
  if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) {
    return false;
  }

  const sampleX = relativeX * personMaskAssets.imageData.width;
  const sampleY = relativeY * personMaskAssets.imageData.height;
  return getMaskAlpha(personMaskAssets.imageData, sampleX, sampleY) > 0.12;
}

function getTranslatedFaceBounds() {
  if (!editorFaceBounds || !editorDraft) {
    return null;
  }

  const personScale = clampPersonScale(editorDraft.personScale || 1);
  const centerX = editorFaceBounds.x + editorFaceBounds.width / 2 + editorDraft.personOffsetX;
  const centerY = editorFaceBounds.y + editorFaceBounds.height / 2 + editorDraft.personOffsetY;
  const width = editorFaceBounds.width * personScale;
  const height = editorFaceBounds.height * personScale;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function drawSelectedPersonOutline(context) {
  const translatedBounds = getTranslatedFaceBounds();
  if (!translatedBounds) {
    return;
  }

  context.save();
  context.strokeStyle = "rgba(78, 168, 255, 0.92)";
  context.lineWidth = 3;
  context.setLineDash([12, 8]);
  context.strokeRect(
    translatedBounds.x - translatedBounds.width * 0.06,
    translatedBounds.y - translatedBounds.height * 0.06,
    translatedBounds.width * 1.12,
    translatedBounds.height * 1.12,
  );
  context.restore();
}

function getPersonPlacementRect(personLayerCanvas, personMaskAssets) {
  if (!editorDraft || !personLayerCanvas || !personMaskAssets?.sourceBounds) {
    return null;
  }

  const personScale = clampPersonScale(editorDraft.personScale || 1);

  if (personMaskAssets.isExportedLayer && editorFaceBounds) {
    const centerX = editorFaceBounds.x + editorFaceBounds.width / 2 + editorDraft.personOffsetX;
    const centerY = editorFaceBounds.y + editorFaceBounds.height / 2 + editorDraft.personOffsetY;
    const baseScale = editorFaceBounds.width / Math.max(1, personMaskAssets.sourceBounds.width);
    const finalScale = baseScale * personScale;
    const sourceCenterX = personMaskAssets.sourceBounds.x + personMaskAssets.sourceBounds.width / 2;
    const sourceCenterY = personMaskAssets.sourceBounds.y + personMaskAssets.sourceBounds.height / 2;

    return {
      x: centerX - sourceCenterX * finalScale,
      y: centerY - sourceCenterY * finalScale,
      width: personLayerCanvas.width * finalScale,
      height: personLayerCanvas.height * finalScale,
    };
  }

  const centerX = personMaskAssets.sourceBounds.x + personMaskAssets.sourceBounds.width / 2 + editorDraft.personOffsetX;
  const centerY = personMaskAssets.sourceBounds.y + personMaskAssets.sourceBounds.height / 2 + editorDraft.personOffsetY;

  return {
    x: centerX - (personLayerCanvas.width * personScale) / 2,
    y: centerY - (personLayerCanvas.height * personScale) / 2,
    width: personLayerCanvas.width * personScale,
    height: personLayerCanvas.height * personScale,
  };
}

function buildPersonLayerCanvas(personMaskAssets = getPersonMaskAssets()) {
  if (editorPersonLayerBitmap && personMaskAssets?.isExportedLayer) {
    const compositeMaskCanvas = buildCompositePersonMaskCanvas(personMaskAssets.imageData);
    if (!compositeMaskCanvas) {
      return null;
    }

    const personCanvas = document.createElement("canvas");
    personCanvas.width = editorPersonLayerBitmap.width;
    personCanvas.height = editorPersonLayerBitmap.height;
    const personContext = personCanvas.getContext("2d");
    personContext.drawImage(editorPersonLayerBitmap, 0, 0);
    personContext.globalCompositeOperation = "destination-in";
    personContext.drawImage(compositeMaskCanvas, 0, 0);
    personContext.globalCompositeOperation = "source-over";
    return personCanvas;
  }

  if (!resultImageBitmap || !personMaskAssets?.sourceBounds || !personMaskAssets?.imageData) {
    return null;
  }

  const compositeMaskCanvas = buildCompositePersonMaskCanvas(personMaskAssets.imageData);
  if (!compositeMaskCanvas) {
    return null;
  }

  const personCanvas = document.createElement("canvas");
  personCanvas.width = personMaskAssets.sourceBounds.width;
  personCanvas.height = personMaskAssets.sourceBounds.height;
  const personContext = personCanvas.getContext("2d");
  personContext.drawImage(
    resultImageBitmap,
    personMaskAssets.sourceBounds.x,
    personMaskAssets.sourceBounds.y,
    personMaskAssets.sourceBounds.width,
    personMaskAssets.sourceBounds.height,
    0,
    0,
    personMaskAssets.sourceBounds.width,
    personMaskAssets.sourceBounds.height,
  );
  personContext.globalCompositeOperation = "destination-in";
  personContext.drawImage(compositeMaskCanvas, 0, 0);
  personContext.globalCompositeOperation = "source-over";
  return personCanvas;
}

function cloneFaceBounds(faceBounds) {
  if (!faceBounds) {
    return null;
  }

  return {
    x: faceBounds.x,
    y: faceBounds.y,
    width: faceBounds.width,
    height: faceBounds.height,
  };
}

function parseFaceBoundsHeader(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (![parsed.x, parsed.y, parsed.width, parsed.height].every(Number.isFinite)) {
      return null;
    }

    return {
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
    };
  } catch {
    return null;
  }
}

async function loadFaceMaskAssets(maskUrl) {
  if (!maskUrl) {
    return { canvas: null, imageData: null };
  }

  try {
    const response = await fetch(maskUrl, { cache: "no-store" });
    if (!response.ok) {
      return { canvas: null, imageData: null };
    }

    const maskBlob = await response.blob();
    const maskBitmap = await createImageBitmap(maskBlob);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = maskBitmap.width;
    maskCanvas.height = maskBitmap.height;
    const maskContext = maskCanvas.getContext("2d");
    maskContext.drawImage(maskBitmap, 0, 0);
    const sourceImageData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    const alphaMaskCanvas = document.createElement("canvas");
    alphaMaskCanvas.width = maskBitmap.width;
    alphaMaskCanvas.height = maskBitmap.height;
    const alphaMaskContext = alphaMaskCanvas.getContext("2d");
    const alphaMaskImageData = alphaMaskContext.createImageData(maskBitmap.width, maskBitmap.height);

    for (let index = 0; index < sourceImageData.data.length; index += 4) {
      const sourceAlpha = sourceImageData.data[index + 3] / 255;
      const grayscaleValue = Math.max(
        sourceImageData.data[index],
        sourceImageData.data[index + 1],
        sourceImageData.data[index + 2],
      );
      const maskAlpha = Math.round(grayscaleValue * sourceAlpha);
      alphaMaskImageData.data[index] = 255;
      alphaMaskImageData.data[index + 1] = 255;
      alphaMaskImageData.data[index + 2] = 255;
      alphaMaskImageData.data[index + 3] = maskAlpha;
    }

    alphaMaskContext.putImageData(alphaMaskImageData, 0, 0);
    maskBitmap.close();

    return {
      canvas: alphaMaskCanvas,
      imageData: alphaMaskImageData,
    };
  } catch {
    return { canvas: null, imageData: null };
  }
}

function getMaskAlpha(maskImageData, x, y) {
  if (!maskImageData) {
    return 0;
  }

  const pixelX = Math.max(0, Math.min(maskImageData.width - 1, Math.floor(x)));
  const pixelY = Math.max(0, Math.min(maskImageData.height - 1, Math.floor(y)));
  const index = (pixelY * maskImageData.width + pixelX) * 4;
  return maskImageData.data[index + 3] / 255;
}

function getMaskBounds(maskImageData) {
  if (!maskImageData) {
    return null;
  }

  let minX = maskImageData.width;
  let minY = maskImageData.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < maskImageData.height; y += 1) {
    for (let x = 0; x < maskImageData.width; x += 1) {
      const index = (y * maskImageData.width + x) * 4;
      if (maskImageData.data[index + 3] <= 12) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function applyFilterPresetToFace(targetContext, sourceCanvas, presetName, faceBounds, faceMaskCanvas) {
  const preset = FILTER_PRESETS[presetName] || FILTER_PRESETS.original;
  if (!preset || preset.filter === "none") {
    return;
  }

  const filteredCanvas = document.createElement("canvas");
  filteredCanvas.width = sourceCanvas.width;
  filteredCanvas.height = sourceCanvas.height;
  const filteredContext = filteredCanvas.getContext("2d");
  filteredContext.filter = preset.filter;
  filteredContext.drawImage(sourceCanvas, 0, 0);
  filteredContext.filter = "none";

  if (faceMaskCanvas) {
    const maskedFilterCanvas = document.createElement("canvas");
    maskedFilterCanvas.width = sourceCanvas.width;
    maskedFilterCanvas.height = sourceCanvas.height;
    const maskedFilterContext = maskedFilterCanvas.getContext("2d");
    maskedFilterContext.drawImage(filteredCanvas, 0, 0);
    maskedFilterContext.globalCompositeOperation = "destination-in";
    maskedFilterContext.drawImage(faceMaskCanvas, 0, 0);
    maskedFilterContext.globalCompositeOperation = "source-over";
    targetContext.drawImage(maskedFilterCanvas, 0, 0);
    return;
  }

  targetContext.save();
  targetContext.beginPath();
  targetContext.ellipse(
    faceBounds.x + faceBounds.width / 2,
    faceBounds.y + faceBounds.height / 2,
    faceBounds.width / 2,
    faceBounds.height / 2,
    0,
    0,
    Math.PI * 2,
  );
  targetContext.clip();
  targetContext.drawImage(filteredCanvas, 0, 0);
  targetContext.restore();
}

function getFallbackFaceBounds(width, height) {
  return clampFaceBounds(
    {
      x: width * 0.38,
      y: height * 0.33,
      width: width * 0.24,
      height: height * 0.34,
    },
    width,
    height,
  );
}

function clampFaceBounds(faceBounds, width, height) {
  const x = Math.max(0, Math.min(faceBounds.x, width - 1));
  const y = Math.max(0, Math.min(faceBounds.y, height - 1));

  return {
    x,
    y,
    width: Math.max(1, Math.min(faceBounds.width, width - x)),
    height: Math.max(1, Math.min(faceBounds.height, height - y)),
  };
}

function expandFaceBounds(faceBounds, bitmap) {
  const expandedBounds = {
    x: faceBounds.x - faceBounds.width * 0.28,
    y: faceBounds.y - faceBounds.height * 0.16,
    width: faceBounds.width * 1.56,
    height: faceBounds.height * 1.9,
  };

  return clampFaceBounds(expandedBounds, bitmap.width, bitmap.height);
}

async function detectFaceBounds(bitmap) {
  if ("FaceDetector" in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(bitmap);
      if (faces.length) {
        const face = faces
          .map((item) => item.boundingBox)
          .sort((left, right) => right.width * right.height - left.width * left.height)[0];
        return expandFaceBounds(face, bitmap);
      }
    } catch {
      // Ignore detection failure and fall back to heuristic bounds.
    }
  }

  return getFallbackFaceBounds(bitmap.width, bitmap.height);
}

function getEllipseMaskAlpha(faceBounds, x, y) {
  const centerX = faceBounds.x + faceBounds.width / 2;
  const centerY = faceBounds.y + faceBounds.height / 2;
  const radiusX = faceBounds.width / 2;
  const radiusY = faceBounds.height / 2;
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance >= 1) {
    return 0;
  }

  if (distance <= 0.7) {
    return 1;
  }

  const featherProgress = (distance - 0.7) / 0.3;
  return 1 - featherProgress * featherProgress * (3 - 2 * featherProgress);
}

function applyExposureToFace(canvas, amount, faceBounds, faceMaskData) {
  if (!amount) {
    return;
  }

  const context = canvas.getContext("2d");
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const brightnessDelta = amount * 2.4;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const pixelIndex = index / 4;
    const pixelX = pixelIndex % canvas.width;
    const pixelY = Math.floor(pixelIndex / canvas.width);
    const alpha = faceMaskData
      ? getMaskAlpha(faceMaskData, pixelX, pixelY)
      : getEllipseMaskAlpha(faceBounds, pixelX, pixelY);
    if (!alpha) {
      continue;
    }

    imageData.data[index] = Math.min(255, Math.max(0, imageData.data[index] + brightnessDelta * alpha));
    imageData.data[index + 1] = Math.min(255, Math.max(0, imageData.data[index + 1] + brightnessDelta * alpha));
    imageData.data[index + 2] = Math.min(255, Math.max(0, imageData.data[index + 2] + brightnessDelta * alpha));
  }

  context.putImageData(imageData, 0, 0);
}

function applySmoothingToFace(targetContext, sourceCanvas, amount, faceBounds, faceMaskCanvas) {
  if (!amount) {
    return;
  }

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = sourceCanvas.width;
  blurCanvas.height = sourceCanvas.height;
  const blurContext = blurCanvas.getContext("2d");
  blurContext.filter = `blur(${Math.max(1, (amount / 100) * 16)}px)`;
  blurContext.drawImage(sourceCanvas, 0, 0);
  blurContext.filter = "none";

  if (faceMaskCanvas) {
    const maskedBlurCanvas = document.createElement("canvas");
    maskedBlurCanvas.width = sourceCanvas.width;
    maskedBlurCanvas.height = sourceCanvas.height;
    const maskedBlurContext = maskedBlurCanvas.getContext("2d");
    maskedBlurContext.drawImage(blurCanvas, 0, 0);
    maskedBlurContext.globalCompositeOperation = "destination-in";
    maskedBlurContext.drawImage(faceMaskCanvas, 0, 0);
    maskedBlurContext.globalCompositeOperation = "source-over";

    targetContext.save();
    targetContext.globalAlpha = Math.min(0.78, amount / 100);
    targetContext.drawImage(maskedBlurCanvas, 0, 0);
    targetContext.restore();
    return;
  }

  targetContext.save();
  targetContext.beginPath();
  targetContext.ellipse(
    faceBounds.x + faceBounds.width / 2,
    faceBounds.y + faceBounds.height / 2,
    faceBounds.width / 2,
    faceBounds.height / 2,
    0,
    0,
    Math.PI * 2,
  );
  targetContext.clip();
  targetContext.globalAlpha = Math.min(0.78, amount / 100);
  targetContext.drawImage(blurCanvas, 0, 0);
  targetContext.restore();
}

function drawSticker(context, sticker, isSelected = false) {
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.18)";
  context.shadowBlur = 10;

  const dimensions = getStickerDimensions(sticker);
  let stickerWidth = dimensions.width;
  let stickerHeight = dimensions.height;

  if (sticker.type === "image") {
    const asset = getStickerAsset(sticker);
    if (asset) {
      if (asset.image.complete) {
        context.drawImage(asset.image, sticker.x - stickerWidth / 2, sticker.y - stickerHeight / 2, stickerWidth, stickerHeight);
      }
    }
  } else if (sticker.type === "text") {
    context.shadowColor = "rgba(0, 0, 0, 0.28)";
    context.shadowBlur = 18;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = Math.max(3, dimensions.fontSize * 0.12);
    context.strokeStyle = "rgba(6, 10, 20, 0.72)";
    context.fillStyle = "#ffffff";
    context.font = `800 ${dimensions.fontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.strokeText(sticker.text, sticker.x, sticker.y);
    context.fillText(sticker.text, sticker.x, sticker.y);
  } else {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${sticker.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    context.fillText(sticker.text, sticker.x, sticker.y);
  }

  if (isSelected) {
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(78, 168, 255, 0.9)";
    context.lineWidth = 3;
    context.strokeRect(sticker.x - stickerWidth * 0.55, sticker.y - stickerHeight * 0.55, stickerWidth * 1.1, stickerHeight * 1.1);
  }
  context.restore();
}

function renderEditorCanvas() {
  if (!resultImageBitmap || !editorDraft) {
    return;
  }

  editorCanvas.width = resultImageBitmap.width;
  editorCanvas.height = resultImageBitmap.height;

  const workingCanvas = document.createElement("canvas");
  workingCanvas.width = resultImageBitmap.width;
  workingCanvas.height = resultImageBitmap.height;
  const workingContext = workingCanvas.getContext("2d");
  const personMaskAssets = getPersonMaskAssets();
  const personLayerCanvas = buildPersonLayerCanvas(personMaskAssets);

  if (canMovePersonInEditor() && personLayerCanvas) {
    drawBitmapCover(workingContext, editorBackgroundBitmap, workingCanvas.width, workingCanvas.height);
    const personLayerContext = personLayerCanvas.getContext("2d");
    if (personMaskAssets?.sourceBounds && personMaskAssets?.canvas && personMaskAssets?.imageData) {
      applyExposureToFace(personLayerCanvas, editorDraft.exposure, personMaskAssets.sourceBounds, personMaskAssets.imageData);
      applySmoothingToFace(personLayerContext, personLayerCanvas, editorDraft.smoothing, personMaskAssets.sourceBounds, personMaskAssets.canvas);
      applyFilterPresetToFace(personLayerContext, personLayerCanvas, editorDraft.filterPreset, personMaskAssets.sourceBounds, personMaskAssets.canvas);
    }
    const personPlacementRect = getPersonPlacementRect(personLayerCanvas, personMaskAssets);
    if (personPlacementRect) {
      workingContext.drawImage(personLayerCanvas, personPlacementRect.x, personPlacementRect.y, personPlacementRect.width, personPlacementRect.height);
    }
  } else {
    workingContext.drawImage(resultImageBitmap, 0, 0);
    if (editorFaceBounds) {
      applyExposureToFace(workingCanvas, editorDraft.exposure, editorFaceBounds, editorFaceMaskData);
      applySmoothingToFace(workingContext, workingCanvas, editorDraft.smoothing, editorFaceBounds, editorFaceMaskCanvas);
      applyFilterPresetToFace(workingContext, workingCanvas, editorDraft.filterPreset, editorFaceBounds, editorFaceMaskCanvas);
    }
  }

  editorContext.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  editorContext.drawImage(workingCanvas, 0, 0);

  if (editorDraft.selectedLayer === "person") {
    drawSelectedPersonOutline(editorContext);
  }

  editorDraft.stickers.forEach((sticker) => {
    drawSticker(editorContext, sticker, sticker.id === editorDraft.selectedStickerId);
  });
}

function updateEditorControls() {
  if (!editorDraft) {
    return;
  }

  exposureRange.value = String(editorDraft.exposure);
  smoothingRange.value = String(editorDraft.smoothing);
  personSizeRange.disabled = !canMovePersonInEditor();
  personSizeRange.value = String(Math.round(clampPersonScale(editorDraft.personScale || 1) * 100));
  filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === editorDraft.filterPreset);
  });

  const selectedSticker = editorDraft.stickers.find((sticker) => sticker.id === editorDraft.selectedStickerId);
  stickerSizeRange.disabled = !selectedSticker;
  removeStickerButton.disabled = !selectedSticker;
  if (selectedSticker) {
    stickerSizeRange.value = String(selectedSticker.size);
  } else {
    stickerSizeRange.value = "220";
  }
}

async function openEditor() {
  if (!resultImageBlob) {
    return;
  }

  if (!resultImageBitmap) {
    resultImageBitmap = await createImageBitmap(resultImageBlob);
  }
  if (!editorBackgroundBitmap && currentGenerationPayload) {
    editorBackgroundBitmap = await loadEditorBackgroundBitmap(currentGenerationPayload);
  }
  if (!editorFaceBounds) {
    editorFaceBounds = await detectFaceBounds(resultImageBitmap);
  }

  editorDraft = editorDraft ? cloneEditorDraft(editorDraft) : createDefaultEditorDraft();
  updateEditorControls();
  renderEditorCanvas();
  editorModal.classList.remove("hidden");
  editorModal.setAttribute("aria-hidden", "false");
}

function closeEditor() {
  dragState = null;
  editorModal.classList.add("hidden");
  editorModal.setAttribute("aria-hidden", "true");
}

function resetEditorDraft() {
  editorDraft = createDefaultEditorDraft();
  updateEditorControls();
  renderEditorCanvas();
}

function addSticker(stickerType, stickerValue) {
  if (!resultImageBitmap || !editorDraft) {
    return;
  }

  const normalizedText = stickerType === "text" ? (stickerValue || "").trim() : stickerValue;
  if (stickerType === "text" && !normalizedText) {
    return;
  }

  const sticker = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: stickerType,
    text: stickerType === "emoji" || stickerType === "text" ? normalizedText : "",
    presetId: stickerType === "image" ? stickerValue : "",
    x: resultImageBitmap.width * 0.5,
    y: resultImageBitmap.height * 0.22,
    size: Number(stickerSizeRange.value) || 220,
  };

  if (sticker.type === "image") {
    getStickerAsset(sticker);
  }

  editorDraft.stickers.push(sticker);
  editorDraft.selectedLayer = null;
  editorDraft.selectedStickerId = sticker.id;
  updateEditorControls();
  renderEditorCanvas();
}

function getCanvasPointerPosition(event) {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function findStickerAtPosition(position) {
  if (!editorDraft) {
    return null;
  }

  return [...editorDraft.stickers]
    .reverse()
    .find((sticker) => {
      const dimensions = getStickerDimensions(sticker);
      const halfWidth = dimensions.width * 0.55;
      const halfHeight = dimensions.height * 0.55;
      return position.x >= sticker.x - halfWidth && position.x <= sticker.x + halfWidth && position.y >= sticker.y - halfHeight && position.y <= sticker.y + halfHeight;
    }) || null;
}

function handleCanvasPointerDown(event) {
  if (!editorDraft) {
    return;
  }

  const pointer = getCanvasPointerPosition(event);
  const sticker = findStickerAtPosition(pointer);
  if (sticker) {
    editorDraft.selectedLayer = null;
    editorDraft.selectedStickerId = sticker.id;
    dragState = {
      kind: "sticker",
      stickerId: sticker.id,
      offsetX: pointer.x - sticker.x,
      offsetY: pointer.y - sticker.y,
    };
    updateEditorControls();
    renderEditorCanvas();
    return;
  }

  if (canMovePersonInEditor() && isPointOnPerson(pointer)) {
    editorDraft.selectedLayer = "person";
    editorDraft.selectedStickerId = null;
    dragState = {
      kind: "person",
      startX: pointer.x,
      startY: pointer.y,
      originOffsetX: editorDraft.personOffsetX,
      originOffsetY: editorDraft.personOffsetY,
    };
    updateEditorControls();
    renderEditorCanvas();
    return;
  }

  editorDraft.selectedLayer = null;
  editorDraft.selectedStickerId = null;
  updateEditorControls();
  renderEditorCanvas();
}

function handleCanvasPointerMove(event) {
  if (!editorDraft || !dragState) {
    return;
  }

  const pointer = getCanvasPointerPosition(event);
  if (dragState.kind === "person") {
    editorDraft.personOffsetX = dragState.originOffsetX + (pointer.x - dragState.startX);
    editorDraft.personOffsetY = dragState.originOffsetY + (pointer.y - dragState.startY);
    renderEditorCanvas();
    return;
  }

  const sticker = editorDraft.stickers.find((item) => item.id === dragState.stickerId);
  if (!sticker) {
    return;
  }

  sticker.x = pointer.x - dragState.offsetX;
  sticker.y = pointer.y - dragState.offsetY;
  renderEditorCanvas();
}

function handleCanvasPointerUp() {
  dragState = null;
}

async function applyEditorChanges() {
  if (!editorDraft) {
    closeEditor();
    return;
  }

  const editedBlob = await new Promise((resolve, reject) => {
    editorCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("编辑结果导出失败"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });

  resultImageBlob = editedBlob;
  if (resultImageBitmap) {
    resultImageBitmap.close();
  }
  resultImageBitmap = await createImageBitmap(editedBlob);
  if (canMovePersonInEditor()) {
    const personMaskAssets = getPersonMaskAssets();
    const personLayerCanvas = buildPersonLayerCanvas(personMaskAssets);
    const personPlacementRect = getPersonPlacementRect(personLayerCanvas, personMaskAssets);
    if (personMaskAssets?.canvas && personPlacementRect) {
      const transformedMaskCanvas = document.createElement("canvas");
      transformedMaskCanvas.width = resultImageBitmap.width;
      transformedMaskCanvas.height = resultImageBitmap.height;
      const transformedMaskContext = transformedMaskCanvas.getContext("2d");
      transformedMaskContext.drawImage(
        personMaskAssets.canvas,
        personPlacementRect.x,
        personPlacementRect.y,
        personPlacementRect.width,
        personPlacementRect.height,
      );
      editorFaceMaskCanvas = transformedMaskCanvas;
      editorFaceMaskData = getCanvasImageData(transformedMaskCanvas);
    }
  }
  editorFaceBounds = editorFaceMaskData
    ? getMaskBounds(editorFaceMaskData)
    : editorFaceBounds
      ? clampFaceBounds(editorFaceBounds, resultImageBitmap.width, resultImageBitmap.height)
      : await detectFaceBounds(resultImageBitmap);
  editorDraft.personOffsetX = 0;
  editorDraft.personOffsetY = 0;
  editorDraft.personScale = 1;
  editorDraft.selectedLayer = null;

  revokeObjectUrl(currentResultUrl);
  revokeObjectUrl(currentDownloadUrl);
  currentResultUrl = URL.createObjectURL(editedBlob);
  currentDownloadUrl = URL.createObjectURL(editedBlob);

  resultImage.src = currentResultUrl;
  resultBackdrop.style.backgroundImage = `url(${currentResultUrl})`;
  downloadLink.href = currentDownloadUrl;
  downloadLink.download = "travel-checkin-result-edited.png";

  try {
    const publishPayload = await publishEditedResult(editedBlob);
    currentResultId = publishPayload.result_id || currentResultId;

    const editedShareUrl = publishPayload.share_url;
    if (editedShareUrl) {
      shareLink.href = editedShareUrl;
      shareLink.classList.remove("hidden");
      qrImage.src = `/api/qr?content=${encodeURIComponent(editedShareUrl)}&v=${encodeURIComponent(editedShareUrl)}`;
      qrShell.classList.remove("hidden");
    }
  } catch (error) {
    generationWarning.textContent = `贴纸已保存到当前页面，但二维码更新失败：${error.message || "请稍后重试"}`;
    generationWarning.classList.remove("hidden");
  }

  closeEditor();
}

async function publishEditedResult(editedBlob) {
  const formData = new FormData();
  const editedFile = new File([editedBlob], `travel-checkin-result-edited-${Date.now()}.png`, { type: "image/png" });
  formData.append("edited_image", editedFile);

  const response = await fetch("/api/results/publish-edited", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let detail = "编辑图发布失败";
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      detail = `编辑图发布失败，状态码 ${response.status}`;
    }
    throw new Error(detail);
  }

  return response.json();
}

async function convertBlobToPng(blob) {
  if (blob.type === "image/png") {
    return blob;
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((convertedBlob) => {
      if (!convertedBlob) {
        reject(new Error("结果格式转换失败"));
        return;
      }

      resolve(convertedBlob);
    }, "image/png");
  });
}

function buildFormData(payload) {
  const formData = new FormData();
  formData.append("person_image", payload.sourceFile);

  if (payload.backgroundFile) {
    formData.append("background_image", payload.backgroundFile);
  } else if (payload.backgroundTemplateName) {
    formData.append("background_template_name", payload.backgroundTemplateName);
  }
  if (payload.compositionPayload) {
    formData.append("composition_payload", JSON.stringify(payload.compositionPayload));
  }
  return { endpoint: "/api/swap", formData };
}

async function renderResult(blob, response, payload) {
  revokeObjectUrl(currentResultUrl);
  revokeObjectUrl(currentDownloadUrl);

  const pngBlob = await convertBlobToPng(blob);
  resultImageBlob = pngBlob;
  if (resultImageBitmap) {
    resultImageBitmap.close();
    resultImageBitmap = null;
  }
  currentGenerationPayload = payload;
  if (editorBackgroundBitmap) {
    editorBackgroundBitmap.close();
    editorBackgroundBitmap = null;
  }
  if (editorPersonLayerBitmap) {
    editorPersonLayerBitmap.close();
    editorPersonLayerBitmap = null;
  }
  editorFaceBounds = parseFaceBoundsHeader(response.headers.get("X-Editor-Face-Bounds"));
  editorFaceMaskCanvas = null;
  editorFaceMaskData = null;
  editorPersonLocalMaskCanvas = null;
  editorPersonLocalMaskData = null;
  const loadedFaceMask = await loadFaceMaskAssets(response.headers.get("X-Editor-Face-Mask-Url"));
  editorFaceMaskCanvas = loadedFaceMask.canvas;
  editorFaceMaskData = loadedFaceMask.imageData;
  const loadedPersonLocalMask = await loadMaskCanvasFromUrl(response.headers.get("X-Editor-Person-Local-Mask-Url"));
  editorPersonLocalMaskCanvas = loadedPersonLocalMask.canvas;
  editorPersonLocalMaskData = loadedPersonLocalMask.imageData;
  editorPersonLayerBitmap = await loadBitmapFromUrl(response.headers.get("X-Editor-Person-Layer-Url"));
  if (!editorFaceBounds && editorFaceMaskData) {
    editorFaceBounds = getMaskBounds(editorFaceMaskData);
  }
  editorDraft = createDefaultEditorDraft();

  currentResultUrl = URL.createObjectURL(pngBlob);
  currentDownloadUrl = URL.createObjectURL(pngBlob);

  resultImage.src = currentResultUrl;
  resultBackdrop.style.backgroundImage = `url(${currentResultUrl})`;
  currentResultId = response.headers.get("X-Result-Id") || null;
  promptId.textContent = `生成编号：${response.headers.get("X-Comfy-Prompt-Id") || "未返回 prompt_id"}`;

  const resultWarning = response.headers.get("X-Generation-Warning");
  if (resultWarning) {
    generationWarning.textContent = resultWarning;
    generationWarning.classList.remove("hidden");
  } else {
    generationWarning.textContent = "";
    generationWarning.classList.add("hidden");
  }

  downloadLink.href = currentDownloadUrl;
  downloadLink.download = "travel-checkin-result.png";
  downloadLink.classList.toggle("hidden", Boolean(resultWarning));

  const resultShareUrl = response.headers.get("X-Result-Share-Url");
  if (resultShareUrl && !resultWarning) {
    shareLink.href = resultShareUrl;
    shareLink.classList.remove("hidden");
    qrImage.src = `/api/qr?content=${encodeURIComponent(resultShareUrl)}&v=${encodeURIComponent(resultShareUrl)}`;
    qrShell.classList.remove("hidden");
  } else {
    shareLink.classList.add("hidden");
    qrShell.classList.add("hidden");
  }

  openEditorButton.classList.toggle("hidden", Boolean(resultWarning));

  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");
  resultState.classList.remove("hidden");
}

async function runGeneration() {
  try {
    const storedState = readPendingGenerationState();
    let payload = null;

    if (storedState) {
      payload = await buildPayloadFromStoredState(storedState);
    } else {
      const bridge = window.opener?.__AI_BACKGROUND_GENERATION_BRIDGE__;
      if (!bridge?.prepareRequest) {
        showError("请从主页面点击“开始打卡”进入当前页面。");
        return;
      }
      payload = await bridge.prepareRequest();
    }

    if (payload?.precomposedResultFile) {
      await renderResult(payload.precomposedResultFile, buildCachedResponse(payload.precomposedResultMeta), payload);
      return;
    }

    const requestPayload = buildFormData(payload);
    const response = await fetch(requestPayload.endpoint, {
      method: "POST",
      body: requestPayload.formData,
    });

    if (!response.ok) {
      let detail = "请求失败";
      try {
        const responsePayload = await response.json();
        detail = responsePayload.detail || detail;
      } catch {
        detail = `请求失败，状态码 ${response.status}`;
      }
      throw new Error(detail);
    }

    const resultBlob = await response.blob();
    await renderResult(resultBlob, response, payload);
  } catch (error) {
    showError(error.message || "生成失败，请返回上一步重试。");
  }
}

backButton.addEventListener("click", goBack);
errorBackButton.addEventListener("click", goBack);
openEditorButton.addEventListener("click", () => {
  openEditor().catch((error) => {
    showError(error.message || "图像编辑器初始化失败，请重新生成后重试。");
  });
});
closeEditorButton.addEventListener("click", closeEditor);
cancelEditorButton.addEventListener("click", closeEditor);
resetEditorButton.addEventListener("click", resetEditorDraft);
removeStickerButton.addEventListener("click", () => {
  if (!editorDraft?.selectedStickerId) {
    return;
  }

  editorDraft.stickers = editorDraft.stickers.filter((sticker) => sticker.id !== editorDraft.selectedStickerId);
  editorDraft.selectedStickerId = null;
  updateEditorControls();
  renderEditorCanvas();
});
applyEditorButton.addEventListener("click", () => {
  applyEditorChanges().catch((error) => {
    showError(error.message || "应用编辑失败，请重试。");
  });
});
exposureRange.addEventListener("input", () => {
  if (!editorDraft) {
    return;
  }
  editorDraft.exposure = Number(exposureRange.value);
  renderEditorCanvas();
});
smoothingRange.addEventListener("input", () => {
  if (!editorDraft) {
    return;
  }
  editorDraft.smoothing = Number(smoothingRange.value);
  renderEditorCanvas();
});
personSizeRange.addEventListener("input", () => {
  if (!editorDraft) {
    return;
  }
  editorDraft.personScale = clampPersonScale(Number(personSizeRange.value) / 100);
  renderEditorCanvas();
});
filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!editorDraft) {
      return;
    }
    editorDraft.filterPreset = button.dataset.filter || "original";
    updateEditorControls();
    renderEditorCanvas();
  });
});
stickerSizeRange.addEventListener("input", () => {
  if (!editorDraft?.selectedStickerId) {
    return;
  }
  const sticker = editorDraft.stickers.find((item) => item.id === editorDraft.selectedStickerId);
  if (!sticker) {
    return;
  }
  sticker.size = Number(stickerSizeRange.value);
  renderEditorCanvas();
});
stickerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    addSticker(button.dataset.stickerType || "emoji", button.dataset.stickerValue || "✨");
  });
});
addTextStickerButton?.addEventListener("click", () => {
  addSticker("text", textStickerInput?.value || "");
  if (textStickerInput) {
    textStickerInput.value = "";
  }
});
textStickerInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  addSticker("text", textStickerInput.value || "");
  textStickerInput.value = "";
});
editorCanvas.addEventListener("pointerdown", handleCanvasPointerDown);
editorCanvas.addEventListener("pointermove", handleCanvasPointerMove);
editorCanvas.addEventListener("pointerup", handleCanvasPointerUp);
editorCanvas.addEventListener("pointerleave", handleCanvasPointerUp);
window.addEventListener("beforeunload", () => {
  if (resultImageBitmap) {
    resultImageBitmap.close();
  }
  revokeObjectUrl(currentResultUrl);
  revokeObjectUrl(currentDownloadUrl);
});

if (!maybeRedirectPrivateHostToLoopback()) {
  runGeneration();
}
