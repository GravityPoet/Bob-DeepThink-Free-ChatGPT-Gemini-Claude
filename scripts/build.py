#!/usr/bin/env python3
"""Build reproducible Bob archives without third-party dependencies or publishing."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = "Bob-DeepThink-Free-ChatGPT-Gemini-Claude"
LEGACY_ID = "io.github.gravitypoet.ai-vip-0-token-plan"


def archive(legacy: bool) -> bytes:
    source = ROOT / "plugin"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for path in sorted(source.rglob("*")):
            if path.is_symlink():
                raise ValueError(f"不允许打包符号链接：{path}")
            if not path.is_file() or path.name.startswith("."):
                continue
            data = path.read_bytes()
            if path.name == "info.json" and legacy:
                info = json.loads(data)
                info["identifier"] = LEGACY_ID
                info["appcast"] = info["appcast"].replace("appcast.json", "appcast-legacy.json")
                data = (json.dumps(info, ensure_ascii=False, indent=2) + "\n").encode()
            entry = zipfile.ZipInfo(path.relative_to(source).as_posix(), date_time=(2020, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            package.writestr(entry, data)
    data = buffer.getvalue()
    with zipfile.ZipFile(io.BytesIO(data)) as package:
        if package.testzip() is not None:
            raise ValueError("安装包完整性检查失败")
        if "main.js" not in package.namelist() or "info.json" not in package.namelist():
            raise ValueError("缺少 Bob 入口")
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="仅校验安装包与源码一致，不写文件")
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    args = parser.parse_args()
    if not args.check:
        args.output_dir.mkdir(parents=True, exist_ok=True)
    for legacy in (False, True):
        path = args.output_dir / (NAME + ("-legacy-id" if legacy else "") + ".bobplugin")
        data = archive(legacy)
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                raise SystemExit(f"安装包与源码不一致：{path.name}；请先运行 npm run build")
        else:
            temporary = path.with_suffix(path.suffix + ".tmp")
            temporary.write_bytes(data)
            temporary.replace(path)
        print(f"{path.name} sha256={hashlib.sha256(data).hexdigest()}")


if __name__ == "__main__":
    main()
