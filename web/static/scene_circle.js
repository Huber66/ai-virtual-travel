const themeItems = [
  { id: "custom", key: "custom", titleCn: "\u81ea\u5b9a\u4e49", titleEn: "Custom", label: "\u81ea\u5b9a\u4e49", subtitle: "Custom", image: "/template-thumbs/%E8%87%AA%E5%AE%9A%E4%B9%89%E5%9B%BE%E6%A0%87.webp", position: { x: 50, y: 57 }, size: "hub", active: true, keywords: [] },
  { id: "beijing", key: "beijing", titleCn: "\u5317\u4eac", titleEn: "Beijing", label: "\u5317\u4eac", subtitle: "Beijing", image: "/template-thumbs/%E6%95%85%E5%AE%AB.webp", position: { x: 50, y: 25 }, size: "hero", active: false, keywords: ["\u6545\u5bab", "\u5929\u5b89\u95e8", "\u9890\u548c\u56ed", "\u516b\u8fbe\u5cad", "\u957f\u57ce", "\u6c34\u7acb\u65b9", "\u9e1f\u5de2", "\u5929\u575b", "\u5706\u660e\u56ed"] },
  { id: "xian", key: "xian", titleCn: "\u897f\u5b89", titleEn: "Xi'an", label: "\u897f\u5b89", subtitle: "Xi'an", image: "/template-thumbs/%E8%A5%BF%E5%AE%89%E5%85%B5%E9%A9%AC%E4%BF%91.webp", position: { x: 72, y: 37 }, size: "large", active: false, keywords: ["\u5175\u9a6c\u4fd1", "\u897f\u5b89", "\u5927\u96c1\u5854", "\u5927\u96c1\u697c", "\u949f\u697c", "\u57ce\u5899"] },
  { id: "henan", key: "henan", titleCn: "\u6cb3\u5357", titleEn: "Henan", label: "\u6cb3\u5357", subtitle: "Henan", image: "/template-thumbs/%E5%B0%91%E6%9E%97%E5%AF%BA.webp", position: { x: 72, y: 66 }, size: "large", active: false, keywords: ["\u5c11\u6797\u5bfa", "\u9f99\u95e8\u77f3\u7a9f", "\u6cb3\u5357", "\u6d1b\u9633", "\u5f00\u5c01"] },
  { id: "japan", key: "japan", titleCn: "\u65e5\u672c", titleEn: "Japan", label: "\u65e5\u672c", subtitle: "Japan", image: "/template-thumbs/%E6%97%A5%E6%9C%AC%E5%AF%8C%E5%A3%AB%E5%B1%B1.webp", position: { x: 50, y: 79 }, size: "large", active: false, keywords: ["\u5bcc\u58eb\u5c71", "\u65e5\u672c", "\u4e1c\u4eac", "\u6d45\u8349\u5bfa", "\u4eac\u90fd", "\u5927\u962a", "\u5948\u826f", "\u6a31"] },
  { id: "world", key: "world", titleCn: "\u4e16\u754c\u540d\u80dc", titleEn: "World", label: "\u4e16\u754c\u540d\u80dc", subtitle: "World", image: "/template-thumbs/%E5%9F%83%E8%8F%B2%E5%B0%94%E9%93%81%E5%A1%94.webp", position: { x: 28, y: 66 }, size: "large", active: false, keywords: ["\u57c3\u83f2\u5c14", "\u6bd4\u8428", "\u6597\u517d\u573a", "\u7f57\u9a6c", "\u91d1\u5b57\u5854", "\u57c3\u53ca", "\u5df4\u9ece", "\u4f26\u6566", "\u7ebd\u7ea6", "\u5a01\u5c3c\u65af", "\u96c5\u5178", "\u5723\u6258\u91cc\u5c3c", "\u8fea\u62dc", "\u83ab\u65af\u79d1", "\u610f\u5927\u5229", "\u6cd5\u56fd"] },
  { id: "virtual", key: "virtual", titleCn: "\u865a\u62df\u80cc\u666f", titleEn: "Virtual", label: "\u865a\u62df\u80cc\u666f", subtitle: "Virtual", image: "/template-thumbs/%E5%8A%A8%E6%BC%AB%E8%83%8C%E6%99%AF1.webp", position: { x: 28, y: 37 }, size: "large", active: false, keywords: ["\u52a8\u6f2b", "\u5361\u901a", "\u8d5b\u535a", "\u865a\u62df", "\u4e8c\u6b21\u5143", "\u63d2\u753b", "\u68a6\u5e7b", "\u672a\u6765", "\u50cf\u7d20", "\u7ae5\u8bdd"] },
];

const SCENES = themeItems;

