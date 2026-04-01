param(
  [string]$Ip = '10.60.1.5',
  [int]$Port = 4370,
  [int]$Password = 938948,
  [int]$StateMode = 2,
  [switch]$SkipStateMode,
  [string]$PythonExe = 'python',
  [string]$ShortkeyToolPath = (Join-Path $PSScriptRoot 'zk-shortkey-tool.ps1'),
  [string]$SsrToolPath = (Join-Path $PSScriptRoot 'zk-ssr-device-data-tool.ps1'),
  [string]$StateModeScriptPath = (Join-Path $PSScriptRoot 'zk-state-mode.py')
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$ShortkeyShell = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"

$schedule = @(
  [ordered]@{
    shortKeyId = 1
    stateCode = 0
    funcName = 'state0'
    autoChangeTime = '00:00;00:00;00:00;00:00;00:00;00:00;00:00'
  },
  [ordered]@{
    shortKeyId = 5
    stateCode = 2
    funcName = 'state2'
    autoChangeTime = '11:30;11:30;11:30;11:30;11:30;00:00;00:00'
  },
  [ordered]@{
    shortKeyId = 6
    stateCode = 3
    funcName = 'state3'
    autoChangeTime = '13:00;13:00;13:00;13:00;13:00;00:00;00:00'
  },
  [ordered]@{
    shortKeyId = 2
    stateCode = 1
    funcName = 'state1'
    autoChangeTime = '17:00;17:00;17:00;17:00;17:00;00:00;00:00'
  }
)

function Invoke-JsonCommand {
  param(
    [scriptblock]$Command,
    [string]$ErrorMessage
  )

  $output = & $Command
  if ($LASTEXITCODE -ne 0) {
    throw $ErrorMessage
  }

  return $output | ConvertFrom-Json
}

function Invoke-ShortkeyTool {
  param([string[]]$ToolArguments)

  return & $ShortkeyShell -NoProfile -ExecutionPolicy Bypass -File $ShortkeyToolPath @ToolArguments
}

function Invoke-SsrTool {
  param([string[]]$ToolArguments)

  return & $ShortkeyShell -NoProfile -ExecutionPolicy Bypass -File $SsrToolPath @ToolArguments
}

function Get-OptionalPropertyValue {
  param(
    [psobject]$Object,
    [string]$Name
  )

  $property = $Object.PSObject.Properties[$Name]
  if ($property) {
    return [string]$property.Value
  }

  return ''
}

function Get-CurrentShortkeys {
  return Invoke-JsonCommand -ErrorMessage 'Cannot read current shortkey config.' -Command {
    Invoke-ShortkeyTool -ToolArguments @('get', '--ip', $Ip, '--port', "$Port", '--password', "$Password")
  }
}

function Get-SsrRows {
  param(
    [string]$Table,
    [string]$Filter = ''
  )

  $result = Invoke-JsonCommand -ErrorMessage "Cannot read table '$Table'." -Command {
    $arguments = @('get', '--ip', $Ip, '--port', "$Port", '--password', "$Password", '--table', $Table)
    if (-not [string]::IsNullOrWhiteSpace($Filter)) {
      $arguments += @('--filter', $Filter)
    }
    Invoke-SsrTool -ToolArguments $arguments
  }

  return @($result.rows)
}

function Add-OptionalArgument {
  param(
    [System.Collections.Generic.List[string]]$Arguments,
    [string]$Name,
    [string]$Value
  )

  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    $Arguments.Add($Name)
    $Arguments.Add($Value)
  }
}

function Set-ShortkeySchedule {
  param([pscustomobject]$CurrentConfig)

  $updated = @()

  foreach ($target in $schedule) {
    $currentKey = @($CurrentConfig.shortKeys | Where-Object { $_.shortKeyId -eq $target.shortKeyId })[0]
    if (-not $currentKey) {
      throw "Shortcut key $($target.shortKeyId) is not available on this device."
    }

    $result = Invoke-JsonCommand -ErrorMessage "Cannot update shortcut key $($target.shortKeyId)." -Command {
      $toolArguments = [System.Collections.Generic.List[string]]::new()
      foreach ($token in @(
        'set',
        '--ip',
        $Ip,
        '--port',
        "$Port",
        '--password',
        "$Password",
        '--shortKeyId',
        "$($target.shortKeyId)",
        '--shortKeyFun',
        "$($currentKey.shortKeyFun)",
        '--stateCode',
        "$($target.stateCode)",
        '--stateName',
        (Get-OptionalPropertyValue -Object $currentKey -Name 'stateName'),
        '--autoChange',
        '1',
        '--autoChangeTime',
        $target.autoChangeTime
      )) {
        $toolArguments.Add([string]$token)
      }

      Add-OptionalArgument -Arguments $toolArguments -Name '--shortKeyName' -Value (Get-OptionalPropertyValue -Object $currentKey -Name 'shortKeyName')
      Add-OptionalArgument -Arguments $toolArguments -Name '--functionName' -Value (Get-OptionalPropertyValue -Object $currentKey -Name 'functionName')
      Add-OptionalArgument -Arguments $toolArguments -Name '--description' -Value (Get-OptionalPropertyValue -Object $currentKey -Name 'description')

      Invoke-ShortkeyTool -ToolArguments $toolArguments
    }

    $updated += @($result.shortKeys)[0]
  }

  return $updated
}

