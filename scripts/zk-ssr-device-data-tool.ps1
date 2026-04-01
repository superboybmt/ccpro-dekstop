param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:DefaultSdkDir = Join-Path $script:RepoRoot '.tmp\Standalone-SDK\Communication Protocol SDK(32Bit Ver6.2.4.11)\sdk'

function Fail-Tool {
  param([string]$Message)

  throw $Message
}

function Parse-Arguments {
  param([string[]]$Tokens)

  if (-not $Tokens -or $Tokens.Count -eq 0) {
    Fail-Tool 'Usage: zk-ssr-device-data-tool.ps1 <get|set|delete> [--ip <ip>] [--port <port>] [--password <password>] --table <table> [...]'
  }

  $command = $Tokens[0].ToLowerInvariant()
  if ($command -ne 'get' -and $command -ne 'set' -and $command -ne 'delete') {
    Fail-Tool "Unsupported command '$($Tokens[0])'. Expected 'get', 'set', or 'delete'."
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

function Get-RequiredOption {
  param(
    [hashtable]$Options,
    [string]$Name
  )

  $value = Get-OptionValue -Options $Options -Name $Name
  if ([string]::IsNullOrWhiteSpace([string]$value)) {
    Fail-Tool "Missing required option '--$Name'."
  }

  return [string]$value
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
}

function New-RealSession {
  param(
    [string]$DeviceIp,
    [int]$Port,
    [int]$Password,
    [string]$SdkDir
  )

  Ensure-RealHostRequirements -SdkDir $SdkDir

  try {
    $zk = New-Object -ComObject 'zkemkeeper.ZKEM'
  } catch {
    Fail-Tool "Could not create COM object 'zkemkeeper.ZKEM'."
  }

  if ($Password -gt 0) {
    try {
      $zk.SetCommPassword($Password) | Out-Null
    } catch {
    }
  }

  if (-not $zk.Connect_Net($DeviceIp, $Port)) {
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

function Convert-BufferToRows {
  param([string]$Buffer)

  if ([string]::IsNullOrWhiteSpace($Buffer)) {
    return @()
  }

  $normalized = $Buffer -replace "`r", ''
  $lines = @($normalized.Split("`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($lines.Count -lt 2) {
    return @()
  }

  return @($lines | ConvertFrom-Csv)
}

function Convert-RowToDataString {
  param([hashtable]$Row)

  $parts = [System.Collections.Generic.List[string]]::new()
  foreach ($key in $Row.Keys) {
    $parts.Add("$key=$($Row[$key])")
  }
  return ($parts -join "`t")
}

function Invoke-RealGet {
  param(
    [string]$DeviceIp,
    [int]$Port,
    [int]$Password,
    [string]$SdkDir,
    [hashtable]$Options
  )

  $table = Get-RequiredOption -Options $Options -Name 'table'
  $fields = [string](Get-OptionValue -Options $Options -Name 'fields' -Default '*')
  $filter = [string](Get-OptionValue -Options $Options -Name 'filter' -Default '')
  $optionsString = [string](Get-OptionValue -Options $Options -Name 'queryOptions' -Default '')
  $bufferSize = [int](Get-OptionValue -Options $Options -Name 'bufferSize' -Default 16384)
  $zk = $null

  try {
    $zk = New-RealSession -DeviceIp $DeviceIp -Port $Port -Password $Password -SdkDir $SdkDir
    $buffer = ''
    $ok = $zk.SSR_GetDeviceData(1, [ref]$buffer, $bufferSize, $table, $fields, $filter, $optionsString)
    $errorCode = 0
    $zk.GetLastError([ref]$errorCode) | Out-Null

    if (-not $ok) {
      Fail-Tool "SSR_GetDeviceData failed for table '$table' with error $errorCode."
    }

    return [ordered]@{
      deviceIp = $DeviceIp
      deviceName = Get-DeviceName -Zk $zk
      table = $table
      fields = $fields
      filter = $filter
      rows = @(Convert-BufferToRows -Buffer $buffer)
    }
  } finally {
    Disconnect-RealSession -Zk $zk
  }
}

function Invoke-RealSet {
  param(
    [string]$DeviceIp,
    [int]$Port,
    [int]$Password,
    [string]$SdkDir,
    [hashtable]$Options
  )

  $table = Get-RequiredOption -Options $Options -Name 'table'
  $data = [string](Get-OptionValue -Options $Options -Name 'data' -Default '')
  $dataB64 = [string](Get-OptionValue -Options $Options -Name 'dataB64' -Default '')
  
  if (-not [string]::IsNullOrWhiteSpace($dataB64)) {
    $bytes = [System.Convert]::FromBase64String($dataB64)
    $data = [System.Text.Encoding]::UTF8.GetString($bytes)
  }

  if ([string]::IsNullOrWhiteSpace($data)) {
    Fail-Tool "Missing required option '--data' or '--dataB64'."
  }

  $setOptions = [string](Get-OptionValue -Options $Options -Name 'setOptions' -Default '')
  $verifyFilter = [string](Get-OptionValue -Options $Options -Name 'verifyFilter' -Default '')
  $verifyFields = [string](Get-OptionValue -Options $Options -Name 'verifyFields' -Default '*')
  $zk = $null

  try {
    $zk = New-RealSession -DeviceIp $DeviceIp -Port $Port -Password $Password -SdkDir $SdkDir
    $ok = $zk.SSR_SetDeviceData(1, $table, $data, $setOptions)
    $errorCode = 0
    $zk.GetLastError([ref]$errorCode) | Out-Null

    if (-not $ok) {
      Fail-Tool "SSR_SetDeviceData failed for table '$table' with error $errorCode."
    }

    $rows = @()
    if (-not [string]::IsNullOrWhiteSpace($verifyFilter)) {
      $buffer = ''
      $readOk = $zk.SSR_GetDeviceData(1, [ref]$buffer, 16384, $table, $verifyFields, $verifyFilter, '')
      $readErrorCode = 0
      $zk.GetLastError([ref]$readErrorCode) | Out-Null
      if (-not $readOk) {
        Fail-Tool "SSR_GetDeviceData verify failed for table '$table' with error $readErrorCode."
      }
      $rows = @(Convert-BufferToRows -Buffer $buffer)
    }

    return [ordered]@{
      deviceIp = $DeviceIp
      deviceName = Get-DeviceName -Zk $zk
      table = $table
      data = $data
      rows = $rows
    }
  } finally {
    Disconnect-RealSession -Zk $zk
  }
}

function Invoke-RealDelete {
  param(
    [string]$DeviceIp,
    [int]$Port,
    [int]$Password,
    [string]$SdkDir,
    [hashtable]$Options
  )

  $table = Get-RequiredOption -Options $Options -Name 'table'
  $data = [string](Get-OptionValue -Options $Options -Name 'data' -Default '')
  $dataB64 = [string](Get-OptionValue -Options $Options -Name 'dataB64' -Default '')
  
  if (-not [string]::IsNullOrWhiteSpace($dataB64)) {
    $bytes = [System.Convert]::FromBase64String($dataB64)
    $data = [System.Text.Encoding]::UTF8.GetString($bytes)
  }

  if ([string]::IsNullOrWhiteSpace($data)) {
    Fail-Tool "Missing required option '--data' or '--dataB64'."
  }

  $deleteOptions = [string](Get-OptionValue -Options $Options -Name 'deleteOptions' -Default '')
  $verifyFilter = [string](Get-OptionValue -Options $Options -Name 'verifyFilter' -Default '')
  $verifyFields = [string](Get-OptionValue -Options $Options -Name 'verifyFields' -Default '*')
  $zk = $null

  try {
    $zk = New-RealSession -DeviceIp $DeviceIp -Port $Port -Password $Password -SdkDir $SdkDir
    $ok = $zk.SSR_DeleteDeviceData(1, $table, $data, $deleteOptions)
    $errorCode = 0
    $zk.GetLastError([ref]$errorCode) | Out-Null

    if (-not $ok) {
      Fail-Tool "SSR_DeleteDeviceData failed for table '$table' with error $errorCode."
    }

    $rows = @()
    if (-not [string]::IsNullOrWhiteSpace($verifyFilter)) {
      $buffer = ''
      $readOk = $zk.SSR_GetDeviceData(1, [ref]$buffer, 16384, $table, $verifyFields, $verifyFilter, '')
      $readErrorCode = 0
      $zk.GetLastError([ref]$readErrorCode) | Out-Null
      if ($readOk) {
        $rows = @(Convert-BufferToRows -Buffer $buffer)
      }
    }

    return [ordered]@{
      deviceIp = $DeviceIp
      deviceName = Get-DeviceName -Zk $zk
      table = $table
      data = $data
      rows = $rows
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
  $sdkDir = [string](Get-OptionValue -Options $options -Name 'sdkDir' -Default $script:DefaultSdkDir)

  if ($parsed['command'] -eq 'get') {
    $result = Invoke-RealGet -DeviceIp $deviceIp -Port $port -Password $password -SdkDir $sdkDir -Options $options
  } elseif ($parsed['command'] -eq 'set') {
    $result = Invoke-RealSet -DeviceIp $deviceIp -Port $port -Password $password -SdkDir $sdkDir -Options $options
  } else {
    $result = Invoke-RealDelete -DeviceIp $deviceIp -Port $port -Password $password -SdkDir $sdkDir -Options $options
  }

  $result | ConvertTo-Json -Depth 8
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
