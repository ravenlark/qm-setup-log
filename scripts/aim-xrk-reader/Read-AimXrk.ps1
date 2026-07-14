param(
    [Parameter(Mandatory = $true)]
    [string]$File,

    [string]$Dll = "work\aim\MatLabXRK-2022-64-ReleaseU.dll",

    [string[]]$Deps = @("work\aim\TestMatLabXRK\TestMatLabXRK\64"),

    [switch]$IncludeSamples,

    [switch]$IncludeOpenFiles,

    [int]$MaxSamples = 25
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ExistingFile([string]$PathValue, [string]$Label) {
    $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction SilentlyContinue
    if (-not $resolved) {
        throw "$Label not found: $PathValue"
    }
    return $resolved.ProviderPath
}

function Resolve-ExistingDirs([string[]]$PathValues) {
    $dirs = New-Object System.Collections.Generic.List[string]
    foreach ($pathValue in $PathValues) {
        $resolved = Resolve-Path -LiteralPath $pathValue -ErrorAction SilentlyContinue
        if ($resolved) {
            $dirs.Add($resolved.ProviderPath)
        }
    }
    return $dirs.ToArray()
}

$filePath = Resolve-ExistingFile $File "Telemetry file"
$dllPath = Resolve-ExistingFile $Dll "AiM DLL"
$dependencyDirs = Resolve-ExistingDirs $Deps

$source = @"
using System;
using System.Runtime.InteropServices;

public sealed class AimXrkLibrary : IDisposable
{
    private readonly IntPtr libraryHandle;

    [StructLayout(LayoutKind.Sequential)]
    public struct Tm
    {
        public int tm_sec;
        public int tm_min;
        public int tm_hour;
        public int tm_mday;
        public int tm_mon;
        public int tm_year;
        public int tm_wday;
        public int tm_yday;
        public int tm_isdst;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool SetDllDirectory(string lpPathName);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr LoadLibrary(string lpFileName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeLibrary(IntPtr hModule);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
    private static extern IntPtr GetProcAddress(IntPtr hModule, string procName);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate IntPtr StringNoArgsFunc();

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate IntPtr StringIntFunc(int idxf);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate IntPtr StringIntIntFunc(int idxf, int idxc);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int OpenFileFunc([MarshalAs(UnmanagedType.LPStr)] string fullPathName);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int IntFunc(int idxf);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate uint UIntFunc(int idxf);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate uint UIntIntIntFunc(int idxf, int idxd);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int IntIntFunc(int idxf, int idxc);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int LapInfoFunc(int idxf, int idxl, out double start, out double duration);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int DurationFunc(int idxf, out double duration);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int SamplesFunc(int idxf, int idxc, [Out] double[] times, [Out] double[] values, int count);

    private readonly StringNoArgsFunc getLibraryDate;
    private readonly StringNoArgsFunc getLibraryTime;
    private readonly OpenFileFunc openFile;
    private readonly StringNoArgsFunc getLastOpenError;
    private readonly IntFunc closeFileI;
    private readonly UIntFunc getLoggerId;
    private readonly IntFunc getNumberOfDevices;
    private readonly UIntIntIntFunc getDeviceId;
    private readonly StringIntFunc getVehicleName;
    private readonly StringIntFunc getTrackName;
    private readonly StringIntFunc getRacerName;
    private readonly StringIntFunc getChampionshipName;
    private readonly StringIntFunc getSessionTypeName;
    private readonly StringIntFunc getDateAndTime;
    private readonly IntFunc getLapsCount;
    private readonly LapInfoFunc getLapInfo;
    private readonly DurationFunc getSessionDuration;
    private readonly IntFunc getChannelsCount;
    private readonly StringIntIntFunc getChannelName;
    private readonly StringIntIntFunc getChannelNameNoSpaces;
    private readonly StringIntIntFunc getChannelUnits;
    private readonly IntIntFunc getChannelSamplesCount;
    private readonly SamplesFunc getChannelSamples;
    private readonly IntFunc getGpsChannelsCount;
    private readonly StringIntIntFunc getGpsChannelName;
    private readonly StringIntIntFunc getGpsChannelNameNoSpaces;
    private readonly StringIntIntFunc getGpsChannelUnits;
    private readonly IntIntFunc getGpsChannelSamplesCount;
    private readonly SamplesFunc getGpsChannelSamples;
    private readonly IntFunc getGpsRawChannelsCount;
    private readonly StringIntIntFunc getGpsRawChannelName;
    private readonly StringIntIntFunc getGpsRawChannelNameNoSpaces;
    private readonly StringIntIntFunc getGpsRawChannelUnits;
    private readonly IntIntFunc getGpsRawChannelSamplesCount;
    private readonly SamplesFunc getGpsRawChannelSamples;
    private readonly StringNoArgsFunc libraryTestOnOpenFiles;

    public AimXrkLibrary(string dllPath, string[] dependencyDirs)
    {
        foreach (string dependencyDir in dependencyDirs)
        {
            SetDllDirectory(dependencyDir);
        }

        libraryHandle = LoadLibrary(dllPath);
        if (libraryHandle == IntPtr.Zero)
        {
            throw new InvalidOperationException("Could not load AiM DLL. Win32 error: " + Marshal.GetLastWin32Error());
        }

        getLibraryDate = Bind<StringNoArgsFunc>("get_library_date");
        getLibraryTime = Bind<StringNoArgsFunc>("get_library_time");
        openFile = Bind<OpenFileFunc>("open_file");
        getLastOpenError = Bind<StringNoArgsFunc>("get_last_open_error");
        closeFileI = Bind<IntFunc>("close_file_i");
        getLoggerId = Bind<UIntFunc>("get_logger_id");
        getNumberOfDevices = Bind<IntFunc>("get_number_of_devices");
        getDeviceId = Bind<UIntIntIntFunc>("get_device_id");
        getVehicleName = Bind<StringIntFunc>("get_vehicle_name");
        getTrackName = Bind<StringIntFunc>("get_track_name");
        getRacerName = Bind<StringIntFunc>("get_racer_name");
        getChampionshipName = Bind<StringIntFunc>("get_championship_name");
        getSessionTypeName = Bind<StringIntFunc>("get_session_type_name");
        getDateAndTime = Bind<StringIntFunc>("get_date_and_time");
        getLapsCount = Bind<IntFunc>("get_laps_count");
        getLapInfo = Bind<LapInfoFunc>("get_lap_info");
        getSessionDuration = Bind<DurationFunc>("get_session_duration");
        getChannelsCount = Bind<IntFunc>("get_channels_count");
        getChannelName = Bind<StringIntIntFunc>("get_channel_name");
        getChannelNameNoSpaces = Bind<StringIntIntFunc>("get_channel_name_no_spaces");
        getChannelUnits = Bind<StringIntIntFunc>("get_channel_units");
        getChannelSamplesCount = Bind<IntIntFunc>("get_channel_samples_count");
        getChannelSamples = Bind<SamplesFunc>("get_channel_samples");
        getGpsChannelsCount = Bind<IntFunc>("get_GPS_channels_count");
        getGpsChannelName = Bind<StringIntIntFunc>("get_GPS_channel_name");
        getGpsChannelNameNoSpaces = Bind<StringIntIntFunc>("get_GPS_channel_name_no_spaces");
        getGpsChannelUnits = Bind<StringIntIntFunc>("get_GPS_channel_units");
        getGpsChannelSamplesCount = Bind<IntIntFunc>("get_GPS_channel_samples_count");
        getGpsChannelSamples = Bind<SamplesFunc>("get_GPS_channel_samples");
        getGpsRawChannelsCount = Bind<IntFunc>("get_GPS_raw_channels_count");
        getGpsRawChannelName = Bind<StringIntIntFunc>("get_GPS_raw_channel_name");
        getGpsRawChannelNameNoSpaces = Bind<StringIntIntFunc>("get_GPS_raw_channel_name_no_spaces");
        getGpsRawChannelUnits = Bind<StringIntIntFunc>("get_GPS_raw_channel_units");
        getGpsRawChannelSamplesCount = Bind<IntIntFunc>("get_GPS_raw_channel_samples_count");
        getGpsRawChannelSamples = Bind<SamplesFunc>("get_GPS_raw_channel_samples");
        libraryTestOnOpenFiles = Bind<StringNoArgsFunc>("library_test_on_open_files");
    }

    private T Bind<T>(string name) where T : class
    {
        IntPtr ptr = GetProcAddress(libraryHandle, name);
        if (ptr == IntPtr.Zero)
        {
            throw new MissingMethodException("AiM DLL export not found: " + name);
        }
        return Marshal.GetDelegateForFunctionPointer(ptr, typeof(T)) as T;
    }

    public void Dispose()
    {
        if (libraryHandle != IntPtr.Zero)
        {
            FreeLibrary(libraryHandle);
        }
    }

    public static string PtrToString(IntPtr ptr)
    {
        return ptr == IntPtr.Zero ? null : Marshal.PtrToStringAnsi(ptr);
    }

    public string LibraryDate() { return PtrToString(getLibraryDate()); }
    public string LibraryTime() { return PtrToString(getLibraryTime()); }
    public int OpenFile(string fullPath) { return openFile(fullPath); }
    public string LastOpenError() { return PtrToString(getLastOpenError()); }
    public int CloseFile(int idxf) { return closeFileI(idxf); }
    public uint LoggerId(int idxf) { return getLoggerId(idxf); }
    public int NumberOfDevices(int idxf) { return getNumberOfDevices(idxf); }
    public uint DeviceId(int idxf, int idxd) { return getDeviceId(idxf, idxd); }
    public string VehicleName(int idxf) { return PtrToString(getVehicleName(idxf)); }
    public string TrackName(int idxf) { return PtrToString(getTrackName(idxf)); }
    public string RacerName(int idxf) { return PtrToString(getRacerName(idxf)); }
    public string ChampionshipName(int idxf) { return PtrToString(getChampionshipName(idxf)); }
    public string SessionTypeName(int idxf) { return PtrToString(getSessionTypeName(idxf)); }
    public IntPtr DateAndTimePtr(int idxf) { return getDateAndTime(idxf); }
    public int LapsCount(int idxf) { return getLapsCount(idxf); }
    public int LapInfo(int idxf, int idxl, out double start, out double duration) { return getLapInfo(idxf, idxl, out start, out duration); }
    public int SessionDuration(int idxf, out double duration) { return getSessionDuration(idxf, out duration); }
    public int ChannelsCount(int idxf) { return getChannelsCount(idxf); }
    public string ChannelName(int idxf, int idxc) { return PtrToString(getChannelName(idxf, idxc)); }
    public string ChannelNameNoSpaces(int idxf, int idxc) { return PtrToString(getChannelNameNoSpaces(idxf, idxc)); }
    public string ChannelUnits(int idxf, int idxc) { return PtrToString(getChannelUnits(idxf, idxc)); }
    public int ChannelSamplesCount(int idxf, int idxc) { return getChannelSamplesCount(idxf, idxc); }
    public int ChannelSamples(int idxf, int idxc, double[] times, double[] values, int count) { return getChannelSamples(idxf, idxc, times, values, count); }
    public int GpsChannelsCount(int idxf) { return getGpsChannelsCount(idxf); }
    public string GpsChannelName(int idxf, int idxc) { return PtrToString(getGpsChannelName(idxf, idxc)); }
    public string GpsChannelNameNoSpaces(int idxf, int idxc) { return PtrToString(getGpsChannelNameNoSpaces(idxf, idxc)); }
    public string GpsChannelUnits(int idxf, int idxc) { return PtrToString(getGpsChannelUnits(idxf, idxc)); }
    public int GpsChannelSamplesCount(int idxf, int idxc) { return getGpsChannelSamplesCount(idxf, idxc); }
    public int GpsChannelSamples(int idxf, int idxc, double[] times, double[] values, int count) { return getGpsChannelSamples(idxf, idxc, times, values, count); }
    public int GpsRawChannelsCount(int idxf) { return getGpsRawChannelsCount(idxf); }
    public string GpsRawChannelName(int idxf, int idxc) { return PtrToString(getGpsRawChannelName(idxf, idxc)); }
    public string GpsRawChannelNameNoSpaces(int idxf, int idxc) { return PtrToString(getGpsRawChannelNameNoSpaces(idxf, idxc)); }
    public string GpsRawChannelUnits(int idxf, int idxc) { return PtrToString(getGpsRawChannelUnits(idxf, idxc)); }
    public int GpsRawChannelSamplesCount(int idxf, int idxc) { return getGpsRawChannelSamplesCount(idxf, idxc); }
    public int GpsRawChannelSamples(int idxf, int idxc, double[] times, double[] values, int count) { return getGpsRawChannelSamples(idxf, idxc, times, values, count); }
    public string OpenFiles() { return PtrToString(libraryTestOnOpenFiles()); }
}
"@

Add-Type -TypeDefinition $source

function Convert-SessionDate([IntPtr]$Pointer) {
    if ($Pointer -eq [IntPtr]::Zero) {
        return $null
    }

    $tm = [Runtime.InteropServices.Marshal]::PtrToStructure($Pointer, [type][AimXrkLibrary+Tm])
    try {
        return [datetime]::new(
            $tm.tm_year + 1900,
            $tm.tm_mon + 1,
            $tm.tm_mday,
            $tm.tm_hour,
            $tm.tm_min,
            $tm.tm_sec
        ).ToString("yyyy-MM-ddTHH:mm:ss")
    } catch {
        return $null
    }
}

function Read-Samples(
    [AimXrkLibrary]$Library,
    [int]$FileIndex,
    [int]$ChannelIndex,
    [int]$SampleCount,
    [scriptblock]$Reader
) {
    if ($SampleCount -le 0) {
        return @{
            first = $null
            last = $null
            min = $null
            max = $null
            average = $null
            samples = $null
        }
    }

    $times = New-Object double[] $SampleCount
    $values = New-Object double[] $SampleCount
    $recovered = & $Reader $Library $FileIndex $ChannelIndex $times $values $SampleCount
    if ($recovered -le 0) {
        return @{
            first = $null
            last = $null
            min = $null
            max = $null
            average = $null
            samples = $null
        }
    }

    $actualCount = [Math]::Min($recovered, $SampleCount)
    $min = $values[0]
    $max = $values[0]
    $total = 0.0
    for ($i = 0; $i -lt $actualCount; $i++) {
        $value = $values[$i]
        $min = [Math]::Min($min, $value)
        $max = [Math]::Max($max, $value)
        $total += $value
    }

    $sampleRows = $null
    if ($IncludeSamples) {
        $limit = [Math]::Min($MaxSamples, $actualCount)
        $sampleRows = for ($i = 0; $i -lt $limit; $i++) {
            [pscustomobject]@{ time = $times[$i]; value = $values[$i] }
        }
    }

    return @{
        first = [pscustomobject]@{ time = $times[0]; value = $values[0] }
        last = [pscustomobject]@{ time = $times[$actualCount - 1]; value = $values[$actualCount - 1] }
        min = $min
        max = $max
        average = $total / $actualCount
        samples = $sampleRows
    }
}

function Read-Channels(
    [AimXrkLibrary]$Library,
    [int]$FileIndex,
    [string]$Group,
    [scriptblock]$CountReader,
    [scriptblock]$NameReader,
    [scriptblock]$NameNoSpacesReader,
    [scriptblock]$UnitsReader,
    [scriptblock]$SampleCountReader,
    [scriptblock]$SamplesReader
) {
    $count = & $CountReader $Library $FileIndex
    if ($count -le 0) {
        return @()
    }

    $channels = for ($i = 0; $i -lt $count; $i++) {
        $sampleCount = & $SampleCountReader $Library $FileIndex $i
        $sampleSummary = Read-Samples $Library $FileIndex $i $sampleCount $SamplesReader
        [pscustomobject]@{
            index = $i
            group = $Group
            name = & $NameReader $Library $FileIndex $i
            nameNoSpaces = & $NameNoSpacesReader $Library $FileIndex $i
            units = & $UnitsReader $Library $FileIndex $i
            sampleCount = $sampleCount
            first = $sampleSummary.first
            last = $sampleSummary.last
            min = $sampleSummary.min
            max = $sampleSummary.max
            average = $sampleSummary.average
            samples = $sampleSummary.samples
        }
    }

    return @($channels)
}

function Find-LikelyChannel([object[]]$Channels, [string]$Needle) {
    foreach ($channel in $Channels) {
        if (($channel.name -and $channel.name.IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) -or
            ($channel.nameNoSpaces -and $channel.nameNoSpaces.IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
            return $channel
        }
    }
    return $null
}

$library = [AimXrkLibrary]::new($dllPath, $dependencyDirs)
$fileIndex = 0
try {
    $fileIndex = $library.OpenFile($filePath)
    if ($fileIndex -le 0) {
        $lastError = $library.LastOpenError()
        throw "Could not open '$filePath'. open_file returned $fileIndex. $lastError"
    }

    $lapCount = $library.LapsCount($fileIndex)
    $laps = if ($lapCount -gt 0) {
        for ($i = 0; $i -lt $lapCount; $i++) {
            $start = 0.0
            $duration = 0.0
            $result = $library.LapInfo($fileIndex, $i, [ref]$start, [ref]$duration)
            if ($result -eq 1) {
                [pscustomobject]@{
                    index = $i
                    startSeconds = $start
                    durationSeconds = $duration
                }
            }
        }
    } else {
        @()
    }

    $sessionDuration = 0.0
    $sessionDurationResult = $library.SessionDuration($fileIndex, [ref]$sessionDuration)
    $deviceCount = $library.NumberOfDevices($fileIndex)
    $deviceIds = if ($deviceCount -gt 0) {
        for ($i = 0; $i -lt $deviceCount; $i++) {
            $library.DeviceId($fileIndex, $i)
        }
    } else {
        @()
    }

    $channels = Read-Channels `
        $library `
        $fileIndex `
        "Session" `
        { param($l, $f) $l.ChannelsCount($f) } `
        { param($l, $f, $c) $l.ChannelName($f, $c) } `
        { param($l, $f, $c) $l.ChannelNameNoSpaces($f, $c) } `
        { param($l, $f, $c) $l.ChannelUnits($f, $c) } `
        { param($l, $f, $c) $l.ChannelSamplesCount($f, $c) } `
        { param($l, $f, $c, $t, $v, $n) $l.ChannelSamples($f, $c, $t, $v, $n) }

    $gpsChannels = Read-Channels `
        $library `
        $fileIndex `
        "Gps" `
        { param($l, $f) $l.GpsChannelsCount($f) } `
        { param($l, $f, $c) $l.GpsChannelName($f, $c) } `
        { param($l, $f, $c) $l.GpsChannelNameNoSpaces($f, $c) } `
        { param($l, $f, $c) $l.GpsChannelUnits($f, $c) } `
        { param($l, $f, $c) $l.GpsChannelSamplesCount($f, $c) } `
        { param($l, $f, $c, $t, $v, $n) $l.GpsChannelSamples($f, $c, $t, $v, $n) }

    $gpsRawChannels = Read-Channels `
        $library `
        $fileIndex `
        "GpsRaw" `
        { param($l, $f) $l.GpsRawChannelsCount($f) } `
        { param($l, $f, $c) $l.GpsRawChannelName($f, $c) } `
        { param($l, $f, $c) $l.GpsRawChannelNameNoSpaces($f, $c) } `
        { param($l, $f, $c) $l.GpsRawChannelUnits($f, $c) } `
        { param($l, $f, $c) $l.GpsRawChannelSamplesCount($f, $c) } `
        { param($l, $f, $c, $t, $v, $n) $l.GpsRawChannelSamples($f, $c, $t, $v, $n) }

    $rpmChannel = Find-LikelyChannel $channels "rpm"
    $lapRows = @($laps)
    $completeLapRows = if ($lapRows.Count -gt 2) {
        $lapRows | Select-Object -Skip 1 | Select-Object -First ($lapRows.Count - 2)
    } else {
        $lapRows
    }
    $shortestLap = if ($lapRows.Count) { ($lapRows | Measure-Object -Property durationSeconds -Minimum).Minimum } else { $null }
    $bestCompleteLap = if (@($completeLapRows).Count) { (@($completeLapRows) | Measure-Object -Property durationSeconds -Minimum).Minimum } else { $null }

    [pscustomobject]@{
        filePath = $filePath
        library = [pscustomobject]@{
            dllPath = $dllPath
            date = $library.LibraryDate()
            time = $library.LibraryTime()
        }
        metadata = [pscustomobject]@{
            loggerId = $library.LoggerId($fileIndex)
            deviceIds = @($deviceIds)
            vehicle = $library.VehicleName($fileIndex)
            track = $library.TrackName($fileIndex)
            racer = $library.RacerName($fileIndex)
            championship = $library.ChampionshipName($fileIndex)
            sessionType = $library.SessionTypeName($fileIndex)
            dateTime = Convert-SessionDate $library.DateAndTimePtr($fileIndex)
            durationSeconds = if ($sessionDurationResult -eq 1) { $sessionDuration } else { $null }
        }
        derived = [pscustomobject]@{
            shortestLapSeconds = $shortestLap
            bestCompleteLapSeconds = $bestCompleteLap
            totalLaps = $lapRows.Count
            completeLapCount = @($completeLapRows).Count
            averageRpm = if ($rpmChannel) { $rpmChannel.average } else { $null }
            maxRpm = if ($rpmChannel) { $rpmChannel.max } else { $null }
        }
        laps = @($laps)
        channels = @($channels)
        gpsChannels = @($gpsChannels)
        gpsRawChannels = @($gpsRawChannels)
        openFiles = if ($IncludeOpenFiles) { $library.OpenFiles() } else { $null }
    } | ConvertTo-Json -Depth 8
} finally {
    if ($fileIndex -gt 0) {
        [void]$library.CloseFile($fileIndex)
    }
    $library.Dispose()
}
