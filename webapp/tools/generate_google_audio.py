from __future__ import annotations

import json
from pathlib import Path

from gtts import gTTS


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_JSON = ROOT / "data" / "questions.json"
AUDIO_DIR = ROOT / "audio" / "prompts"
MANIFEST = ROOT / "data" / "prompt_audio_manifest.json"


def build_prompts(payload: dict) -> list[dict]:
    prompts: list[dict] = []
    for group in payload["questions"]:
        prompts.append(
            {
                "promptId": f"{group['id']}-main",
                "text": group["title"],
                "chapter": group["chapter"],
                "typeLabel": "主问题",
            }
        )
        for branch in ("A", "B"):
            prompts.append(
                {
                    "promptId": f"{group['id']}-{branch}",
                    "text": group["followups"][branch]["prompt"],
                    "chapter": group["chapter"],
                    "typeLabel": f"第一层追问 {branch}",
                }
            )
            prompts.append(
                {
                    "promptId": f"{group['id']}-{group['followups'][branch]['secondLevel']['label']}",
                    "text": group["followups"][branch]["secondLevel"]["prompt"],
                    "chapter": group["chapter"],
                    "typeLabel": f"第二层追问 {group['followups'][branch]['secondLevel']['label']}",
                }
            )
    return prompts


def synthesize(prompt: dict) -> dict:
    output_path = AUDIO_DIR / f"{prompt['promptId']}.mp3"
    if output_path.exists() and output_path.stat().st_size > 0:
        return {
            **prompt,
            "file": f"./audio/prompts/{output_path.name}",
            "generated": False,
        }

    tts = gTTS(text=prompt["text"], lang="zh-CN", slow=False)
    tts.save(str(output_path))
    return {
        **prompt,
        "file": f"./audio/prompts/{output_path.name}",
        "generated": True,
    }


def main() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.loads(QUESTIONS_JSON.read_text(encoding="utf-8"))
    prompts = build_prompts(payload)
    manifest_items = []

    for idx, prompt in enumerate(prompts, start=1):
        result = synthesize(prompt)
        manifest_items.append(result)
        status = "generated" if result["generated"] else "cached"
        print(f"[{idx:03d}/{len(prompts):03d}] {prompt['promptId']} -> {status}")

    manifest = {
        "engine": "gTTS",
        "count": len(manifest_items),
        "items": manifest_items,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote manifest to {MANIFEST}")


if __name__ == "__main__":
    main()