function Set-SsrRow {
  param(
    [string]$Table,
    [hashtable]$Row,
    [string]$VerifyFilter
  )

  $data = @(
    foreach ($entry in $Row.GetEnumerator()) {
      "$($entry.Key)=$($entry.Value)"
    }
  ) -join "`t"

  return Invoke-JsonCommand -ErrorMessage "Cannot update table '$Table'." -Command {
    Invoke-SsrTool -ToolArguments @(
      'set',
      '--ip',
      $Ip,
      '--port',
      "$Port",
      '--password',
      "$Password",
      '--table',
      $Table,
      '--data',
      $data,
      '--verifyFilter',
      $VerifyFilter
    )
  }
}

function Set-SsrSchedule {
  $stateRows = @{}
  foreach ($row in (Get-SsrRows -Table 'statekey')) {
    $stateRows[[string]$row.statecode] = $row
  }

  $timeZoneByFunc = @{}
  foreach ($row in (Get-SsrRows -Table 'statelist')) {
    $funcName = [string]$row.funcname
    if (-not [string]::IsNullOrWhiteSpace($funcName) -and -not $timeZoneByFunc.ContainsKey($funcName)) {
      $timeZoneByFunc[$funcName] = [string]$row.statetimezonename
    }
  }

  $results = [ordered]@{
    stateKeys = @()
    timeZones = @()
  }

  foreach ($target in $schedule) {
    $stateCode = [string]$target.stateCode
    $funcName = [string]$target.funcName
    $currentState = $stateRows[$stateCode]
    if (-not $currentState) {
      throw "Missing statekey row for stateCode=$stateCode."
    }

    $timeZoneName = $timeZoneByFunc[$funcName]
    if ([string]::IsNullOrWhiteSpace($timeZoneName)) {
      throw "Missing statelist mapping for funcName=$funcName."
    }

    $stateResult = Set-SsrRow -Table 'statekey' -VerifyFilter "statecode=$stateCode" -Row ([ordered]@{
      statecode = $stateCode
      funcname = $funcName
      statename = [string]$currentState.statename
      autochange = 1
      mon = 1
      tue = 1
      wed = 1
      thu = 1
      fri = 1
      sat = 0
      sun = 0
    })
    $results.stateKeys += @($stateResult.rows)

    $parts = @($target.autoChangeTime.TrimEnd(';').Split(';'))
    $timeZoneResult = Set-SsrRow -Table 'statetimezone' -VerifyFilter "statetimezonename=$timeZoneName" -Row ([ordered]@{
      statetimezonename = $timeZoneName
      montime = $parts[0].Replace(':', '')
      tuetime = $parts[1].Replace(':', '')
      wedtime = $parts[2].Replace(':', '')
      thutime = $parts[3].Replace(':', '')
      fritime = $parts[4].Replace(':', '')
      sattime = $parts[5].Replace(':', '')
      suntime = $parts[6].Replace(':', '')
    })
    $results.timeZones += @($timeZoneResult.rows)
  }

  return $results
}

function Set-DeviceStateMode {
  if ($SkipStateMode) {
    return $null
  }

  return Invoke-JsonCommand -ErrorMessage "Cannot set StateMode=$StateMode." -Command {
    & $PythonExe $StateModeScriptPath --ip $Ip --port $Port --password $Password --mode $StateMode
  }
}

$useFakeShortkeyPath = -not [string]::IsNullOrWhiteSpace($env:ZK_SHORTKEY_FAKE_STATE_PATH)
$currentConfig = Get-CurrentShortkeys
$ssrResult = $null

if ($useFakeShortkeyPath) {
  $updatedShortkeys = Set-ShortkeySchedule -CurrentConfig $currentConfig
} else {
  $ssrResult = Set-SsrSchedule
  $updatedShortkeys = @()
}

$stateModeResult = Set-DeviceStateMode
$finalConfig = Get-CurrentShortkeys

[ordered]@{
  deviceIp = $Ip
  devicePort = $Port
  deviceName = $finalConfig.deviceName
  appliedPreset = 'hanh-chanh-auto-switch'
  stateMode = if ($stateModeResult) { $stateModeResult.updatedMode } else { $null }
  shortKeys = @($finalConfig.shortKeys)
  stateKeys = if ($ssrResult) { @($ssrResult.stateKeys) } else { @() }
  timeZones = if ($ssrResult) { @($ssrResult.timeZones) } else { @() }
} | ConvertTo-Json -Depth 8
