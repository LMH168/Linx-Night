#!/usr/bin/env python3
"""scene budget guard — issue #135 的渲染预算静态检查器。

用途：把一个 3D 场景文件（.html / .js / .ts / .vue）按 #135 §4.7 与
「不许为了跑得动而牺牲画面」的约定做静态体检，输出可读报告并用退出码
表示是否越界。可作为 CI 门禁，也可在本地改完立刻自查。

检查项：
  1. 实时点光源/聚光灯/面光源数量（本场景目标 0）
  2. 总光源数量（目标 ≤ 2）
  3. 实时阴影（shadowMap.enabled / castShadow = true）
  4. setSize 调用位置：只允许出现在 resize 类函数内
  5. 是否按需渲染（存在 dirty/needsRender 守卫）
  6. iframe 承载 3D 世界（禁止）
  7. 持续动画画布上的 backdrop-filter（禁止）

用法：
  python tools/check_scene_budget.py <file> [<file> ...] [--json]

退出码：0 = 全部通过；1 = 有违规；2 = 参数/读取错误。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------
# 预算（与 issue #135 §4.7 对齐，并按原型结论收紧）
# --------------------------------------------------------------------------
BUDGET = {
    "point_lights": 0,        # 每个座位一盏 PointLight = 16 灯 = 灾难
    "spot_lights": 0,
    "area_lights": 1,         # RectAreaLight 允许 1 个（若有）
    "total_lights": 2,
    "shadow_casters": 0,      # 静态场景一律烘焙阴影
    "draw_calls": 60,         # 运行时断言用，静态检查只提示
    "triangles": 120_000,
}

# `new T.PointLight(...)`、`new THREE.PointLight(...)`、`new PointLight(...)` 都算
LIGHT_PATTERNS = {
    "point_lights": r"new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*PointLight\b",
    "spot_lights": r"new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*SpotLight\b",
    "area_lights": r"new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*RectAreaLight\b",
    "hemi_lights": r"new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*HemisphereLight\b",
    "dir_lights": r"new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*DirectionalLight\b",
    "ambient_lights": r"new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*AmbientLight\b",
}

FUNC_HEADER = re.compile(
    r"(?:function\s+(?P<fn>\w+)\s*\(|"
    r"(?:const|let|var)\s+(?P<var>\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)"
)


@dataclass
class Finding:
    level: str          # "error" | "warn" | "info"
    code: str
    message: str
    line: int = 0

    def render(self, source: str) -> str:
        where = f"{source}:{self.line}" if self.line else source
        return f"  [{self.level.upper():5}] {where}  {self.code}  {self.message}"


@dataclass
class Report:
    source: str
    counts: dict[str, int] = field(default_factory=dict)
    findings: list[Finding] = field(default_factory=list)

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "error"]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "warn"]

    @property
    def ok(self) -> bool:
        return not self.errors


def enclosing_function(lines: list[str], index: int, lookback: int = 240) -> str | None:
    """向上找最近的函数定义，返回函数名（找不到返回 None）。"""
    for i in range(index, max(-1, index - lookback), -1):
        m = FUNC_HEADER.search(lines[i])
        if m:
            return m.group("fn") or m.group("var")
    return None


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def scan_file(path: Path) -> Report:
    report = Report(source=str(path))
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    # ---- 1/2. 光源计数 ------------------------------------------------
    for key, pattern in LIGHT_PATTERNS.items():
        report.counts[key] = len(re.findall(pattern, text))

    for key, limit in (
        ("point_lights", BUDGET["point_lights"]),
        ("spot_lights", BUDGET["spot_lights"]),
        ("area_lights", BUDGET["area_lights"]),
    ):
        n = report.counts[key]
        if n > limit:
            kind = key.replace("_lights", " 光源")
            report.findings.append(
                Finding(
                    "error",
                    "LIGHT_BUDGET",
                    f"{kind} {n} 个，预算上限 {limit}；改用自发光材质 + 光晕贴图 + 烘焙",
                )
            )

    total = sum(
        report.counts[k]
        for k in ("point_lights", "spot_lights", "area_lights", "hemi_lights", "dir_lights", "ambient_lights")
    )
    report.counts["total_lights"] = total
    if total > BUDGET["total_lights"]:
        report.findings.append(
            Finding(
                "error",
                "LIGHT_BUDGET",
                f"场景总光源 {total} 个，预算上限 {BUDGET['total_lights']}",
            )
        )

    # ---- 3. 实时阴影 ---------------------------------------------------
    shadow_enabled = re.search(r"shadowMap\s*\.\s*enabled\s*=\s*true", text)
    cast_shadows = len(re.findall(r"\bcastShadow\s*=\s*true\b", text))
    report.counts["cast_shadow_true"] = cast_shadows
    if shadow_enabled:
        report.findings.append(
            Finding("error", "SHADOW_BUDGET", "shadowMap.enabled = true：静态场景应把阴影烘进贴图")
        )
    if cast_shadows > BUDGET["shadow_casters"]:
        report.findings.append(
            Finding(
                "error",
                "SHADOW_BUDGET",
                f"{cast_shadows} 处 castShadow = true，预算上限 {BUDGET['shadow_casters']}",
            )
        )

    # ---- 4. setSize 只能出现在 resize 里 -------------------------------
    set_size_hits = 0
    for m in re.finditer(r"\.setSize\s*\(", text):
        set_size_hits += 1
        idx = line_of(text, m.start()) - 1
        fn = enclosing_function(lines, idx)
        if fn is None or not re.search(r"resize|onsize|syncsize|applysize", fn, re.I):
            report.findings.append(
                Finding(
                    "error",
                    "SETSIZE_LOCATION",
                    f"setSize 出现在 `{fn or '顶层/匿名'}()` 内；只允许在 resize 时调用，"
                    "阶段切换调用会重建 drawing buffer 造成硬停顿",
                    idx + 1,
                )
            )
    report.counts["setSize_calls"] = set_size_hits

    # ---- 5. 按需渲染守卫 -----------------------------------------------
    has_dirty_flag = re.search(r"\b(?:dirty|needsRender|renderRequested|invalidat\w*)\b\s*=\s*(?:true|false)", text, re.I)
    render_call = re.search(r"\.render\s*\(\s*scene", text)
    guarded = re.search(
        r"if\s*\(\s*(?:!?\s*)?(?:dirty|needsRender|renderRequested)\b[^)]*\)\s*\{?[^}]{0,400}?\.render\s*\(",
        text,
        re.S,
    )
    # 另一种同样正确的写法：幂等的 rAF 调度器（有一次只排一帧的守卫）
    raf_guard = re.search(
        r"if\s*\([^)]*\b(?:frameHandle|rafId|rafHandle|pendingFrame|frameId)\b[^)]*\)\s*(?:return|;)",
        text,
    ) and re.search(r"requestAnimationFrame\s*\(", text)
    on_demand = bool(guarded or raf_guard)
    report.counts["on_demand"] = 1 if on_demand else 0
    if render_call and not on_demand:
        report.findings.append(
            Finding(
                "warn",
                "ON_DEMAND",
                "未发现按需渲染守卫：每帧都 render() 会让静止场景持续耗电发热",
            )
        )
    elif on_demand:
        report.findings.append(
            Finding("info", "ON_DEMAND", "检测到按需渲染守卫（dirty 标志或幂等 rAF 调度）")
        )

    # ---- 6. iframe 承载世界 --------------------------------------------
    if "<iframe" in text.lower():
        report.findings.append(
            Finding(
                "error",
                "IFRAME_WORLD",
                "使用 iframe 承载 3D 世界：跨文档无法控制帧循环/DPR/几何合并，#135 §1.3 明确禁止",
            )
        )

    # ---- 7. backdrop-filter 叠在画布上 ---------------------------------
    blurs = len(re.findall(r"backdrop-filter\s*:", text))
    report.counts["backdrop_filter"] = blurs
    if blurs:
        report.findings.append(
            Finding(
                "warn",
                "BACKDROP_BLUR",
                f"{blurs} 处 backdrop-filter：盖在持续动画的画布上会每帧全屏重模糊，改为静态半透明底色",
            )
        )

    # ---- 8. 几何合并提示 -----------------------------------------------
    instanced = len(re.findall(r"InstancedMesh", text))
    merged = len(re.findall(r"mergeGeometries", text))
    report.counts["instanced_mesh"] = instanced
    report.counts["merged_geometry"] = merged
    if merged == 0 and instanced == 0 and render_call:
        report.findings.append(
            Finding(
                "warn",
                "BATCHING",
                "既无 mergeGeometries 也无 InstancedMesh：重复物体逐个绘制会推高 draw call",
            )
        )

    return report


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="issue #135 3D 场景渲染预算检查")
    parser.add_argument("files", nargs="+", help="待检查的文件")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出")
    args = parser.parse_args(argv)

    reports: list[Report] = []
    for raw in args.files:
        path = Path(raw)
        if not path.is_file():
            print(f"跳过（不存在或不是文件）：{raw}", file=sys.stderr)
            continue
        reports.append(scan_file(path))

    if not reports:
        print("没有可检查的文件", file=sys.stderr)
        return 2

    if args.json:
        payload = [
            {
                "source": r.source,
                "ok": r.ok,
                "counts": r.counts,
                "findings": [
                    {"level": f.level, "code": f.code, "message": f.message, "line": f.line}
                    for f in r.findings
                ],
            }
            for r in reports
        ]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0 if all(r.ok for r in reports) else 1

    failed = 0
    for r in reports:
        status = "PASS" if r.ok else "FAIL"
        print(f"\n{'=' * 62}\n{status}  {r.source}\n{'=' * 62}")
        print("统计：")
        for key, value in r.counts.items():
            print(f"  {key:<20} {value}")
        if r.findings:
            print("发现：")
            for f in r.findings:
                print(f.render(r.source))
        else:
            print("发现：无")
        if not r.ok:
            failed += 1

    print(f"\n合计 {len(reports)} 个文件，{len(reports) - failed} 通过，{failed} 失败。")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
