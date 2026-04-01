param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:DefaultSdkDir = Join-Path $script:RepoRoot '.tmp\Standalone-SDK\Communication Protocol SDK(32Bit Ver6.2.4.11)\sdk'
$script:DefaultState = [ordered]@{
  deviceIp = '10.60.1.5'
  deviceName = 'Mock ZK'
  shortKeys = @(
    [ordered]@{
      shortKeyId = 1
      shortKeyFun = 1
      stateCode = 0
      stateName = 'Check In'
      autoChange = 1
      autoChangeTime = '07:30;07:30;07:30;07:30;07:30;00:00;00:00;'
    },
    [ordered]@{
      shortKeyId = 2
      shortKeyFun = 1
      stateCode = 1
      stateName = 'Check Out'
      autoChange = 1
      autoChangeTime = '11:30;11:30;11:30;11:30;11:30;00:00;00:00;'
    },
    [ordered]@{
      shortKeyId = 3
      shortKeyFun = 1
      stateCode = 2
      stateName = 'Break In'
      autoChange = 1
      autoChangeTime = '13:00;13:00;13:00;13:00;13:00;00:00;00:00;'
    },
    [ordered]@{
      shortKeyId = 4
      shortKeyFun = 1
      stateCode = 3
      stateName = 'Break Out'
      autoChange = 1
      autoChangeTime = '17:00;17:00;17:00;17:00;17:00;00:00;00:00;'
    }
  )
}

function Fail-Tool {
  param([string]$Message)

  throw $Message
}

function ConvertTo-PlainObject {
  param([object]$Value)

  $json = $Value | ConvertTo-Json -Depth 8 -Compress
  return ConvertFrom-JsonObject -Value ($json | ConvertFrom-Json)
}

function ConvertFrom-JsonObject {
  param([object]$Value)

  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string] -and $Value -isnot [System.Collections.IDictionary]) {
    $items = @()
    foreach ($item in $Value) {
      $items += ,(ConvertFrom-JsonObject -Value $item)
    }
    return $items
  }

  if ($Value -is [pscustomobject]) {
    $result = @{}
    foreach ($property in $Value.PSObject.Properties) {
      $result[$property.Name] = ConvertFrom-JsonObject -Value $property.Value
    }
    return $result
  }

  return $Value
}

function Get-OptionValue {
  param(
    [hashtable]$Options,
    [string]$Name,
    [object]$Default = $null
  )

  if ($Options.ContainsKey($Name)) {
    return $Options[$Name]
  }

  return $Default
}

function Parse-Arguments {
  param([string[]]$Tokens)

  if (-not $Tokens -or $Tokens.Count -eq 0) {
    Fail-Tool 'Usage: zk-shortkey-tool.ps1 <get|set> [--ip <ip>] [--port <port>] [--password <password>] [...]'
  }

  $command = $Tokens[0].ToLowerInvariant()
  if ($command -ne 'get' -and $command -ne 'set') {
    Fail-Tool "Unsupported command '$($Tokens[0])'. Expected 'get' or 'set'."
  }

  $options = @{}
  $index = 1

  while ($index -lt $Tokens.Count) {
    $token = $Tokens[$index]
    if (-not $token.StartsWith('--')) {
      Fail-Tool "Unexpected argument '$token'."
    }

    $name = $token.Substring(2)
    $index += 1

    if ($index -ge $Tokens.Count) {
      Fail-Tool "Missing value for '--$name'."
    }

    $options[$name] = $Tokens[$index]
    $index += 1
  }

  return @{
    command = $command
    options = $options
  }
}

