# Windows PowerShell 5.1+; the app runs without Node/npm/Git in PATH.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallerPath,
    [Parameter(Mandatory)][string]$Version,
    [string]$EvidenceDirectory = 'test-results/windows-smoke',
    [switch]$AsDisposableUser,
    [switch]$RequireSignature,
    [string]$PublisherName
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
trap {
    Write-Error $_ -ErrorAction Continue
    Write-Output $_.ScriptStackTrace
    exit 1
}
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'This smoke requires native Windows.' }
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$EvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

function ConvertTo-QuotedArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains("`n") -or $Value.Contains("`r")) { throw 'Invalid argument' }
    return '"' + $Value + '"'
}

# Hosted runners are administrators. Only provisioning/cleanup runs elevated;
# installation and the real app run under a fresh, non-administrator account.
if ($AsDisposableUser) {
    if (!$isAdmin) { throw 'Disposable user provisioning requires an administrator. Omit -AsDisposableUser as a standard user.' }
    $userName = 'LB Smoke ' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $root = Join-Path $env:PUBLIC $userName
    $user = $null
    $child = $null
    $userProfileRecord = $null
    try {
        $password = [Security.SecureString]::new()
        ('Lb!9' + [Guid]::NewGuid().ToString('N')).ToCharArray() | ForEach-Object { $password.AppendChar($_) }
        $password.MakeReadOnly()
        $user = New-LocalUser -Name $userName -Password $password -AccountNeverExpires
        Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $user
        New-Item -ItemType Directory -Path $root | Out-Null
        & icacls.exe $root /grant "*$($user.SID.Value):(OI)(CI)M" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Cannot grant the disposable user access to smoke files' }
        Copy-Item -LiteralPath $InstallerPath -Destination (Join-Path $root installer.exe)
        Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $root smoke-windows.ps1)
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File ' + (ConvertTo-QuotedArgument (Join-Path $root smoke-windows.ps1)) +
            ' -InstallerPath ' + (ConvertTo-QuotedArgument (Join-Path $root installer.exe)) +
            ' -Version ' + (ConvertTo-QuotedArgument $Version) + ' -EvidenceDirectory ' + (ConvertTo-QuotedArgument (Join-Path $root evidence))
        if ($RequireSignature) { $arguments += ' -RequireSignature -PublisherName ' + (ConvertTo-QuotedArgument $PublisherName) }
        $credential = [PSCredential]::new("$env:COMPUTERNAME\$userName", $password)
        $powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
        $child = Start-Process -FilePath $powershell -ArgumentList $arguments -Credential $credential -LoadUserProfile -WorkingDirectory $root -RedirectStandardOutput (Join-Path $root child.stdout.log) -RedirectStandardError (Join-Path $root child.stderr.log) -PassThru
        $null = $child.Handle
        if (!$child.WaitForExit(360000)) { throw 'Standard-user smoke exceeded six minutes' }
        $child.Refresh()
        if ($child.ExitCode -ne 0) { throw "Standard-user smoke failed (exit $($child.ExitCode))" }
        if (!(Test-Path (Join-Path $root evidence/smoke.json))) { throw 'Missing smoke success evidence' }
    } finally {
        if ($child -and !$child.HasExited) { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue }
        Get-ChildItem -LiteralPath $root -Filter 'child.*.log' -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $EvidenceDirectory; Get-Content -LiteralPath $_.FullName }
        if (Test-Path (Join-Path $root evidence)) { Copy-Item -Path (Join-Path $root 'evidence/*') -Destination $EvidenceDirectory -Recurse -Force }
        if ($user) {
            # A timed-out app may still be alive. Match the unique account SID,
            # never a process name shared with another test or the desktop user.
            Get-CimInstance Win32_Process | ForEach-Object {
                $owner = Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid -ErrorAction SilentlyContinue
                if ($owner -and $owner.ReturnValue -eq 0 -and $owner.Sid -eq $user.SID.Value) { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            }
            if ($child) { $child.Dispose() }
            $userProfileRecord = Get-CimInstance Win32_UserProfile | Where-Object SID -EQ $user.SID.Value
            if ($userProfileRecord) { $userProfileRecord | Remove-CimInstance }
            Remove-LocalUser -SID $user.SID
        }
        if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
    }
    exit 0
}