const ORDER_HINTS = {
  beijing: ["\u6545\u5bab", "\u5929\u5b89\u95e8", "\u9890\u548c\u56ed", "\u516b\u8fbe\u5cad", "\u957f\u57ce", "\u6c34\u7acb\u65b9", "\u9e1f\u5de2", "\u5929\u575b", "\u5706\u660e\u56ed"],
  xian: ["\u5175\u9a6c\u4fd1", "\u5927\u96c1\u697c", "\u5927\u96c1\u5854", "\u949f\u697c", "\u57ce\u5899"],
  henan: ["\u5c11\u6797\u5bfa", "\u9f99\u95e8\u77f3\u7a9f", "\u6d1b\u9633", "\u5f00\u5c01"],
  japan: ["\u5bcc\u58eb\u5c71", "\u4e1c\u4eac", "\u6d45\u8349\u5bfa", "\u4eac\u90fd", "\u5927\u962a", "\u5948\u826f"],
  world: ["\u57c3\u83f2\u5c14", "\u6bd4\u8428", "\u6597\u517d\u573a", "\u7f57\u9a6c", "\u91d1\u5b57\u5854", "\u57c3\u53ca", "\u5df4\u9ece", "\u4f26\u6566", "\u5a01\u5c3c\u65af", "\u96c5\u5178", "\u5723\u6258\u91cc\u5c3c"],
  virtual: ["\u52a8\u6f2b", "\u5361\u901a", "\u8d5b\u535a", "\u865a\u62df", "\u68a6\u5e7b"],
};

const moduleView = document.getElementById("module-view");
const backgroundView = document.getElementById("background-view");
const moduleOrbit = document.getElementById("module-orbit");
const backgroundOrbit = document.getElementById("background-orbit");
const titleMain = document.getElementById("scene-title-main");
const titleSub = document.getElementById("scene-title-sub");
const backThemeButton = document.getElementById("back-theme-button");
const prevBackgroundButton = document.getElementById("prev-background-button");
const nextBackgroundButton = document.getElementById("next-background-button");
const startShootingButton = document.getElementById("start-shooting-button");

let templates = [];
let activeScene = null;
let selectedModuleScene = SCENES.find((scene) => scene.key === "custom") || SCENES[0];
let sceneBackgrounds = [];
let activeBackgroundIndex = 0;
let templatesReadyPromise = null;

function isCustomTemplate(template) {
  return /(?:\u81ea\u5b9a\u4e49|custom)/i.test(`${template.label || ""} ${template.name || ""}`);
}

function isTemplateInScene(template, scene) {
  if (scene.key === "custom") {
    return isCustomTemplate(template);
  }
  return scene.keywords.some((keyword) => (template.label || "").includes(keyword));
}

function getTemplateRank(template, scene) {
  const hints = ORDER_HINTS[scene.key] || [];
  const index = hints.findIndex((hint) => (template.label || "").includes(hint));
  return index >= 0 ? index : 999;
}

function sortedTemplatesForScene(scene) {
  return templates
    .filter((template) => isTemplateInScene(template, scene))
    .sort((left, right) => {
      const rank = getTemplateRank(left, scene) - getTemplateRank(right, scene);
      return rank || (left.label || "").localeCompare(right.label || "", "zh-CN");
    });
}

async function ensureTemplatesReady() {
  if (!templatesReadyPromise) {
    templatesReadyPromise = loadTemplates();
  }
  await templatesReadyPromise;
}

function refreshScenePreviewImages() {
  SCENES.forEach((scene) => {
    const previewTemplate = sortedTemplatesForScene(scene)[0];
    if (previewTemplate?.thumbnail_url || previewTemplate?.url) {
      scene.image = previewTemplate.thumbnail_url || previewTemplate.url;
    }
  });
}

function setTitle(scene, template) {
  if (template && scene) {
    titleMain.textContent = scene.label;
    titleSub.textContent = template.label || scene.subtitle;
    return;
  }
  titleMain.textContent = scene?.label || "\u9009\u62e9\u62cd\u6444\u4e3b\u9898";
  titleSub.textContent = scene?.subtitle || "Choose Theme";
}

function syncCenterCopy(scene) {
  const centerTitle = document.getElementById("center-active-title");
  const centerSubtitle = document.getElementById("center-active-subtitle");
  if (!centerTitle || !centerSubtitle || !scene) return;
  centerTitle.textContent = scene.label;
  centerSubtitle.textContent = scene.subtitle;
}

function selectModuleScene(scene, shouldUpdateTitle = true) {
  selectedModuleScene = scene;
  document.querySelectorAll(".module-item").forEach((item) => {
    const isActive = item.dataset.scene === scene.key;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-pressed", String(isActive));
  });
  syncCenterCopy(scene);
  if (shouldUpdateTitle) setTitle(scene);
}