function Read-FakeState {
  param(
    [string]$Path,
    [string]$DeviceIp
  )

  if (-not $Path) {
    return (ConvertTo-PlainObject $script:DefaultState)
  }

  if (-not (Test-Path -LiteralPath $Path)) {
    $state = ConvertTo-PlainObject $script:DefaultState
    $state['deviceIp'] = $DeviceIp
    return $state
  }

  return ConvertFrom-JsonObject -Value (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}

function Write-FakeState {
  param(
    [string]$Path,
    [hashtable]$State
  )

  if (-not $Path) {
    return
  }

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-RequiredOption {
  param(
    [hashtable]$Options,
    [string]$Name
  )

  $value = Get-OptionValue -Options $Options -Name $Name
  if ([string]::IsNullOrWhiteSpace([string]$value)) {
    Fail-Tool "Missing required option '--$Name'."
  }

  return $value
}

function Invoke-FakeGet {
  param(
    [string]$StatePath,
    [string]$DeviceIp
  )

  $state = Read-FakeState -Path $StatePath -DeviceIp $DeviceIp
  $state['deviceIp'] = $DeviceIp
  return $state
}

function Invoke-FakeSet {
  param(
    [hashtable]$Options,
    [string]$StatePath,
    [string]$DeviceIp
  )

  $state = Read-FakeState -Path $StatePath -DeviceIp $DeviceIp
  $shortKeyId = [int](Get-RequiredOption -Options $Options -Name 'shortKeyId')
  $stateCode = [int](Get-RequiredOption -Options $Options -Name 'stateCode')
  $stateName = [string](Get-RequiredOption -Options $Options -Name 'stateName')
  $autoChange = [int](Get-RequiredOption -Options $Options -Name 'autoChange')
  $autoChangeTime = [string](Get-RequiredOption -Options $Options -Name 'autoChangeTime')
  $shortKeyFun = [int](Get-OptionValue -Options $Options -Name 'shortKeyFun' -Default 1)

  $shortKeys = @($state['shortKeys'])
  $existingIndex = -1

  for ($index = 0; $index -lt $shortKeys.Count; $index += 1) {
    if ([int]$shortKeys[$index]['shortKeyId'] -eq $shortKeyId) {
      $existingIndex = $index
      break
    }
  }

  $nextShortKey = [ordered]@{
    shortKeyId = $shortKeyId
    shortKeyFun = $shortKeyFun
    stateCode = $stateCode
    stateName = $stateName
    autoChange = $autoChange
    autoChangeTime = $autoChangeTime
  }

  if ($existingIndex -ge 0) {
    $shortKeys[$existingIndex] = $nextShortKey
  } else {
    $shortKeys += $nextShortKey
  }

  $state['deviceIp'] = $DeviceIp
  $state['shortKeys'] = @($shortKeys | Sort-Object { [int]$_.shortKeyId })
  Write-FakeState -Path $StatePath -State $state

  return [ordered]@{
    deviceIp = $DeviceIp
    deviceName = $state['deviceName']
    requestedShortKeyId = $shortKeyId
    shortKeys = $state['shortKeys']
  }
}

function Ensure-RealHostRequirements {
  param([string]$SdkDir)

  if ([IntPtr]::Size -ne 4) {
    Fail-Tool 'zkemkeeper.dll is 32-bit. Run this tool with SysWOW64 PowerShell.'
  }

  $dllPath = Join-Path $SdkDir 'zkemkeeper.dll'
  if (-not (Test-Path -LiteralPath $dllPath)) {
    Fail-Tool "Missing zkemkeeper.dll at '$dllPath'."
  }

  if (-not ($env:PATH -split ';' | Where-Object { $_ -eq $SdkDir })) {
    $env:PATH = "$SdkDir;$env:PATH"
  }

  return $dllPath
}

function New-RealSession {
  param(
    [string]$DeviceIp,
    [int]$Port,
    [int]$Password,
    [string]$SdkDir
  )

  $dllPath = Ensure-RealHostRequirements -SdkDir $SdkDir

  try {
    $zk = New-Object -ComObject 'zkemkeeper.ZKEM'
  } catch {
    Fail-Tool @"
Could not create COM object 'zkemkeeper.ZKEM'.
Run an elevated 32-bit PowerShell and register the bundled SDK first:
  $env:WINDIR\SysWOW64\regsvr32.exe "$dllPath"
"@
  }

  if ($Password -gt 0) {
    try {
      $zk.SetCommPassword($Password) | Out-Null
    } catch {
    }
  }

  $connected = $zk.Connect_Net($DeviceIp, $Port)
  if (-not $connected) {
    Fail-Tool "Failed to connect to device '${DeviceIp}:$Port'."
  }

  return $zk
}

function Disconnect-RealSession {
  param([object]$Zk)

  if (-not $Zk) {
    return
  }

  try {
    $Zk.Disconnect() | Out-Null
  } catch {
  }
}

function Get-DeviceName {
  param([object]$Zk)

  $deviceName = ''

  try {
    $success = $Zk.GetDeviceInfo(1, 1, [ref]$deviceName)
    if ($success -and -not [string]::IsNullOrWhiteSpace($deviceName)) {
      return $deviceName
    }
  } catch {
  }

  return $null
}

function ConvertTo-DisplayAutoChangeTime {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  $parts = $Value.Split(';') | Where-Object { $_ -ne '' }
  $normalized = foreach ($part in $parts) {
    if ($part -match '^\d{4}$') {
      "$($part.Substring(0, 2)):$($part.Substring(2, 2))"
    } else {
      $part
    }
  }

  if ($Value.EndsWith(';')) {
    return (($normalized -join ';') + ';')
  }

  return ($normalized -join ';')
}

function ConvertTo-DeviceAutoChangeTime {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  $parts = $Value.Split(';') | Where-Object { $_ -ne '' }
  $normalized = foreach ($part in $parts) {
    if ($part -match '^\d{2}:\d{2}$') {
      $part.Replace(':', '')
    } else {
      $part
    }
  }

  if ($Value.EndsWith(';')) {
    return (($normalized -join ';') + ';')
  }

  return ($normalized -join ';')
}

function Get-RealShortKey {
  param(
    [object]$Zk,
    [int]$ShortKeyId,
    [switch]$AllowMissing
  )

  $shortKeyName = ''
  $functionName = ''
  $shortKeyFun = 0
  $stateCode = 0
  $stateName = ''
  $description = ''
  $autoChange = 0
  $autoChangeTime = ''

  $ok = $Zk.GetShortkey(
    1,
    $ShortKeyId,
    [ref]$shortKeyName,
    [ref]$functionName,
    [ref]$shortKeyFun,
    [ref]$stateCode,
    [ref]$stateName,
    [ref]$description,
    [ref]$autoChange,
    [ref]$autoChangeTime
  )

  if (-not $ok) {
    if ($AllowMissing) {
      return $null
    }

    Fail-Tool "GetShortkey failed for ShortKeyID=$ShortKeyId."
  }

  return [ordered]@{
    shortKeyId = $ShortKeyId
    shortKeyName = [string]$shortKeyName
    functionName = [string]$functionName
    shortKeyFun = [int]$shortKeyFun
    stateCode = [int]$stateCode
    stateName = [string]$stateName
    description = [string]$description
    autoChange = [int]$autoChange
    autoChangeTime = ConvertTo-DisplayAutoChangeTime -Value ([string]$autoChangeTime)
  }
}

function Invoke-RealGet {
  param(
    [string]$DeviceIp,
    [int]$Port,
    [int]$Password,
    [string]$SdkDir
  )

  $zk = $null

  try {
    $zk = New-RealSession -DeviceIp $DeviceIp -Port $Port -Password $Password -SdkDir $SdkDir
    $shortKeys = 1..8 | ForEach-Object { Get-RealShortKey -Zk $zk -ShortKeyId $_ -AllowMissing } | Where-Object { $_ }
    return [ordered]@{
      deviceIp = $DeviceIp
      deviceName = Get-DeviceName -Zk $zk
      shortKeys = @($shortKeys)
    }
  } finally {
    Disconnect-RealSession -Zk $zk
  }
}

function Invoke-RealSet {
  param(
    [hashtable]$Options,
    [string]$DeviceIp,
    [int]$Port,
    [int]$Password,
    [string]$SdkDir
  )

  $shortKeyId = [int](Get-RequiredOption -Options $Options -Name 'shortKeyId')
  $stateCode = [int](Get-RequiredOption -Options $Options -Name 'stateCode')
  $stateName = [string](Get-RequiredOption -Options $Options -Name 'stateName')
  $autoChange = [int](Get-RequiredOption -Options $Options -Name 'autoChange')
  $autoChangeTime = ConvertTo-DeviceAutoChangeTime -Value ([string](Get-RequiredOption -Options $Options -Name 'autoChangeTime'))
  $shortKeyFun = [int](Get-OptionValue -Options $Options -Name 'shortKeyFun' -Default 1)
  $zk = $null

  try {
    $zk = New-RealSession -DeviceIp $DeviceIp -Port $Port -Password $Password -SdkDir $SdkDir
    $current = Get-RealShortKey -Zk $zk -ShortKeyId $shortKeyId
    $shortKeyName = [string](Get-OptionValue -Options $Options -Name 'shortKeyName' -Default $current['shortKeyName'])
    $functionName = [string](Get-OptionValue -Options $Options -Name 'functionName' -Default $current['functionName'])
    $description = [string](Get-OptionValue -Options $Options -Name 'description' -Default $current['description'])
    $ok = $zk.SetShortkey(
      1,
      $shortKeyId,
      $shortKeyName,
      $functionName,
      $shortKeyFun,
      $stateCode,
      $stateName,
      $description,
      $autoChange,
      $autoChangeTime
    )
    if (-not $ok) {
      $errorCode = 0
      $zk.GetLastError([ref]$errorCode) | Out-Null
      Fail-Tool "SetShortkey failed for ShortKeyID=$shortKeyId with error $errorCode."
    }

    $updatedShortKey = Get-RealShortKey -Zk $zk -ShortKeyId $shortKeyId
    return [ordered]@{
      deviceIp = $DeviceIp
      deviceName = Get-DeviceName -Zk $zk
      requestedShortKeyId = $shortKeyId
      shortKeys = @($updatedShortKey)
    }
  } finally {
    Disconnect-RealSession -Zk $zk
  }
}

try {
  $parsed = Parse-Arguments -Tokens $Arguments
  $options = $parsed['options']
  $deviceIp = [string](Get-OptionValue -Options $options -Name 'ip' -Default '10.60.1.5')
  $port = [int](Get-OptionValue -Options $options -Name 'port' -Default 4370)
  $password = [int](Get-OptionValue -Options $options -Name 'password' -Default 938948)
  $statePath = $env:ZK_SHORTKEY_FAKE_STATE_PATH
  $sdkDir = [string](Get-OptionValue -Options $options -Name 'sdkDir' -Default $script:DefaultSdkDir)
  $useFake = -not [string]::IsNullOrWhiteSpace($statePath)

  if ($parsed['command'] -eq 'get') {
    if ($useFake) {
      Invoke-FakeGet -StatePath $statePath -DeviceIp $deviceIp | ConvertTo-Json -Depth 8
    } else {
      Invoke-RealGet -DeviceIp $deviceIp -Port $port -Password $password -SdkDir $sdkDir | ConvertTo-Json -Depth 8
    }
    exit 0
  }

  if ($useFake) {
    Invoke-FakeSet -Options $options -StatePath $statePath -DeviceIp $deviceIp | ConvertTo-Json -Depth 8
  } else {
    Invoke-RealSet -Options $options -DeviceIp $deviceIp -Port $port -Password $password -SdkDir $sdkDir | ConvertTo-Json -Depth 8
  }

  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
