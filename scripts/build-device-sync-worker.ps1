$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$venvPath = Join-Path $repoRoot '.cache\device-sync-python'
$workPath = Join-Path $repoRoot '.cache\device-sync-build'
$distPath = Join-Path $workPath 'dist'
$specPath = Join-Path $repoRoot 'scripts\device-sync-worker.spec'
$requirementsPath = Join-Path $repoRoot 'scripts\requirements-device-sync.txt'
$stagePath = Join-Path $repoRoot 'build\device-sync'
$stageExePath = Join-Path $stagePath 'device-sync-worker.exe'

function Resolve-PythonCommand {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return @('py', '-3')
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return @('python')
  }

  throw 'Khong tim thay Python de build device-sync worker'
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

$builtExePath = Join-Path $distPath 'device-sync-worker.exe'
if (-not (Test-Path $builtExePath)) {
  throw "Khong tim thay worker binary sau khi build: $builtExePath"
}

Copy-Item -Force $builtExePath $stageExePath
Write-Host "Staged device sync worker to $stageExePath"
