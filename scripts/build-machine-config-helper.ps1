$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$venvPath = Join-Path $repoRoot '.cache\machine-config-python'
$workPath = Join-Path $repoRoot '.cache\machine-config-build'
$distPath = Join-Path $workPath 'dist'
$specPath = Join-Path $repoRoot 'scripts\machine-config-helper.spec'
$requirementsPath = Join-Path $repoRoot 'scripts\requirements-device-sync.txt'
$stagePath = Join-Path $repoRoot 'build\machine-config'
$stageExePath = Join-Path $stagePath 'machine-config-helper.exe'

function Resolve-PythonCommand {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return @('py', '-3')
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return @('python')
  }

  throw 'Khong tim thay Python de build machine-config helper'
}

if (-not (Test-Path $venvPath)) {
  $pythonCommand = Resolve-PythonCommand
  & $pythonCommand[0] @($pythonCommand[1..($pythonCommand.Length - 1)]) -m venv $venvPath
}

$pythonExe = Join-Path $venvPath 'Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
  throw "Khong tim thay python.exe trong virtualenv: $pythonExe"
}

New-Item -ItemType Directory -Force -Path $workPath | Out-Null
New-Item -ItemType Directory -Force -Path $stagePath | Out-Null

& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install -r $requirementsPath
& $pythonExe -m PyInstaller --noconfirm --clean --distpath $distPath --workpath (Join-Path $workPath 'work') $specPath

$builtExePath = Join-Path $distPath 'machine-config-helper.exe'
if (-not (Test-Path $builtExePath)) {
  throw "Khong tim thay helper binary sau khi build: $builtExePath"
}

Copy-Item -Force $builtExePath $stageExePath
Write-Host "Staged machine config helper to $stageExePath"
