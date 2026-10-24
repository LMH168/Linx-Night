"""Export only reviewed source paths, never local account state or dependencies."""
from pathlib import Path
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ROOT_FILES = (
    '.editorconfig', '.env.example', '.gitignore', '.prettierignore',
    '.prettierrc.json', 'README.md', 'package.json', 'package-lock.json',
    'start.mjs', 'server.mjs', 'voice-server.mjs', 'engine.mjs',
    'orchestrator.mjs', 'linx-config.mjs', 'linx.mjs', 'asr.mjs', 'tts.mjs',
)
SOURCE_DIRS = {
    'public': {'.js', '.html', '.css'},
    'scripts': {'.mjs', '.py'},
    'test': {'.mjs'},
    'docs': {'.md'},
    '.github/workflows': {'.yml', '.yaml'},
}


def require_regular(path):
    for item in (path, *path.parents):
        if item == ROOT:
            break
        if item.is_symlink():
            raise ValueError('源码导出不接受符号链接')
    if not path.is_file():
        raise ValueError('源码清单中存在缺失文件')
    return path


def private_values():
    values = []
    env = ROOT / '.env'
    if env.exists():
        for line in env.read_text().splitlines():
            if line.strip().startswith('LINX_API_KEY='):
                value = line.split('=', 1)[1].strip().strip('\"\'')
                if value:
                    values.append(value)
    state_path = ROOT / '.linx/players.json'
    if state_path.exists():
        def visit(obj):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if key in {'installationId', 'agentId', 'deviceId', 'clientId', 'token'}:
                        if isinstance(value, str) and value:
                            values.append(value)
                    else:
                        visit(value)
            elif isinstance(obj, list):
                for value in obj:
                    visit(value)
        visit(json.loads(state_path.read_text()))
    return [value.encode() for value in values]


def main():
    paths = [require_regular(ROOT / name) for name in ROOT_FILES]
    for name, extensions in SOURCE_DIRS.items():
        directory = ROOT / name
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError('源码目录缺失或为符号链接')
        for path in sorted(directory.rglob('*')):
            if path.is_symlink():
                raise ValueError('源码导出不接受符号链接')
            if path.is_file() and path.suffix in extensions:
                paths.append(require_regular(path))
    secrets = private_values()
    entries = []
    for path in paths:
        data = path.read_bytes()
        # Also reject accidentally pasted Linx keys even without a local .env.
        if re.search(rb'lx-[0-9a-fA-F]{40,}', data) or any(s in data for s in secrets):
            raise ValueError('源码含有密钥或私有设备标识，已取消导出')
        if re.search(rb'LINX_API_KEY\s*=\s*[^\s#]', data) and path.name == '.env.example':
            raise ValueError('示例配置必须使用空密钥')
        entries.append((path.relative_to(ROOT), data))

    dist = ROOT / 'dist'
    if dist.is_symlink():
        raise ValueError('导出目录不接受符号链接')
    dist.mkdir(exist_ok=True)
    destination = dist / 'moonveil-source'
    archive = dist / 'moonveil-source.zip'
    if destination.is_symlink() or archive.is_symlink():
        raise ValueError('导出目标不接受符号链接')
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
        for relative, data in entries:
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            output.writestr(relative.as_posix(), data)
    with zipfile.ZipFile(archive) as output:
        if output.testzip() is not None:
            raise ValueError('源码 ZIP 校验失败')
    print(f'已导出 {len(entries)} 个源码文件；密钥与账号资源检查通过。')
    print('dist/moonveil-source/\ndist/moonveil-source.zip')


if __name__ == '__main__':
    main()
