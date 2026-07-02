import asyncio
import copy
import json
import time
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageFilter, ImageOps

from app.config import settings


class ComfyClient:
    FINAL_OUTPUT_NODE_ID = "11"
    PERSON_MASK_OUTPUT_NODE_ID = "31"
    CAMERA_PERSON_FULL_MASK_NODE_ID = "11"
    MASK_THRESHOLD = 24
    EDITOR_MASK_SAVE_TITLE = "保存编辑人物 mask"
    LEGACY_PERSON_MASK_SAVE_TITLE = "保存人物 mask"
    SMART_FUSION_COMPOSITE_TYPE = "SmartFusion: Auto Composite"

    def __init__(self) -> None:
        self.base_url = settings.comfy_base_url.rstrip("/")
        self.prompt_template_path = settings.prompt_template_path
        self.request_timeout = settings.request_timeout_seconds
        self.generation_timeout = settings.generation_timeout_seconds
        self.poll_interval = settings.poll_interval_seconds
        self.prompt_template_cache: dict[Path, tuple[int, dict[str, Any]]] = {}
        self.node_input_order_cache: dict[str, list[str]] = {}

    def _create_client(self, timeout: httpx.Timeout | float) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, trust_env=False)

    async def healthcheck(self) -> dict[str, Any]:
        async with self._create_client(self.request_timeout) as client:
            response = await client.get(f"{self.base_url}/system_stats")
            response.raise_for_status()
            return response.json()

    async def upload_image(self, client: httpx.AsyncClient, file: UploadFile, prefix: str) -> str:
        suffix = Path(file.filename or "upload.jpg").suffix or ".jpg"
        filename = f"{prefix}_{uuid.uuid4().hex}{suffix.lower()}"
        content = await file.read()

        return await self.upload_bytes(client, content, filename, file.content_type or "application/octet-stream")

    async def upload_bytes(
        self,
        client: httpx.AsyncClient,
        content: bytes,
        filename: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        suffix = Path(filename).suffix or ".jpg"
        stored_filename = f"{Path(filename).stem}_{uuid.uuid4().hex}{suffix.lower()}"

        files = {
            "image": (stored_filename, content, content_type),
        }
        data = {
            "overwrite": "true",
            "type": "input",
        }

        response = await client.post(f"{self.base_url}/upload/image", files=files, data=data)
        response.raise_for_status()
        return stored_filename

    async def upload_local_image(self, client: httpx.AsyncClient, file_path: Path, prefix: str) -> str:
        return await self.upload_bytes(client, file_path.read_bytes(), f"{prefix}_{file_path.name}")

    def _get_node_input_order(self, class_type: str) -> list[str]:
        cached_order = self.node_input_order_cache.get(class_type)
        if cached_order is not None:
            return cached_order

        try:
            class_type_path = quote(class_type, safe="")
            with httpx.Client(timeout=self.request_timeout, trust_env=False) as client:
                response = client.get(f"{self.base_url}/object_info/{class_type_path}")
                response.raise_for_status()
                payload = response.json()
        except Exception:
            self.node_input_order_cache[class_type] = []
            return []

        node_info = payload.get(class_type)
        if not isinstance(node_info, dict) and payload:
            node_info = next(iter(payload.values()))

        if not isinstance(node_info, dict):
            self.node_input_order_cache[class_type] = []
            return []

        input_order = node_info.get("input_order", {})
        ordered_inputs = list(input_order.get("required", [])) + list(input_order.get("optional", []))

        if not ordered_inputs:
            node_inputs = node_info.get("input", {})
            ordered_inputs = list(node_inputs.get("required", {}).keys()) + list(node_inputs.get("optional", {}).keys())

        self.node_input_order_cache[class_type] = ordered_inputs
        return ordered_inputs

    def _convert_workflow_to_prompt(self, workflow_payload: dict[str, Any]) -> dict[str, Any]:
        links = workflow_payload.get("links", [])
        nodes = workflow_payload.get("nodes", [])

        link_source_map: dict[int, tuple[str, int]] = {}
        for link in links:
            if not isinstance(link, list) or len(link) < 3:
                continue
            try:
                link_id = int(link[0])
                source_node_id = str(link[1])
                source_output_index = int(link[2])
            except (TypeError, ValueError):
                continue
            link_source_map[link_id] = (source_node_id, source_output_index)

        converted_prompt: dict[str, Any] = {}
        for node in nodes:
            if not isinstance(node, dict):
                continue

            class_type = node.get("type")
            node_id = node.get("id")
            if not class_type or node_id is None:
                continue

            if class_type == "MarkdownNote":
                continue

            node_inputs: dict[str, Any] = {}
            widget_values = node.get("widgets_values", [])
            linked_input_names: set[str] = set()

            for input_spec in node.get("inputs", []):
                if not isinstance(input_spec, dict):
                    continue

                input_name = input_spec.get("name")
                if not input_name:
                    continue

                link_id = input_spec.get("link")
                if link_id is not None:
                    linked_input_names.add(input_name)
                    try:
                        resolved_link_id = int(link_id)
                    except (TypeError, ValueError):
                        resolved_link_id = None
                    source_ref = link_source_map.get(resolved_link_id) if resolved_link_id is not None else None
                    if source_ref:
                        node_inputs[input_name] = [source_ref[0], source_ref[1]]

            if widget_values:
                ordered_inputs = self._get_node_input_order(class_type)
                if ordered_inputs:
                    widget_input_names = [name for name in ordered_inputs if name not in linked_input_names and name not in node_inputs]
                    for index, value in enumerate(widget_values):
                        if index >= len(widget_input_names):
                            break
                        node_inputs[widget_input_names[index]] = value
                else:
                    widget_index = 0
                    for input_spec in node.get("inputs", []):
                        if not isinstance(input_spec, dict):
                            continue
                        input_name = input_spec.get("name")
                        if not input_name or input_name in node_inputs:
                            continue
                        if input_spec.get("widget") is not None:
                            if widget_index < len(widget_values):
                                node_inputs[input_name] = widget_values[widget_index]
                            widget_index += 1

            converted_prompt[str(node_id)] = {
                "inputs": node_inputs,
                "class_type": class_type,
            }
            if node.get("title"):
                converted_prompt[str(node_id)]["_meta"] = {"title": node["title"]}

        return converted_prompt

    @staticmethod
    def _find_prompt_node_id(
        prompt: dict[str, Any],
        *,
        title: str | None = None,
        class_type: str | None = None,
    ) -> str | None:
        for node_id, node_payload in prompt.items():
            if not isinstance(node_payload, dict):
                continue
            if class_type and node_payload.get("class_type") != class_type:
                continue
            node_title = ((node_payload.get("_meta") or {}).get("title") or "").strip()
            if title and node_title != title:
                continue
            return node_id
        return None

    @staticmethod
    def _find_workflow_node(
        workflow_payload: dict[str, Any],
        *,
        title: str | None = None,
        node_type: str | None = None,
    ) -> dict[str, Any] | None:
        for node in workflow_payload.get("nodes", []):
            if not isinstance(node, dict):
                continue
            if node_type and node.get("type") != node_type:
                continue
            node_title = (node.get("title") or "").strip()
            if title and node_title != title:
                continue
            return node
        return None

    @staticmethod
    def _find_workflow_output_index(node: dict[str, Any], output_name: str) -> int | None:
        for index, output_spec in enumerate(node.get("outputs", [])):
            if not isinstance(output_spec, dict):
                continue
            if output_spec.get("name") == output_name:
                return index
        return None

    @staticmethod
    def _get_next_prompt_node_id(prompt: dict[str, Any]) -> str:
        numeric_ids = [int(node_id) for node_id in prompt if str(node_id).isdigit()]
        return str(max(numeric_ids, default=0) + 1)

    def _ensure_editor_mask_export_nodes(
        self,
        prompt: dict[str, Any],
        workflow_payload: dict[str, Any],
    ) -> None:
        existing_mask_node_id = self._find_prompt_node_id(prompt, title=self.EDITOR_MASK_SAVE_TITLE)
        if existing_mask_node_id:
            return

        composite_node = self._find_workflow_node(
            workflow_payload,
            node_type=self.SMART_FUSION_COMPOSITE_TYPE,
        )
        if not composite_node:
            return

        composite_node_id = str(composite_node.get("id"))
        adjusted_mask_output_index = self._find_workflow_output_index(composite_node, "adjusted_mask")
        if composite_node_id not in prompt or adjusted_mask_output_index is None:
            return

        mask_to_image_node_id = self._get_next_prompt_node_id(prompt)
        save_mask_node_id = str(int(mask_to_image_node_id) + 1)

        prompt[mask_to_image_node_id] = {
            "inputs": {
                "mask": [composite_node_id, adjusted_mask_output_index],
            },
            "class_type": "MaskToImage",
            "_meta": {"title": "编辑人物 mask 转图"},
        }
        prompt[save_mask_node_id] = {
            "inputs": {
                "images": [mask_to_image_node_id, 0],
                "filename_prefix": "AIGC_WenLv_EditorMask",
            },
            "class_type": "SaveImage",
            "_meta": {"title": self.EDITOR_MASK_SAVE_TITLE},
        }

    def _resolve_editor_mask_node_id(self, prompt: dict[str, Any]) -> str | None:
        return (
            self._find_prompt_node_id(prompt, title=self.EDITOR_MASK_SAVE_TITLE)
            or self._find_prompt_node_id(prompt, title=self.LEGACY_PERSON_MASK_SAVE_TITLE)
            or (self.PERSON_MASK_OUTPUT_NODE_ID if self.PERSON_MASK_OUTPUT_NODE_ID in prompt else None)
        )

    @staticmethod
    def build_final_image_mask_prompt(final_image_name: str) -> dict[str, Any]:
        return {
            "1": {
                "inputs": {
                    "image": final_image_name,
                },
                "class_type": "LoadImage",
                "_meta": {"title": "编辑器上传成片"},
            },
            "2": {
                "inputs": {
                    "images": ["1", 0],
                    "face": True,
                    "hair": True,
                    "body": True,
                    "clothes": True,
                    "accessories": True,
                    "background": False,
                    "confidence": 0.35,
                    "detail_method": "VITMatte(local)",
                    "detail_erode": 4,
                    "detail_dilate": 4,
                    "black_point": 0.05,
                    "white_point": 0.97,
                    "process_detail": True,
                    "device": "cuda",
                    "max_megapixels": 2,
                },
                "class_type": "LayerMask: PersonMaskUltra V2",
                "_meta": {"title": "编辑器粗定位人物区域"},
            },
            "3": {
                "inputs": {
                    "object_mask": ["2", 1],
                    "sort_method": "big_to_small",
                    "bbox_select": "first",
                    "select_index": "0,",
                },
                "class_type": "LayerMask: ObjectDetectorMask",
                "_meta": {"title": "编辑器只保留最大的人"},
            },
            "4": {
                "inputs": {
                    "version": "BiRefNet-General",
                },
                "class_type": "LayerMask: LoadBiRefNetModelV2",
            },
            "5": {
                "inputs": {
                    "image": ["1", 0],
                    "birefnet_model": ["4", 0],
                    "detail_method": "VITMatte(local)",
                    "detail_erode": 4,
                    "detail_dilate": 2,
                    "black_point": 0.02,
                    "white_point": 0.98,
                    "process_detail": True,
                    "device": "cuda",
                    "max_megapixels": 3,
                },
                "class_type": "LayerMask: BiRefNetUltraV2",
                "_meta": {"title": "编辑器高质量抠图"},
            },
            "6": {
                "inputs": {
                    "image": ["1", 0],
                    "bboxes": ["3", 0],
                    "grow_top": 0,
                    "grow_bottom": 0,
                    "grow_left": 0,
                    "grow_right": 0,
                },
                "class_type": "LayerMask: DrawBBoxMask",
                "_meta": {"title": "编辑器最大人物框转 mask"},
            },
            "7": {
                "inputs": {
                    "destination": ["5", 1],
                    "source": ["6", 0],
                    "x": 0,
                    "y": 0,
                    "operation": "multiply",
                },
                "class_type": "MaskComposite",
                "_meta": {"title": "编辑器单人 mask"},
            },
            "8": {
                "inputs": {
                    "mask": ["7", 0],
                },
                "class_type": "MaskToImage",
                "_meta": {"title": "编辑器最终人物 mask 转图"},
            },
            "9": {
                "inputs": {
                    "images": ["8", 0],
                    "filename_prefix": "AIGC_WenLv_FinalEditorMask",
                },
                "class_type": "SaveImage",
                "_meta": {"title": "编辑器保存最终人物 mask"},
            },
        }

    @staticmethod
    def build_camera_person_extract_prompt(person_image_name: str) -> dict[str, Any]:
        return {
            "1": {
                "inputs": {"image": person_image_name},
                "class_type": "LoadImage",
                "_meta": {"title": "camera raw person frame"},
            },
            "5": {
                "inputs": {
                    "image": ["1", 0],
                    "model": "BiRefNet-HR",
                    "mask_blur": 0,
                    "mask_offset": -1,
                    "invert_output": False,
                    "background": "Alpha",
                    "background_color": "#000000",
                },
                "class_type": "SBTools_BiRefNet",
                "_meta": {"title": "camera SBTools BiRefNet matte"},
            },
            "11": {
                "inputs": {
                    "images": ["5", 2],
                    "filename_prefix": "AIGC_WenLv_CameraFullMask",
                },
                "class_type": "SaveImage",
                "_meta": {"title": "save camera full size mask"},
            },
        }

    def load_prompt_template(self) -> dict[str, Any]:
        current_mtime_ns = self.prompt_template_path.stat().st_mtime_ns
        cached_template = self.prompt_template_cache.get(self.prompt_template_path)
        if cached_template and cached_template[0] == current_mtime_ns:
            return copy.deepcopy(cached_template[1])

        raw_template = json.loads(self.prompt_template_path.read_text(encoding="utf-8"))
        if isinstance(raw_template, dict) and "nodes" in raw_template and "links" in raw_template:
            prompt_template = self._convert_workflow_to_prompt(raw_template)
            self._ensure_editor_mask_export_nodes(prompt_template, raw_template)
        else:
            prompt_template = raw_template
        self.prompt_template_cache[self.prompt_template_path] = (current_mtime_ns, prompt_template)
        return copy.deepcopy(prompt_template)

    async def build_upload_background_prompt(
        self,
        person_image: str,
        background_image: str,
    ) -> dict[str, Any]:
        prompt = self.load_prompt_template()
        prompt["2"]["inputs"]["image"] = person_image
        prompt["3"]["inputs"]["image"] = background_image

        # 兼容旧版 ai_文旅 API prompt：强制使用上传背景图作为融合背景。
        if "9" in prompt and "inputs" in prompt["9"] and "background_image" in prompt["9"]["inputs"]:
            prompt["9"]["inputs"]["background_image"] = ["3", 0]
        return prompt

    async def submit_prompt(self, client: httpx.AsyncClient, prompt: dict[str, Any]) -> str:
        payload = {
            "prompt": prompt,
            "client_id": str(uuid.uuid4()),
        }
        response = await client.post(f"{self.base_url}/prompt", json=payload)
        if response.is_error:
            detail = response.text.strip() or f"ComfyUI 请求失败，状态码 {response.status_code}"
            raise HTTPException(status_code=502, detail=detail)
        body = response.json()
        prompt_id = body.get("prompt_id")
        if not prompt_id:
            raise HTTPException(status_code=502, detail="ComfyUI 未返回 prompt_id")
        return prompt_id

    async def wait_for_completion(self, client: httpx.AsyncClient, prompt_id: str) -> dict[str, Any]:
        attempts = max(int(self.generation_timeout / self.poll_interval), 1)
        for _ in range(attempts):
            response = await client.get(f"{self.base_url}/history/{prompt_id}")
            response.raise_for_status()
            history = response.json()

            if prompt_id in history:
                return history[prompt_id]

            await asyncio.sleep(self.poll_interval)

        raise HTTPException(status_code=504, detail="ComfyUI 推理超时")

    @classmethod
    def extract_image_info(cls, history_item: dict[str, Any]) -> dict[str, str]:
        return cls.extract_node_image_info(history_item, cls.FINAL_OUTPUT_NODE_ID)

    @staticmethod
    def extract_node_image_info(
        history_item: dict[str, Any],
        node_id: str,
        *,
        required: bool = True,
    ) -> dict[str, str] | None:
        outputs = history_item.get("outputs", {})
        node_output = outputs.get(node_id, {})
        images = node_output.get("images", [])
        if images:
            return images[0]
        if required:
            raise HTTPException(status_code=502, detail=f"ComfyUI 未返回节点 {node_id} 的输出图片")
        return None

    @classmethod
    def _threshold_mask(cls, image: Image.Image) -> Image.Image:
        grayscale = image.convert("L")
        return grayscale.point(lambda pixel: 255 if pixel > cls.MASK_THRESHOLD else 0, mode="L")

    @staticmethod
    def _clamp_bbox(
        bbox: tuple[int, int, int, int],
        width: int,
        height: int,
    ) -> dict[str, int]:
        left = max(0, min(int(round(bbox[0])), width - 1))
        top = max(0, min(int(round(bbox[1])), height - 1))
        right = max(left + 1, min(int(round(bbox[2])), width))
        bottom = max(top + 1, min(int(round(bbox[3])), height))
        return {
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
        }

    @staticmethod
    def _resolve_numeric_value(raw_value: Any, default: float) -> float:
        try:
            return float(raw_value)
        except (TypeError, ValueError):
            return default

    @classmethod
    def _project_bbox_to_final_image(
        cls,
        bbox: tuple[int, int, int, int],
        layer_size: tuple[int, int],
        final_size: tuple[int, int],
        blend_inputs: dict[str, Any],
    ) -> dict[str, int]:
        layer_width, layer_height = layer_size
        final_width, final_height = final_size
        scale = cls._resolve_numeric_value(blend_inputs.get("scale"), 1.0)
        x_percent = cls._resolve_numeric_value(blend_inputs.get("x_percent"), 50.0)
        y_percent = cls._resolve_numeric_value(blend_inputs.get("y_percent"), 50.0)

        placed_width = max(1, int(round(layer_width * scale)))
        placed_height = max(1, int(round(layer_height * scale)))
        offset_x = int(round(final_width * (x_percent / 100.0) - placed_width / 2))
        offset_y = int(round(final_height * (y_percent / 100.0) - placed_height / 2))

        scale_x = placed_width / max(1, layer_width)
        scale_y = placed_height / max(1, layer_height)
        left, top, right, bottom = bbox

        projected_bbox = (
            offset_x + left * scale_x,
            offset_y + top * scale_y,
            offset_x + right * scale_x,
            offset_y + bottom * scale_y,
        )
        return cls._clamp_bbox(projected_bbox, final_width, final_height)

    @classmethod
    def _soften_projected_mask(cls, projected_mask: Image.Image) -> Image.Image:
        blur_radius = max(4, int(max(projected_mask.size) * 0.004))
        return projected_mask.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    @classmethod
    def _project_mask_to_final_image(
        cls,
        mask_image: Image.Image,
        final_size: tuple[int, int],
        blend_inputs: dict[str, Any],
    ) -> Image.Image:
        final_width, final_height = final_size
        scale = cls._resolve_numeric_value(blend_inputs.get("scale"), 1.0)
        x_percent = cls._resolve_numeric_value(blend_inputs.get("x_percent"), 50.0)
        y_percent = cls._resolve_numeric_value(blend_inputs.get("y_percent"), 50.0)

        placed_width = max(1, int(round(mask_image.width * scale)))
        placed_height = max(1, int(round(mask_image.height * scale)))
        offset_x = int(round(final_width * (x_percent / 100.0) - placed_width / 2))
        offset_y = int(round(final_height * (y_percent / 100.0) - placed_height / 2))

        projected_mask = Image.new("L", (final_width, final_height), 0)
        resized_mask = mask_image.resize((placed_width, placed_height), Image.Resampling.LANCZOS)
        projected_mask.paste(resized_mask, (offset_x, offset_y), resized_mask)
        return projected_mask

    @staticmethod
    def _mask_to_png_bytes(mask_image: Image.Image) -> bytes:
        buffer = BytesIO()
        mask_image.save(buffer, format="PNG")
        return buffer.getvalue()

    @classmethod
    def estimate_editor_face_assets(
        cls,
        person_mask_bytes: bytes,
        final_image_bytes: bytes,
        blend_inputs: dict[str, Any] | None = None,
    ) -> tuple[dict[str, int] | None, bytes | None]:
        with Image.open(BytesIO(person_mask_bytes)) as mask_image, Image.open(BytesIO(final_image_bytes)) as final_image:
            binary_mask = cls._threshold_mask(mask_image)
            if not binary_mask.getbbox():
                return None, None

            if binary_mask.size == final_image.size:
                final_mask = binary_mask
            elif blend_inputs:
                final_mask = cls._project_mask_to_final_image(
                    binary_mask,
                    final_image.size,
                    blend_inputs,
                )
            else:
                return None, None

            softened_mask = cls._soften_projected_mask(final_mask)
            projected_mask_bbox = softened_mask.point(lambda pixel: 255 if pixel > 12 else 0, mode="L").getbbox()
            if not projected_mask_bbox:
                return None, None

            return (
                cls._clamp_bbox(projected_mask_bbox, final_image.width, final_image.height),
                cls._mask_to_png_bytes(softened_mask),
            )

    async def build_editor_face_assets_from_final_image(
        self,
        client: httpx.AsyncClient,
        final_image_bytes: bytes,
    ) -> tuple[dict[str, int] | None, bytes | None]:
        try:
            final_image_name = await self.upload_bytes(
                client,
                final_image_bytes,
                f"editor-final-{uuid.uuid4().hex}.png",
                "image/png",
            )
            prompt = self.build_final_image_mask_prompt(final_image_name)
            prompt_id = await self.submit_prompt(client, prompt)
            history = await self.wait_for_completion(client, prompt_id)
            mask_info = self.extract_node_image_info(history, "9", required=False)
            if not mask_info:
                return None, None

            mask_bytes, _ = await self.fetch_image_bytes(client, mask_info)
            return self.estimate_editor_face_assets(mask_bytes, final_image_bytes)
        except Exception:
            return None, None

    async def build_editor_face_assets(
        self,
        client: httpx.AsyncClient,
        history_item: dict[str, Any],
        prompt: dict[str, Any],
        final_image_bytes: bytes,
    ) -> tuple[dict[str, int] | None, bytes | None]:
        person_mask_output_node_id = self._resolve_editor_mask_node_id(prompt)
        if not person_mask_output_node_id:
            return None, None

        person_mask_info = self.extract_node_image_info(
            history_item,
            person_mask_output_node_id,
            required=False,
        )
        if not person_mask_info:
            return await self.build_editor_face_assets_from_final_image(client, final_image_bytes)

        try:
            person_mask_bytes, _ = await self.fetch_image_bytes(client, person_mask_info)
            estimated_assets = self.estimate_editor_face_assets(
                person_mask_bytes,
                final_image_bytes,
                (prompt.get("9") or {}).get("inputs", {}),
            )
            if estimated_assets[0] and estimated_assets[1]:
                return estimated_assets
        except Exception:
            pass

        return await self.build_editor_face_assets_from_final_image(client, final_image_bytes)

    async def fetch_image_bytes(self, client: httpx.AsyncClient, image_info: dict[str, str]) -> tuple[bytes, str]:
        params = {
            "filename": image_info["filename"],
            "subfolder": image_info.get("subfolder", ""),
            "type": image_info.get("type", "output"),
        }
        response = await client.get(f"{self.base_url}/view", params=params)
        response.raise_for_status()
        media_type = response.headers.get("content-type", "image/png")
        return response.content, media_type

    @staticmethod
    def _validate_camera_composition_payload(payload: dict[str, Any]) -> dict[str, Any]:
        mode = payload.get("mode")
        if mode not in {"camera_virtual_background_v1", "camera_virtual_background_v2"}:
            raise HTTPException(status_code=400, detail="composition_payload mode 不支持")

        bbox = payload.get("person_bbox")
        if not isinstance(bbox, dict):
            raise HTTPException(status_code=400, detail="composition_payload 缺少 person_bbox")

        normalized_bbox: dict[str, float] = {}
        for key in ("x", "y", "width", "height"):
            try:
                normalized_bbox[key] = float(bbox[key])
            except (KeyError, TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"composition_payload person_bbox.{key} 无效")

        normalized_bbox["x"] = max(0.0, min(1.0, normalized_bbox["x"]))
        normalized_bbox["y"] = max(0.0, min(1.0, normalized_bbox["y"]))
        normalized_bbox["width"] = max(0.01, min(1.0 - normalized_bbox["x"], normalized_bbox["width"]))
        normalized_bbox["height"] = max(0.01, min(1.0 - normalized_bbox["y"], normalized_bbox["height"]))

        if normalized_bbox["width"] <= 0.01 or normalized_bbox["height"] <= 0.01:
            raise HTTPException(status_code=400, detail="composition_payload 人物区域过小")

        normalized_cover_rect = None
        cover_rect = payload.get("camera_cover_rect")
        if isinstance(cover_rect, dict):
            normalized_cover_rect = {}
            for key in ("x", "y", "width", "height"):
                try:
                    value = float(cover_rect[key])
                except (KeyError, TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"composition_payload camera_cover_rect.{key} 鏃犳晥")
                if key in {"width", "height"}:
                    value = max(0.01, min(8.0, value))
                else:
                    value = max(-4.0, min(4.0, value))
                normalized_cover_rect[key] = value

        return {
            "mode": mode,
            "canvas_width": int(payload.get("canvas_width") or 0),
            "canvas_height": int(payload.get("canvas_height") or 0),
            "background_fit": payload.get("background_fit") or "cover",
            "person_bbox": normalized_bbox,
            "camera_cover_rect": normalized_cover_rect,
        }

    @classmethod
    def _prepare_camera_person_alpha(cls, mask_image: Image.Image) -> Image.Image:
        alpha = ImageOps.autocontrast(mask_image.convert("L"))

        def refine(pixel: int) -> int:
            if pixel <= 14:
                return 0
            if pixel >= 250:
                return 255
            return int(round(((pixel - 14) / 236) ** 1.08 * 255))

        alpha = alpha.point(refine, mode="L")
        return alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(radius=0.45))

    @staticmethod
    def _image_to_png_bytes(image: Image.Image) -> bytes:
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    @classmethod
    def _defringe_person_layer(
        cls,
        person_layer: Image.Image,
    ) -> Image.Image:
        alpha = person_layer.getchannel("A")
        foreground = person_layer.convert("RGB")
        softened_foreground = foreground.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(radius=0.35))

        def edge_strength(pixel: int) -> int:
            if pixel <= 10 or pixel >= 228:
                return 0
            return int(round(max(0, min(150, (228 - pixel) * 0.72))))

        edge_mask = alpha.point(edge_strength, mode="L")
        output = Image.composite(softened_foreground, foreground, edge_mask)
        result = output.convert("RGBA")
        result.putalpha(alpha)
        return result

    @classmethod
    def _compose_camera_background_result(
        cls,
        background_bytes: bytes,
        person_layer_bytes: bytes,
        person_mask_bytes: bytes,
        composition_payload: dict[str, Any],
    ) -> tuple[bytes, dict[str, int] | None, bytes | None]:
        payload = cls._validate_camera_composition_payload(composition_payload)
        bbox = payload["person_bbox"]

        with Image.open(BytesIO(background_bytes)) as raw_background:
            background = ImageOps.exif_transpose(raw_background).convert("RGB")
        with Image.open(BytesIO(person_layer_bytes)) as raw_person_layer:
            person_layer = ImageOps.exif_transpose(raw_person_layer).convert("RGBA")
        with Image.open(BytesIO(person_mask_bytes)) as raw_person_mask:
            person_mask = ImageOps.exif_transpose(raw_person_mask).convert("L")

        if not person_mask.getbbox():
            raise HTTPException(status_code=502, detail="ComfyUI 未识别到可合成的人物区域")

        if person_mask.size != person_layer.size:
            person_mask = person_mask.resize(person_layer.size, Image.Resampling.LANCZOS)

        alpha = cls._prepare_camera_person_alpha(person_mask)
        person_layer.putalpha(alpha)

        final_width, final_height = background.size
        cover_rect = payload.get("camera_cover_rect")
        if cover_rect:
            placed_width = max(1, int(round(cover_rect["width"] * final_width)))
            placed_height = max(1, int(round(cover_rect["height"] * final_height)))
            offset_x = int(round(cover_rect["x"] * final_width))
            offset_y = int(round(cover_rect["y"] * final_height))

            resized_person = person_layer.resize((placed_width, placed_height), Image.Resampling.LANCZOS)
            result_image = background.convert("RGBA")

            visible_left = max(0, -offset_x)
            visible_top = max(0, -offset_y)
            visible_right = min(placed_width, final_width - offset_x)
            visible_bottom = min(placed_height, final_height - offset_y)
            if visible_right <= visible_left or visible_bottom <= visible_top:
                raise HTTPException(status_code=400, detail="composition_payload camera_cover_rect 鏃犳晥")

            visible_person = resized_person.crop((visible_left, visible_top, visible_right, visible_bottom))
            paste_x = offset_x + visible_left
            paste_y = offset_y + visible_top
            visible_person = cls._defringe_person_layer(visible_person)
            result_image.alpha_composite(visible_person, (paste_x, paste_y))

            full_mask = Image.new("L", result_image.size, 0)
            visible_alpha = visible_person.getchannel("A")
            full_mask.paste(visible_alpha, (paste_x, paste_y), visible_alpha)
            mask_bbox = full_mask.point(lambda pixel: 255 if pixel > 12 else 0, mode="L").getbbox()
            editor_bounds = cls._clamp_bbox(mask_bbox, final_width, final_height) if mask_bbox else None
            editor_mask_bytes = cls._mask_to_png_bytes(full_mask.filter(ImageFilter.GaussianBlur(radius=2.0))) if mask_bbox else None

            return cls._image_to_png_bytes(result_image), editor_bounds, editor_mask_bytes

        target_left = int(round(bbox["x"] * final_width))
        target_top = int(round(bbox["y"] * final_height))
        target_width = max(1, int(round(bbox["width"] * final_width)))
        target_height = max(1, int(round(bbox["height"] * final_height)))

        scale = min(target_width / max(1, person_layer.width), target_height / max(1, person_layer.height))
        placed_width = max(1, int(round(person_layer.width * scale)))
        placed_height = max(1, int(round(person_layer.height * scale)))
        offset_x = target_left + int(round((target_width - placed_width) / 2))
        offset_y = target_top + int(round((target_height - placed_height) / 2))

        resized_person = person_layer.resize((placed_width, placed_height), Image.Resampling.LANCZOS)
        result_image = background.convert("RGBA")
        resized_person = cls._defringe_person_layer(resized_person)
        result_image.alpha_composite(resized_person, (offset_x, offset_y))

        full_mask = Image.new("L", result_image.size, 0)
        resized_alpha = resized_person.getchannel("A")
        full_mask.paste(resized_alpha, (offset_x, offset_y), resized_alpha)
        mask_bbox = full_mask.point(lambda pixel: 255 if pixel > 12 else 0, mode="L").getbbox()
        editor_bounds = cls._clamp_bbox(mask_bbox, final_width, final_height) if mask_bbox else None
        editor_mask_bytes = cls._mask_to_png_bytes(full_mask.filter(ImageFilter.GaussianBlur(radius=2.0))) if mask_bbox else None

        return cls._image_to_png_bytes(result_image), editor_bounds, editor_mask_bytes

    @staticmethod
    def _get_image_size(content: bytes) -> tuple[int, int]:
        """Read image dimensions from raw bytes."""
        from io import BytesIO
        from PIL import Image

        with Image.open(BytesIO(content)) as img:
            return img.size

    @classmethod
    def _convert_camera_composition_to_blend_params(
        cls,
        composition_payload: dict[str, Any],
        person_size: tuple[int, int],
        background_size: tuple[int, int],
    ) -> dict[str, float]:
        """Convert camera composition payload to SmartFusion blend node parameters.

        Returns dict with x_percent, y_percent, scale suitable for the
        SmartFusion Auto Composite node.
        """
        payload = cls._validate_camera_composition_payload(composition_payload)
        bbox = payload["person_bbox"]
        bg_width, bg_height = background_size
        person_width, person_height = person_size
        cover_rect = payload.get("camera_cover_rect")

        if cover_rect:
            # camera_cover_rect mode: explicit placement
            placed_width = cover_rect["width"] * bg_width
            placed_height = cover_rect["height"] * bg_height
            offset_x = cover_rect["x"] * bg_width
            offset_y = cover_rect["y"] * bg_height

            # Center of placed person
            center_x = offset_x + placed_width / 2.0
            center_y = offset_y + placed_height / 2.0

            # Scale: placed size / original size
            scale_x = placed_width / max(1, person_width)
            scale_y = placed_height / max(1, person_height)
            scale = min(scale_x, scale_y)
        else:
            # bbox mode: fit person within bbox
            target_left = bbox["x"] * bg_width
            target_top = bbox["y"] * bg_height
            target_width = bbox["width"] * bg_width
            target_height = bbox["height"] * bg_height

            # Center of target bbox
            center_x = target_left + target_width / 2.0
            center_y = target_top + target_height / 2.0

            # Scale to fit within bbox maintaining aspect ratio
            scale_x = target_width / max(1, person_width)
            scale_y = target_height / max(1, person_height)
            scale = min(scale_x, scale_y)

        x_percent = (center_x / max(1, bg_width)) * 100.0
        y_percent = (center_y / max(1, bg_height)) * 100.0

        return {
            "x_percent": round(x_percent, 2),
            "y_percent": round(y_percent, 2),
            "scale": round(scale, 4),
        }

    async def _build_camera_smartfusion_prompt(
        self,
        person_name: str,
        background_name: str,
        blend_params: dict[str, float],
    ) -> dict[str, Any]:
        """Build SmartFusion prompt for camera workflow with composition params."""
        prompt = await self.build_upload_background_prompt(person_name, background_name)

        # Apply composition parameters to the SmartFusion blend node (node 9)
        if "9" in prompt and "inputs" in prompt["9"]:
            blend_inputs = prompt["9"]["inputs"]
            blend_inputs["x_percent"] = blend_params["x_percent"]
            blend_inputs["y_percent"] = blend_params["y_percent"]
            blend_inputs["scale"] = blend_params["scale"]

        return prompt

    async def run_camera_virtual_background_checkin(
        self,
        client: httpx.AsyncClient,
        person_content: bytes,
        person_filename: str,
        background_content: bytes,
        background_filename: str,
        composition_payload: dict[str, Any],
    ) -> tuple[bytes, str, str, dict[str, int], dict[str, int] | None, bytes | None]:
        started_at = time.perf_counter()

        # Workflow 1: ComfyUI only extracts a full-frame person matte from the raw camera frame.
        person_name = await self.upload_bytes(client, person_content, person_filename, "image/png")
        upload_finished_at = time.perf_counter()

        prompt = self.build_camera_person_extract_prompt(person_name)
        prompt_id = await self.submit_prompt(client, prompt)
        submit_finished_at = time.perf_counter()
        history = await self.wait_for_completion(client, prompt_id)
        wait_finished_at = time.perf_counter()

        mask_info = self.extract_node_image_info(history, self.CAMERA_PERSON_FULL_MASK_NODE_ID)
        person_mask_bytes, _ = await self.fetch_image_bytes(client, mask_info)

        # Workflow 2: compose locally with the selected virtual travel background.
        # This preserves the camera preview's person size and position; ComfyUI never places the person.
        image_bytes, editor_face_bounds, editor_face_mask_bytes = self._compose_camera_background_result(
            background_content, person_content, person_mask_bytes, composition_payload
        )
        fetch_finished_at = time.perf_counter()

        timing = {
            "upload_ms": int((upload_finished_at - started_at) * 1000),
            "submit_ms": int((submit_finished_at - upload_finished_at) * 1000),
            "wait_ms": int((wait_finished_at - submit_finished_at) * 1000),
            "fetch_ms": int((fetch_finished_at - wait_finished_at) * 1000),
            "total_ms": int((fetch_finished_at - started_at) * 1000),
        }
        return image_bytes, "image/png", prompt_id, timing, editor_face_bounds, editor_face_mask_bytes

    async def run_upload_background_checkin(
        self,
        person_file: UploadFile,
        background_file: UploadFile | None = None,
        background_template_path: Path | None = None,
        composition_payload: dict[str, Any] | None = None,
    ) -> tuple[bytes, str, str, dict[str, int], dict[str, int] | None, bytes | None]:
        timeout = httpx.Timeout(self.request_timeout, read=self.generation_timeout + 30)
        async with self._create_client(timeout) as client:
            if composition_payload:
                person_content = await person_file.read()
                if not person_content:
                    raise HTTPException(status_code=400, detail="person_image 不能为空")
                if background_file is not None:
                    background_content = await background_file.read()
                    background_filename = background_file.filename or "background.png"
                elif background_template_path is not None:
                    background_content = background_template_path.read_bytes()
                    background_filename = background_template_path.name
                else:
                    raise HTTPException(status_code=400, detail="请上传背景图，或选择一个系统模板")
                if not background_content:
                    raise HTTPException(status_code=400, detail="background_image 不能为空")
                return await self.run_camera_virtual_background_checkin(
                    client,
                    person_content,
                    person_file.filename or "camera-person.png",
                    background_content,
                    background_filename,
                    composition_payload,
                )

            started_at = time.perf_counter()
            person_name = await self.upload_image(client, person_file, "person")
            if background_file is not None:
                background_name = await self.upload_image(client, background_file, "background")
            elif background_template_path is not None:
                background_name = await self.upload_local_image(client, background_template_path, "background")
            else:
                raise HTTPException(status_code=400, detail="请上传背景图，或选择一个系统模板")
            upload_finished_at = time.perf_counter()
            prompt = await self.build_upload_background_prompt(person_name, background_name)
            prompt_id = await self.submit_prompt(client, prompt)
            submit_finished_at = time.perf_counter()
            history = await self.wait_for_completion(client, prompt_id)
            wait_finished_at = time.perf_counter()
            image_info = self.extract_image_info(history)
            image_bytes, media_type = await self.fetch_image_bytes(client, image_info)
            editor_face_bounds, editor_face_mask_bytes = await self.build_editor_face_assets(client, history, prompt, image_bytes)
            fetch_finished_at = time.perf_counter()
            timing = {
                "upload_ms": int((upload_finished_at - started_at) * 1000),
                "submit_ms": int((submit_finished_at - upload_finished_at) * 1000),
                "wait_ms": int((wait_finished_at - submit_finished_at) * 1000),
                "fetch_ms": int((fetch_finished_at - wait_finished_at) * 1000),
                "total_ms": int((fetch_finished_at - started_at) * 1000),
            }
            return image_bytes, media_type, prompt_id, timing, editor_face_bounds, editor_face_mask_bytes
