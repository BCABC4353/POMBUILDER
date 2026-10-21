from PyInstaller.utils.hooks import collect_all

_d1, _b1, _h1 = collect_all("pymupdf")
_d2, _b2, _h2 = collect_all("fitz")

a = Analysis(
    ["pom_helper.py"],
    pathex=["."],
    binaries=_b1 + _b2,
    datas=_d1 + _d2 + [("pcs forms", "pcs forms"), ("config", "config")],
    hiddenimports=_h1 + _h2 + [
        "pcs",
        "pcs.rescuenet",
        "pcs.mapping",
        "pcs.clock",
        "pcs.county",
        "pcs.letter",
        "pcs.emit",
        "pcs.geometry",
        "pcs.overlay",
        "pcs.populate",
        "pcs.selector",
        "pcs.service",
        "pcs.template",
        "pcs.forms",
        "pcs.calibrate",
        "pcs.cli",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="pom_helper",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="pom_helper",
)
