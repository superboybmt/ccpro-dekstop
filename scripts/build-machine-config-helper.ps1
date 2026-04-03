$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$venvPath = Join-Path $repoRoot '.cache\machine-config-python'
$workPath = Join-Path $repoRoot '.cache\machine-config-build'
$distPath = Join-Path $workPath 'dist'
$sdkPayloadPath = Join-Path $workPath 'sdk-payload'
$specPath = Join-Path $repoRoot 'scripts\machine-config-helper.spec'
$requirementsPath = Join-Path $repoRoot 'scripts\requirements-device-sync.txt'
$stagePath = Join-Path $repoRoot 'build\machine-config'
$stageExePath = Join-Path $stagePath 'machine-config-helper.exe'
$fallbackSdkPath = Join-Path $repoRoot '.tmp\Standalone-SDK\Communication Protocol SDK(32Bit Ver6.2.4.11)\sdk'
$installedSdkPath = 'C:\WiseEyeOn39Plus'
$machineConfigSdkFiles = @(
  'zkemkeeper.dll',
  'zkemsdk.dll',
  'commpro.dll',
  'comms.dll',
  'plcommpro.dll',
  'plcomms.dll',
  'plrscagent.dll',
  'plrscomm.dll',
  'pltcpcomm.dll',
  'plusbcomm.dll',
  'rscagent.dll',
  'rscomm.dll',
  'tcpcomm.dll',
  'usbcomm.dll',
  'usbstd.dll',
  'WiseEyeExtDevice.dll',
  'WseReff.dll',
  'ZKCommuCryptoClient.dll',
  'stdole.dll'
)
$vb6RuntimeCandidates = @(
  (Join-Path $env:WINDIR 'SysWOW64\MSVBVM60.DLL'),
  (Join-Path $env:WINDIR 'System32\MSVBVM60.DLL')
)

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

function Resolve-MachineConfigSdkDir {
  if (-not [string]::IsNullOrWhiteSpace($env:CCPRO_MACHINE_CONFIG_SDK_DIR)) {
    $configuredPath = $env:CCPRO_MACHINE_CONFIG_SDK_DIR
    if (Test-Path (Join-Path $configuredPath 'zkemkeeper.dll')) {
      return $configuredPath
    }

    throw "CCPRO_MACHINE_CONFIG_SDK_DIR does not contain zkemkeeper.dll: $configuredPath"
  }

  if (Test-Path (Join-Path $installedSdkPath 'zkemkeeper.dll')) {
    return $installedSdkPath
  }

  if (Test-Path (Join-Path $fallbackSdkPath 'zkemkeeper.dll')) {
    return $fallbackSdkPath
  }

  throw 'Khong tim thay SDK cho machine-config helper'
}

function Stage-MachineConfigSdkPayload {
  param([string]$SourcePath)

  if (Test-Path $sdkPayloadPath) {
    Remove-Item -Recurse -Force $sdkPayloadPath
  }

  New-Item -ItemType Directory -Force -Path $sdkPayloadPath | Out-Null

  foreach ($fileName in $machineConfigSdkFiles) {
    $sourceFile = Join-Path $SourcePath $fileName
    if (Test-Path $sourceFile) {
      Copy-Item -Path $sourceFile -Destination (Join-Path $sdkPayloadPath $fileName) -Force
    }
  }

  if (-not (Test-Path (Join-Path $sdkPayloadPath 'zkemkeeper.dll'))) {
    throw "Khong stage duoc zkemkeeper.dll tu SDK source: $SourcePath"
  }

  $vb6RuntimePath = $vb6RuntimeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($vb6RuntimePath) {
    Copy-Item -Path $vb6RuntimePath -Destination (Join-Path $sdkPayloadPath 'MSVBVM60.DLL') -Force
    Write-Host "Bundled VB6 runtime from $vb6RuntimePath"
  }

  return $sdkPayloadPath
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
$env:CCPRO_MACHINE_CONFIG_SDK_DIR = Stage-MachineConfigSdkPayload (Resolve-MachineConfigSdkDir)
Write-Host "Using machine-config SDK from $env:CCPRO_MACHINE_CONFIG_SDK_DIR"
& $pythonExe -m PyInstaller --noconfirm --clean --distpath $distPath --workpath (Join-Path $workPath 'work') $specPath

$builtExePath = Join-Path $distPath 'machine-config-helper.exe'
if (-not (Test-Path $builtExePath)) {
  throw "Khong tim thay helper binary sau khi build: $builtExePath"
}

Copy-Item -Force $builtExePath $stageExePath
Write-Host "Staged machine config helper to $stageExePath"
