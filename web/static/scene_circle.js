const SCENES = [
  { key: "custom", label: "\u81ea\u5b9a\u4e49", subtitle: "Custom", image: "/template-thumbs/%E8%87%AA%E5%AE%9A%E4%B9%89%E5%9B%BE%E6%A0%87.webp", keywords: [] },
  { key: "beijing", label: "\u5317\u4eac", subtitle: "Beijing", image: "/template-thumbs/%E6%95%85%E5%AE%AB.webp", keywords: ["\u6545\u5bab", "\u5929\u5b89\u95e8", "\u9890\u548c\u56ed", "\u516b\u8fbe\u5cad", "\u957f\u57ce", "\u6c34\u7acb\u65b9", "\u9e1f\u5de2", "\u5929\u575b", "\u5706\u660e\u56ed"] },
  { key: "xian", label: "\u897f\u5b89", subtitle: "Xi'an", image: "/template-thumbs/%E8%A5%BF%E5%AE%89%E5%85%B5%E9%A9%AC%E4%BF%91.webp", keywords: ["\u5175\u9a6c\u4fd1", "\u897f\u5b89", "\u5927\u96c1\u5854", "\u5927\u96c1\u697c", "\u949f\u697c", "\u57ce\u5899"] },
  { key: "henan", label: "\u6cb3\u5357", subtitle: "Henan", image: "/template-thumbs/%E5%B0%91%E6%9E%97%E5%AF%BA.webp", keywords: ["\u5c11\u6797\u5bfa", "\u9f99\u95e8\u77f3\u7a9f", "\u6cb3\u5357", "\u6d1b\u9633", "\u5f00\u5c01"] },
  { key: "japan", label: "\u65e5\u672c", subtitle: "Japan", image: "/template-thumbs/%E6%97%A5%E6%9C%AC%E5%AF%8C%E5%A3%AB%E5%B1%B1.webp", keywords: ["\u5bcc\u58eb\u5c71", "\u65e5\u672c", "\u4e1c\u4eac", "\u6d45\u8349\u5bfa", "\u4eac\u90fd", "\u5927\u962a", "\u5948\u826f", "\u6a31"] },
  { key: "world", label: "\u4e16\u754c\u540d\u80dc", subtitle: "World", image: "/template-thumbs/%E5%9F%83%E8%8F%B2%E5%B0%94%E9%93%81%E5%A1%94.webp", keywords: ["\u57c3\u83f2\u5c14", "\u6bd4\u8428", "\u6597\u517d\u573a", "\u7f57\u9a6c", "\u91d1\u5b57\u5854", "\u57c3\u53ca", "\u5df4\u9ece", "\u4f26\u6566", "\u7ebd\u7ea6", "\u5a01\u5c3c\u65af", "\u96c5\u5178", "\u5723\u6258\u91cc\u5c3c", "\u8fea\u62dc", "\u83ab\u65af\u79d1", "\u610f\u5927\u5229", "\u6cd5\u56fd"] },
  { key: "virtual", label: "\u865a\u62df\u80cc\u666f", subtitle: "Virtual", image: "/template-thumbs/%E5%8A%A8%E6%BC%AB%E8%83%8C%E6%99%AF1.webp", keywords: ["\u52a8\u6f2b", "\u5361\u901a", "\u8d5b\u535a", "\u865a\u62df", "\u4e8c\u6b21\u5143", "\u63d2\u753b", "\u68a6\u5e7b", "\u672a\u6765", "\u50cf\u7d20", "\u7ae5\u8bdd"] },
];

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
const banner = document.getElementById("scene-banner");
const backThemeButton = document.getElementById("back-theme-button");
const prevBackgroundButton = document.getElementById("prev-background-button");
const nextBackgroundButton = document.getElementById("next-background-button");
const startShootingButton = document.getElementById("start-shooting-button");

let templates = [];
let activeScene = null;
let sceneBackgrounds = [];
let activeBackgroundIndex = 0;

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

function setTitle(scene, template) {
  if (template && scene) {
    titleMain.textContent = scene.label;
    titleSub.textContent = template.label || scene.subtitle;
    return;
  }
  titleMain.textContent = scene?.label || "\u9009\u62e9\u62cd\u6444\u4e3b\u9898";
  titleSub.textContent = scene?.subtitle || "Choose Theme";
}

function buildModuleItem(scene, x, y, isCenter = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `module-item${isCenter ? " module-item-center" : ""}`;
  button.style.left = `${x}%`;
  button.style.top = `${y}%`;
  button.dataset.scene = scene.key;
  button.setAttribute("aria-label", scene.label);
  button.innerHTML = isCenter
    ? `
      <span class="module-hub" aria-hidden="true">
        <span class="module-hub-lens"></span>
        <span class="module-hub-copy">
          <strong>${scene.label}</strong>
          <small>${scene.subtitle}</small>
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
  button.addEventListener("mouseenter", () => {
    document.querySelectorAll(".module-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    setTitle(scene);
  });
  button.addEventListener("mouseleave", () => {
    button.classList.remove("active");
    if (!backgroundView.classList.contains("hidden")) return;
    if (!document.querySelector(".module-item:hover")) setTitle(null);
  });
  button.addEventListener("click", () => enterBackgroundSelection(scene));
  return button;
}

function renderModules() {
  moduleOrbit.innerHTML = "";
  const ringScenes = SCENES.filter((scene) => scene.key !== "custom");
  const centerScene = SCENES.find((scene) => scene.key === "custom") || SCENES[0];
  const centerX = 50;
  const centerY = 57;
  const radiusX = 28;
  const radiusY = 29;
  const offset = -Math.PI / 2;
  ringScenes.forEach((scene, index) => {
    const angle = offset + (Math.PI * 2 * index) / ringScenes.length;
    moduleOrbit.appendChild(buildModuleItem(scene, centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY));
  });
  moduleOrbit.appendChild(buildModuleItem(centerScene, centerX, centerY, true));
  setTitle(null);
  banner.classList.add("hidden");
  banner.textContent = "";
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

function enterBackgroundSelection(scene) {
  activeScene = scene;
  sceneBackgrounds = sortedTemplatesForScene(scene);
  activeBackgroundIndex = 0;
  moduleView.classList.add("hidden");
  backgroundView.classList.remove("hidden");
  banner.classList.add("hidden");
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
    const custom = SCENES.find((scene) => scene.key === "custom");
    const customTemplate = templates.find(isCustomTemplate);
    if (custom && customTemplate) custom.image = customTemplate.thumbnail_url || customTemplate.url || custom.image;
  } catch {
    templates = [];
  }
}

backThemeButton.addEventListener("click", returnToModules);
prevBackgroundButton.addEventListener("click", () => shiftBackground(-1));
nextBackgroundButton.addEventListener("click", () => shiftBackground(1));
startShootingButton.addEventListener("click", startShooting);
loadTemplates().then(renderModules);