function buildModuleItem(scene, isCenter = false, index = 0) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `module-item module-item-${scene.size || "large"}${isCenter ? " module-item-center" : ""}`;
  button.style.left = `${scene.position.x}%`;
  button.style.top = `${scene.position.y}%`;
  button.style.setProperty("--enter-index", String(index));
  button.dataset.scene = scene.key;
  button.setAttribute("aria-label", scene.label);
  button.setAttribute("aria-pressed", String(scene.active));
  button.innerHTML = isCenter
    ? `
      <span class="module-hub" aria-hidden="true">
        <span class="module-hub-lens"></span>
        <span class="module-hub-copy">
          <strong id="center-active-title">${selectedModuleScene.label}</strong>
          <small id="center-active-subtitle">${selectedModuleScene.subtitle}</small>
        </span>
      </span>
    `
    : `
      <span class="module-thumb">
        <img src="${scene.image}" alt="" />
      </span>
      <span class="module-label">
        <strong>${scene.label}</strong>
        <small>${scene.subtitle}</small>
      </span>
    `;
  button.addEventListener("mouseenter", () => setTitle(scene));
  button.addEventListener("mouseleave", () => {
    if (!backgroundView.classList.contains("hidden")) return;
    setTitle(selectedModuleScene?.key === "custom" ? null : selectedModuleScene);
  });
  button.addEventListener("click", () => {
    selectModuleScene(scene, false);
    enterBackgroundSelection(scene);
  });
  return button;
}

function renderModules() {
  moduleOrbit.innerHTML = "";
  const centerScene = SCENES.find((scene) => scene.key === "custom") || SCENES[0];
  const ringScenes = SCENES.filter((scene) => scene.key !== "custom");
  ringScenes.forEach((scene, index) => {
    moduleOrbit.appendChild(buildModuleItem(scene, false, index + 1));
  });
  moduleOrbit.appendChild(buildModuleItem(centerScene, true, 0));
  selectModuleScene(selectedModuleScene || centerScene, false);
  setTitle(selectedModuleScene?.key === "custom" ? null : selectedModuleScene);
}

function renderBackgrounds() {
  backgroundOrbit.innerHTML = "";
  if (!sceneBackgrounds.length) {
    startShootingButton.disabled = true;
    return;
  }
  const positions = [
    { offset: 0, x: 50, y: 36, cls: "is-selected" },
    { offset: -1, x: 37, y: 56, cls: "is-near is-left-near" },
    { offset: 1, x: 63, y: 56, cls: "is-near is-right-near" },
    { offset: -2, x: 28, y: 50, cls: "is-far is-left-far" },
    { offset: 2, x: 72, y: 50, cls: "is-far is-right-far" },
    { offset: -3, x: 43, y: 76, cls: "is-bottom is-bottom-left" },
    { offset: 3, x: 57, y: 76, cls: "is-bottom is-bottom-right" },
  ];
  positions.forEach((position) => {
    const index = (activeBackgroundIndex + position.offset + sceneBackgrounds.length) % sceneBackgrounds.length;
    const template = sceneBackgrounds[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `background-item ${position.cls}`.trim();
    button.style.left = `${position.x}%`;
    button.style.top = `${position.y}%`;
    button.style.setProperty("--slot", String(Math.abs(position.offset)));
    button.dataset.index = String(index);
    button.innerHTML = `<img src="${template.thumbnail_url || template.url}" alt="${template.label}" />`;
    button.addEventListener("click", () => {
      activeBackgroundIndex = index;
      renderBackgrounds();
    });
    backgroundOrbit.appendChild(button);
  });
  const activeTemplate = sceneBackgrounds[activeBackgroundIndex];
  setTitle(activeScene, activeTemplate);
  startShootingButton.disabled = false;
}

async function enterBackgroundSelection(scene) {
  activeScene = scene;
  sceneBackgrounds = [];
  activeBackgroundIndex = 0;
  backgroundOrbit.innerHTML = "";
  startShootingButton.disabled = true;
  moduleView.classList.add("hidden");
  backgroundView.classList.remove("hidden");

  await ensureTemplatesReady();
  if (activeScene?.key !== scene.key) {
    return;
  }

  sceneBackgrounds = sortedTemplatesForScene(scene);
  activeBackgroundIndex = 0;
  if (!sceneBackgrounds.length && scene.key === "custom") {
    window.location.assign(`/studio?scene=custom&v=${Date.now()}`);
    return;
  }
  renderBackgrounds();
}

function returnToModules() {
  activeScene = null;
  sceneBackgrounds = [];
  activeBackgroundIndex = 0;
  backgroundView.classList.add("hidden");
  moduleView.classList.remove("hidden");
  renderModules();
}

function shiftBackground(delta) {
  if (!sceneBackgrounds.length) return;
  activeBackgroundIndex = (activeBackgroundIndex + delta + sceneBackgrounds.length) % sceneBackgrounds.length;
  renderBackgrounds();
}

function startShooting() {
  if (!activeScene) return;
  const template = sceneBackgrounds[activeBackgroundIndex];
  const params = new URLSearchParams({ scene: activeScene.key, v: String(Date.now()) });
  if (template?.name) params.set("template", template.name);
  window.location.assign(`/studio?${params.toString()}`);
}

async function loadTemplates() {
  try {
    const response = await fetch("/api/templates", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    templates = payload.templates || [];
    refreshScenePreviewImages();
  } catch {
    templates = [];
  }
}

backThemeButton.addEventListener("click", returnToModules);
prevBackgroundButton.addEventListener("click", () => shiftBackground(-1));
nextBackgroundButton.addEventListener("click", () => shiftBackground(1));
startShootingButton.addEventListener("click", startShooting);
templatesReadyPromise = loadTemplates();
templatesReadyPromise.then(renderModules);
