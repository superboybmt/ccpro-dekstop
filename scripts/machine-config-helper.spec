import os
from pathlib import Path

project_root = Path.cwd()
script_path = project_root / 'scripts' / 'machine-config-helper.py'
sdk_dir = Path(
    os.environ.get(
        'CCPRO_MACHINE_CONFIG_SDK_DIR',
        str(project_root / '.tmp' / 'Standalone-SDK' / 'Communication Protocol SDK(32Bit Ver6.2.4.11)' / 'sdk'),
    )
)
ssr_tool_path = project_root / 'scripts' / 'zk-ssr-device-data-tool.ps1'

a = Analysis(
    [str(script_path)],
    pathex=[str(project_root)],
    binaries=[],
    datas=[
        (str(ssr_tool_path), 'scripts'),
        (str(sdk_dir), 'sdk'),
    ],
    hiddenimports=[],
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
    a.binaries,
    a.datas,
    [],
    name='machine-config-helper',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
