# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for TRACKR Python backend sidecar.
# Output lands in ui/trackr-ui/src-tauri/ with Tauri target-triple naming.

import os, platform

block_cipher = None

a = Analysis(
    ['python/trackr/run.py'],
    pathex=['python'],
    binaries=[],
    datas=[],
    hiddenimports=[
        'trackr',
        'trackr.api',
        'trackr.beatlink_bridge',
        'trackr.config',
        'trackr.core',
        'trackr.db',
        'trackr.device_bridge',
        'trackr.run',
        'trackr.session',
        'trackr.simulated_source',
        'trackr.template',
        'trackr.text_cleaner',
        'trackr.writer',
        'sqlite3',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, cipher=block_cipher)

# Tauri expects sidecar names with a target-triple suffix
target_triple = 'x86_64-pc-windows-msvc'
exe_name = f'trackr-backend-{target_triple}'

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=exe_name,
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
    icon='assets/Vinyl.ico',
)