if ($isAdmin) { throw 'Install/launch must run as a standard user, not an administrator.' }
if ($RequireSignature -and [string]::IsNullOrWhiteSpace($PublisherName)) { throw 'A production publisher is required.' }
$profilePath = (Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$($identity.User.Value)").ProfileImagePath
if ([string]::IsNullOrWhiteSpace($profilePath) -or !$profilePath.Contains(' ')) { throw 'Smoke requires a real user profile with spaces.' }
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
# Add-Type compiles under TEMP, which must belong to this account.
$env:TEMP = $env:TMP = Join-Path $profilePath 'AppData\Local\Temp'
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
Add-Type -Namespace LifeBoardSmoke -Name Native -MemberDefinition @'
[DllImport("userenv.dll", SetLastError = true)]
public static extern bool CreateEnvironmentBlock(out IntPtr environment, IntPtr token, bool inherit);
[DllImport("userenv.dll", SetLastError = true)]
public static extern bool DestroyEnvironmentBlock(IntPtr environment);
[DllImport("shell32.dll")]
public static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid id, uint flags, IntPtr token, out IntPtr path);
'@
# Start-Process -Credential hands this process runneradmin's environment and
# the shell resolves known folders (AppData) from it. Build the account's own
# logon environment and rerun the smoke in a process that starts with it.
if ($env:LIFE_BOARD_SMOKE_LOGON_ENVIRONMENT -ne '1') {
    $block = [IntPtr]::Zero
    if (![LifeBoardSmoke.Native]::CreateEnvironmentBlock([ref]$block, $identity.Token, $false)) { throw [ComponentModel.Win32Exception]::new() }
    $logonEnvironment = @{}
    try {
        $cursor = $block
        while ($entry = [Runtime.InteropServices.Marshal]::PtrToStringUni($cursor)) {
            $separator = $entry.IndexOf('=', 1)
            if ($separator -gt 0) { $logonEnvironment[$entry.Substring(0, $separator)] = $entry.Substring($separator + 1) }
            $cursor = [IntPtr]::Add($cursor, ($entry.Length + 1) * 2)
        }
    } finally { [void][LifeBoardSmoke.Native]::DestroyEnvironmentBlock($block) }
    foreach ($name in @([Environment]::GetEnvironmentVariables().Keys)) {
        if (!$logonEnvironment.ContainsKey($name)) { [Environment]::SetEnvironmentVariable($name, $null) }
    }
    foreach ($variable in $logonEnvironment.GetEnumerator()) { [Environment]::SetEnvironmentVariable($variable.Key, $variable.Value) }
    $env:LIFE_BOARD_SMOKE_LOGON_ENVIRONMENT = '1'
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-InstallerPath', $InstallerPath, '-Version', $Version, '-EvidenceDirectory', $EvidenceDirectory)
    if ($RequireSignature) { $arguments += @('-RequireSignature', '-PublisherName', $PublisherName) }
    & $powershell @arguments
    exit $LASTEXITCODE
}
if ($env:USERPROFILE -ne $profilePath) { throw "Logon environment belongs to another profile: $env:USERPROFILE" }
# Secondary logon loads the new user's hive but does not run Explorer's first
# logon initialization. Provision that account's default shell folders before
# NSIS/Electron query them; do not inherit runneradmin's AppData locations.
$shellFolders = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
$defaults = @{
    'AppData' = Join-Path $profilePath 'AppData/Roaming'
    'Local AppData' = Join-Path $profilePath 'AppData/Local'
    'Desktop' = Join-Path $profilePath 'Desktop'
    'Start Menu' = Join-Path $profilePath 'AppData/Roaming/Microsoft/Windows/Start Menu'
    'Programs' = Join-Path $profilePath 'AppData/Roaming/Microsoft/Windows/Start Menu/Programs'
}
# New-Item -Force would recreate an existing key and drop its values, and
# Windows PowerShell 5.1 Get-ItemPropertyValue throws on a missing value.
if (!(Test-Path -LiteralPath $shellFolders)) { New-Item -Path $shellFolders | Out-Null }
$shellFoldersKey = Get-Item -LiteralPath $shellFolders
foreach ($entry in $defaults.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($shellFoldersKey.GetValue($entry.Key))) {
        New-Item -ItemType Directory -Path $entry.Value -Force | Out-Null
        New-ItemProperty -LiteralPath $shellFolders -Name $entry.Key -Value $entry.Value -PropertyType ExpandString -Force | Out-Null
    }
}
# Resolve folders like Electron does; .NET GetFolderPath hides the HRESULT.
function Resolve-KnownFolder([Guid]$Id, [uint32]$Flags) {
    $pointer = [IntPtr]::Zero
    $result = [LifeBoardSmoke.Native]::SHGetKnownFolderPath($Id, $Flags, [IntPtr]::Zero, [ref]$pointer)
    try {
        $path = if ($result -eq 0) { [Runtime.InteropServices.Marshal]::PtrToStringUni($pointer) } else { $null }
        return [pscustomobject]@{ Result = $result; Path = $path }
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeCoTaskMem($pointer) }
    }
}
function Get-KnownFolder([string]$Name, [Guid]$Id) {
    # Chromium resolves app data with default flags (no KF_FLAG_CREATE).
    $folder = Resolve-KnownFolder $Id 0
    if ($folder.Result -eq 0) { return $folder.Path }
    $raw = $shellFoldersKey.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    # KF_FLAG_DONT_VERIFY shows which profile the shell expanded the value against.
    $unverified = Resolve-KnownFolder $Id 0x4000
    throw ("Cannot resolve {0}: HRESULT 0x{1:X8}; User Shell Folders value '{2}'; unverified path '{3}'" -f $Name, $folder.Result, $raw, $unverified.Path)
}
$env:APPDATA = Get-KnownFolder 'AppData' '3EB685DB-65F9-4CF6-A03A-E3EF65729F3D'
$env:LOCALAPPDATA = Get-KnownFolder 'Local AppData' 'F1B32785-6FBA-4FCF-9D55-7B8E7F157091'
Write-Output "Standard user: $($identity.Name); profile: $profilePath; AppData: $env:APPDATA; LocalAppData: $env:LOCALAPPDATA"
if ([string]::IsNullOrWhiteSpace($env:APPDATA) -or [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -or
    !$env:APPDATA.StartsWith($profilePath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Windows did not initialize the standard user shell folders.' }
$install = Join-Path $env:LOCALAPPDATA ('Life Board smoke ' + [Guid]::NewGuid().ToString('N'))
$exe = Join-Path $install 'Life Board.exe'
$data = Join-Path $env:APPDATA 'life-board-app'
# Use a disposable account when automating. Never reuse someone else's database.
if (Test-Path $data) { throw "Smoke refuses an existing app profile: $data" }
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
foreach ($name in @('ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'NODE_OPTIONS', 'APPIMAGE')) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
$appProcess = $null
$completed = $false
Start-Transcript -LiteralPath (Join-Path $EvidenceDirectory transcript.log) | Out-Null

function Stop-OwnedApp {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Internal test cleanup always stops only the unique smoke installation.')]
    param()
    Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($install + '\', [StringComparison]::OrdinalIgnoreCase) } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    if ($appProcess) { $appProcess.WaitForExit(10000) | Out-Null }
}
function Invoke-Installer([string]$Path, [string]$Arguments) {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -PassThru
    $null = $process.Handle
    if (!$process.WaitForExit(90000)) { Stop-Process -Id $process.Id -Force; throw "Installer timed out: $Path" }
    $process.Refresh()
    if ($process.ExitCode -ne 0) { throw "Installer failed: $Path ($($process.ExitCode))" }
}
function Test-AuthenticodeSignature([string]$Path) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if (!$RequireSignature) {
        if ($signature.Status -ne 'NotSigned') { throw "Build-only artifact must be deliberately unsigned: $Path" }
        return $null
    }
    if ($signature.Status -ne 'Valid' -or !$signature.SignerCertificate) { throw "Invalid production signature: $Path ($($signature.Status))" }
    $publisher = $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    if ($publisher -cne $PublisherName) { throw "Unexpected publisher on $Path" }
    return $signature.SignerCertificate.Thumbprint
}
function Start-OwnedApp {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Internal smoke helper launches only the test installation.')]
    param([int]$Attempt)
    $stdout = Join-Path $EvidenceDirectory "app-$Attempt.stdout.log"
    $stderr = Join-Path $EvidenceDirectory "app-$Attempt.stderr.log"
    $script:appProcess = Start-Process -FilePath $exe -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($appProcess.HasExited) { throw "Installed app exited before readiness: $($appProcess.ExitCode)" }
        $logs = (Get-Content $stdout -Raw -ErrorAction SilentlyContinue) + (Get-Content $stderr -Raw -ErrorAction SilentlyContinue)
        if ($logs -match 'Unable to load preload|ERR_FILE_NOT_FOUND') { throw 'Installed renderer/preload failed to load' }
        if ($logs -match 'API ouvindo em (http://127\.0\.0\.1:\d+)') {
            $url = $Matches[1]
            $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 5
            if ($health.ok -ne $true -or $health.service -ne 'life-board-api') { throw 'Unexpected backend health response' }
            $appProcess.Refresh()
            if ($appProcess.MainWindowHandle -ne [IntPtr]::Zero) { return $url }
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'Installed backend did not become ready within 60 seconds'
}

try {
    $installerSigner = Test-AuthenticodeSignature $InstallerPath
    # NSIS /D= must be last and is deliberately unquoted, including spaces.
    Invoke-Installer $InstallerPath "/S /currentuser /D=$install"
    $appSigner = Test-AuthenticodeSignature $exe
    if ($installerSigner -cne $appSigner) { throw 'Installer and installed app use different certificates' }
    $metadata = [Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
    if ($metadata.ProductName -ne 'Life Board' -or $metadata.ProductVersion -ne $Version) { throw 'Wrong installed app identity/version' }
    $stream = [IO.File]::OpenRead($exe)
    $reader = [IO.BinaryReader]::new($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5a4d) { throw 'Installed app is not a PE executable' }
        $stream.Position = 60; $offset = $reader.ReadUInt32(); $stream.Position = $offset
        if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) { throw 'Installed executable is not x64' }
    } finally { $reader.Dispose() }
    foreach ($resource in @('app.asar', 'app-update.yml', 'migrations/meta/_journal.json', 'app.asar.unpacked/node_modules/@libsql/win32-x64-msvc/index.node')) {
        if (!(Test-Path -LiteralPath (Join-Path $install "resources/$resource"))) { throw "Missing installed resource: $resource" }
    }
    $shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Life Board.lnk'
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.Namespace((Split-Path $shortcut))
    $item = $folder.ParseName((Split-Path $shortcut -Leaf))
    if (!$item -or $item.ExtendedProperty('System.AppUserModel.ID') -ne 'dev.nathanmota.lifeboard') { throw 'Missing notification shortcut identity' }
    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
    if ($link.TargetPath -ne $exe) { throw 'Shortcut targets another app' }
    $url = Start-OwnedApp 1
    $task = Invoke-RestMethod "$url/api/tasks" -Method Post -ContentType 'application/json' -Body '{"title":"Installed Windows smoke"}' -TimeoutSec 5
    foreach ($file in @('life-board.db', 'secret.key.enc')) {
        if ((Get-Item -LiteralPath (Join-Path $data $file)).Length -eq 0) { throw "Empty $file" }
    }
    $keyHash = (Get-FileHash -LiteralPath (Join-Path $data secret.key.enc)).Hash
    Stop-OwnedApp
    # loadSecretKey must decrypt the existing DPAPI key on this second start.
    $url = Start-OwnedApp 2
    $saved = Invoke-RestMethod "$url/api/tasks/$($task.id)" -TimeoutSec 5
    if ($saved.title -ne 'Installed Windows smoke' -or (Get-FileHash -LiteralPath (Join-Path $data secret.key.enc)).Hash -ne $keyHash) { throw 'Database/DPAPI restart persistence failed' }
    Stop-OwnedApp
    $status = if ($RequireSignature) { 'signed' } else { 'unsigned' }
    $publisher = if ($RequireSignature) { $PublisherName } else { $null }
    $signing = @{ schemaVersion = 1; status = $status; publisher = $publisher; thumbprint = $appSigner; installerSha256 = (Get-FileHash -Algorithm SHA256 $InstallerPath).Hash.ToLowerInvariant(); executableSha256 = (Get-FileHash -Algorithm SHA256 $exe).Hash.ToLowerInvariant() }
    [IO.File]::WriteAllText((Join-Path $EvidenceDirectory signing-info.json), ($signing | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $evidence = @{ windowsVersion = [Environment]::OSVersion.VersionString; user = $identity.Name; administrator = $isAdmin; profile = $profilePath; version = $Version; signing = $status; health = $true; databaseRestart = $true; dpapiRestart = $true }
    [IO.File]::WriteAllText((Join-Path $EvidenceDirectory smoke.json), ($evidence | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $completed = $true
    Write-Output "Installed Windows smoke passed ($status): $exe"
} finally {
    Stop-OwnedApp
    $uninstaller = Join-Path $install 'Uninstall Life Board.exe'
    if (Test-Path -LiteralPath $uninstaller) { Invoke-Installer $uninstaller '/S /currentuser' }
    Stop-Transcript | Out-Null
    Get-ChildItem -Path $EvidenceDirectory -Filter '*.log' | ForEach-Object { Get-Content -LiteralPath $_.FullName }
}
if (!$completed) { exit 1 }
