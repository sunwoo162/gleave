from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


spec_dir = Path(SPECPATH).resolve()
eeee_root = spec_dir.parent / "eeee"
static_dir = eeee_root / "app" / "static"

hiddenimports = [
    "app.desktop.__main__",
    "app.main",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]
hiddenimports.extend(collect_submodules("pydantic_settings"))

a = Analysis(
    [str(eeee_root / "app" / "desktop" / "__main__.py")],
    pathex=[str(eeee_root)],
    binaries=[],
    datas=[(str(static_dir), "app/static")],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="GleaveDesktop",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
)
