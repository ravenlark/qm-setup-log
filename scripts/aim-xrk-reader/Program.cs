using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

var options = CliOptions.Parse(args);
if (options.ShowHelp)
{
    Console.WriteLine(CliOptions.HelpText);
    return 0;
}

if (!OperatingSystem.IsWindows())
{
    Console.Error.WriteLine("AiM's MatLabXRK DLL is a Windows native library. Run this tool on Windows.");
    return 1;
}

try
{
    options.Validate();
    AimXrkNative.Configure(options.DllPath!, options.DependencyDirs);

    var summary = AimXrkReader.Read(options.FilePath!, options);
    var jsonOptions = new JsonSerializerOptions
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };
    Console.WriteLine(JsonSerializer.Serialize(summary, jsonOptions));
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex.Message);
    return 1;
}

static class AimXrkReader
{
    public static XrkFileSummary Read(string filePath, CliOptions options)
    {
        var fullPath = Path.GetFullPath(filePath);
        var openIndex = AimXrkNative.open_file(fullPath);
        if (openIndex <= 0)
        {
            var lastError = PtrToString(AimXrkNative.get_last_open_error());
            throw new InvalidOperationException(
                $"Could not open '{fullPath}'. open_file returned {openIndex}." +
                (string.IsNullOrWhiteSpace(lastError) ? "" : $" AiM error: {lastError}"));
        }

        try
        {
            var laps = ReadLaps(openIndex);
            var channels = ReadChannels(
                openIndex,
                ChannelGroup.Session,
                AimXrkNative.get_channels_count,
                AimXrkNative.get_channel_name,
                AimXrkNative.get_channel_name_no_spaces,
                AimXrkNative.get_channel_units,
                AimXrkNative.get_channel_samples_count,
                AimXrkNative.get_channel_samples,
                options);

            var gpsChannels = ReadChannels(
                openIndex,
                ChannelGroup.Gps,
                AimXrkNative.get_GPS_channels_count,
                AimXrkNative.get_GPS_channel_name,
                AimXrkNative.get_GPS_channel_name_no_spaces,
                AimXrkNative.get_GPS_channel_units,
                AimXrkNative.get_GPS_channel_samples_count,
                AimXrkNative.get_GPS_channel_samples,
                options);

            var gpsRawChannels = ReadChannels(
                openIndex,
                ChannelGroup.GpsRaw,
                AimXrkNative.get_GPS_raw_channels_count,
                AimXrkNative.get_GPS_raw_channel_name,
                AimXrkNative.get_GPS_raw_channel_name_no_spaces,
                AimXrkNative.get_GPS_raw_channel_units,
                AimXrkNative.get_GPS_raw_channel_samples_count,
                AimXrkNative.get_GPS_raw_channel_samples,
                options);

            var duration = ReadSessionDuration(openIndex);
            return new XrkFileSummary
            {
                FilePath = fullPath,
                Library = new LibrarySummary
                {
                    DllPath = AimXrkNative.DllPath,
                    Date = PtrToString(AimXrkNative.get_library_date()),
                    Time = PtrToString(AimXrkNative.get_library_time()),
                },
                Metadata = new SessionMetadata
                {
                    LoggerId = AimXrkNative.get_logger_id(openIndex),
                    DeviceIds = ReadDeviceIds(openIndex),
                    Vehicle = PtrToString(AimXrkNative.get_vehicle_name(openIndex)),
                    Track = PtrToString(AimXrkNative.get_track_name(openIndex)),
                    Racer = PtrToString(AimXrkNative.get_racer_name(openIndex)),
                    Championship = PtrToString(AimXrkNative.get_championship_name(openIndex)),
                    SessionType = PtrToString(AimXrkNative.get_session_type_name(openIndex)),
                    DateTime = ReadSessionDateTime(openIndex),
                    DurationSeconds = duration,
                },
                Derived = new DerivedSessionValues
                {
                    ShortestLapSeconds = laps.Count == 0 ? null : laps.Min(lap => lap.DurationSeconds),
                    BestCompleteLapSeconds = CompleteLaps(laps).Count == 0
                        ? null
                        : CompleteLaps(laps).Min(lap => lap.DurationSeconds),
                    TotalLaps = laps.Count,
                    CompleteLapCount = CompleteLaps(laps).Count,
                    AverageRpm = AverageForLikelyChannel(channels, "rpm"),
                    MaxRpm = MaxForLikelyChannel(channels, "rpm"),
                },
                Laps = laps,
                Channels = channels,
                GpsChannels = gpsChannels,
                GpsRawChannels = gpsRawChannels,
                OpenFiles = options.IncludeOpenFiles
                    ? PtrToString(AimXrkNative.library_test_on_open_files())
                    : null,
            };
        }
        finally
        {
            AimXrkNative.close_file_i(openIndex);
        }
    }

    private static List<LapSummary> ReadLaps(int openIndex)
    {
        var count = AimXrkNative.get_laps_count(openIndex);
        var laps = new List<LapSummary>();
        if (count <= 0) return laps;

        for (var i = 0; i < count; i++)
        {
            var result = AimXrkNative.get_lap_info(openIndex, i, out var start, out var duration);
            if (result == 1)
            {
                laps.Add(new LapSummary
                {
                    Index = i,
                    StartSeconds = start,
                    DurationSeconds = duration,
                });
            }
        }

        return laps;
    }

    private static IReadOnlyList<LapSummary> CompleteLaps(IReadOnlyList<LapSummary> laps)
    {
        return laps.Count > 2 ? laps.Skip(1).Take(laps.Count - 2).ToList() : laps;
    }

    private static List<ChannelSummary> ReadChannels(
        int openIndex,
        ChannelGroup group,
        Func<int, int> countFunc,
        Func<int, int, IntPtr> nameFunc,
        Func<int, int, IntPtr> nameNoSpacesFunc,
        Func<int, int, IntPtr> unitsFunc,
        Func<int, int, int> sampleCountFunc,
        SamplesFunc samplesFunc,
        CliOptions options)
    {
        var count = countFunc(openIndex);
        var channels = new List<ChannelSummary>();
        if (count <= 0) return channels;

        for (var i = 0; i < count; i++)
        {
            var sampleCount = sampleCountFunc(openIndex, i);
            var samples = sampleCount > 0
                ? ReadSamples(openIndex, i, sampleCount, samplesFunc, options)
                : SampleRead.Empty;

            channels.Add(new ChannelSummary
            {
                Index = i,
                Group = group.ToString(),
                Name = PtrToString(nameFunc(openIndex, i)),
                NameNoSpaces = PtrToString(nameNoSpacesFunc(openIndex, i)),
                Units = PtrToString(unitsFunc(openIndex, i)),
                SampleCount = sampleCount,
                First = samples.First,
                Last = samples.Last,
                Min = samples.Min,
                Max = samples.Max,
                Average = samples.Average,
                Samples = samples.Samples,
            });
        }

        return channels;
    }

    private static SampleRead ReadSamples(
        int openIndex,
        int channelIndex,
        int sampleCount,
        SamplesFunc samplesFunc,
        CliOptions options)
    {
        var times = new double[sampleCount];
        var values = new double[sampleCount];
        var recovered = samplesFunc(openIndex, channelIndex, times, values, sampleCount);
        if (recovered <= 0)
        {
            return SampleRead.Empty;
        }

        var actualCount = Math.Min(recovered, sampleCount);
        var min = values[0];
        var max = values[0];
        var total = 0.0;
        for (var i = 0; i < actualCount; i++)
        {
            var value = values[i];
            min = Math.Min(min, value);
            max = Math.Max(max, value);
            total += value;
        }

        List<ChannelSample>? sampleRows = null;
        if (options.IncludeSamples)
        {
            var limit = Math.Min(options.MaxSamplesPerChannel, actualCount);
            sampleRows = new List<ChannelSample>(limit);
            for (var i = 0; i < limit; i++)
            {
                sampleRows.Add(new ChannelSample(times[i], values[i]));
            }
        }

        return new SampleRead
        {
            First = new ChannelSample(times[0], values[0]),
            Last = new ChannelSample(times[actualCount - 1], values[actualCount - 1]),
            Min = min,
            Max = max,
            Average = total / actualCount,
            Samples = sampleRows,
        };
    }

    private static double? ReadSessionDuration(int openIndex)
    {
        var result = AimXrkNative.get_session_duration(openIndex, out var duration);
        return result == 1 ? duration : null;
    }

    private static List<uint> ReadDeviceIds(int openIndex)
    {
        var count = AimXrkNative.get_number_of_devices(openIndex);
        var devices = new List<uint>();
        for (var i = 0; i < count; i++)
        {
            devices.Add(AimXrkNative.get_device_id(openIndex, i));
        }
        return devices;
    }

    private static string? ReadSessionDateTime(int openIndex)
    {
        var ptr = AimXrkNative.get_date_and_time(openIndex);
        if (ptr == IntPtr.Zero) return null;
        var tm = Marshal.PtrToStructure<Tm>(ptr);
        try
        {
            return new DateTime(
                tm.Year + 1900,
                tm.Month + 1,
                tm.MonthDay,
                tm.Hour,
                tm.Minute,
                tm.Second,
                DateTimeKind.Unspecified).ToString("yyyy-MM-ddTHH:mm:ss");
        }
        catch
        {
            return null;
        }
    }

    private static double? AverageForLikelyChannel(IEnumerable<ChannelSummary> channels, string namePart)
    {
        return LikelyChannel(channels, namePart)?.Average;
    }

    private static double? MaxForLikelyChannel(IEnumerable<ChannelSummary> channels, string namePart)
    {
        return LikelyChannel(channels, namePart)?.Max;
    }

    private static ChannelSummary? LikelyChannel(IEnumerable<ChannelSummary> channels, string namePart)
    {
        return channels.FirstOrDefault(channel =>
            (channel.Name?.Contains(namePart, StringComparison.OrdinalIgnoreCase) ?? false) ||
            (channel.NameNoSpaces?.Contains(namePart, StringComparison.OrdinalIgnoreCase) ?? false));
    }

    private static string? PtrToString(IntPtr ptr)
    {
        return ptr == IntPtr.Zero ? null : Marshal.PtrToStringAnsi(ptr);
    }
}

static class AimXrkNative
{
    private const string DllImportName = "MatLabXRK";
    private static string? dllPath;
    private static IReadOnlyList<string> dependencyDirs = Array.Empty<string>();

    public static string? DllPath => dllPath;

    static AimXrkNative()
    {
        NativeLibrary.SetDllImportResolver(typeof(AimXrkNative).Assembly, Resolve);
    }

    public static void Configure(string nativeDllPath, IReadOnlyList<string> nativeDependencyDirs)
    {
        dllPath = Path.GetFullPath(nativeDllPath);
        dependencyDirs = nativeDependencyDirs.Select(Path.GetFullPath).ToList();

        foreach (var dependency in DependencyFileNames)
        {
            foreach (var dir in dependencyDirs)
            {
                var candidate = Path.Combine(dir, dependency);
                if (File.Exists(candidate))
                {
                    NativeLibrary.Load(candidate);
                    break;
                }
            }
        }
    }

    private static IntPtr Resolve(string libraryName, System.Reflection.Assembly assembly, DllImportSearchPath? searchPath)
    {
        if (libraryName == DllImportName && dllPath is not null)
        {
            return NativeLibrary.Load(dllPath);
        }

        return IntPtr.Zero;
    }

    private static readonly string[] DependencyFileNames =
    {
        "pthreadVC2_x64.dll",
        "libiconv-2.dll",
        "libz.dll",
        "libxml2-2.dll",
    };

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_library_date();

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_library_time();

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int open_file([MarshalAs(UnmanagedType.LPStr)] string fullPathName);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_last_open_error();

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int close_file_i(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern uint get_logger_id(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_number_of_devices(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern uint get_device_id(int fileIndex, int deviceIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_vehicle_name(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_track_name(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_racer_name(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_championship_name(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_session_type_name(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_date_and_time(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_laps_count(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_lap_info(int fileIndex, int lapIndex, out double start, out double duration);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_session_duration(int fileIndex, out double duration);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_channels_count(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_channel_name(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_channel_name_no_spaces(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_channel_units(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_channel_samples_count(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_channel_samples(
        int fileIndex,
        int channelIndex,
        [Out] double[] times,
        [Out] double[] values,
        int count);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_GPS_channels_count(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_GPS_channel_name(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_GPS_channel_name_no_spaces(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_GPS_channel_units(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_GPS_channel_samples_count(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_GPS_channel_samples(
        int fileIndex,
        int channelIndex,
        [Out] double[] times,
        [Out] double[] values,
        int count);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_GPS_raw_channels_count(int fileIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_GPS_raw_channel_name(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_GPS_raw_channel_name_no_spaces(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr get_GPS_raw_channel_units(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_GPS_raw_channel_samples_count(int fileIndex, int channelIndex);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int get_GPS_raw_channel_samples(
        int fileIndex,
        int channelIndex,
        [Out] double[] times,
        [Out] double[] values,
        int count);

    [DllImport(DllImportName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr library_test_on_open_files();
}

delegate int SamplesFunc(int fileIndex, int channelIndex, double[] times, double[] values, int count);

sealed class CliOptions
{
    public string? FilePath { get; private set; }
    public string? DllPath { get; private set; }
    public List<string> DependencyDirs { get; } = new();
    public bool IncludeSamples { get; private set; }
    public bool IncludeOpenFiles { get; private set; }
    public int MaxSamplesPerChannel { get; private set; } = 25;
    public bool ShowHelp { get; private set; }

    public static CliOptions Parse(string[] args)
    {
        var options = new CliOptions();
        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            switch (arg)
            {
                case "--help":
                case "-h":
                    options.ShowHelp = true;
                    break;
                case "--file":
                    options.FilePath = ReadValue(args, ref i, arg);
                    break;
                case "--dll":
                    options.DllPath = ReadValue(args, ref i, arg);
                    break;
                case "--deps":
                    options.DependencyDirs.Add(ReadValue(args, ref i, arg));
                    break;
                case "--include-samples":
                    options.IncludeSamples = true;
                    break;
                case "--include-open-files":
                    options.IncludeOpenFiles = true;
                    break;
                case "--max-samples":
                    options.MaxSamplesPerChannel = int.Parse(ReadValue(args, ref i, arg));
                    break;
                default:
                    if (options.FilePath is null)
                    {
                        options.FilePath = arg;
                    }
                    else
                    {
                        throw new ArgumentException($"Unknown argument: {arg}");
                    }
                    break;
            }
        }

        options.DllPath ??= Path.Combine("work", "aim", "MatLabXRK-2022-64-ReleaseU.dll");
        var defaultDeps = Path.Combine("work", "aim", "TestMatLabXRK", "TestMatLabXRK", "64");
        if (Directory.Exists(defaultDeps) && options.DependencyDirs.Count == 0)
        {
            options.DependencyDirs.Add(defaultDeps);
        }

        return options;
    }

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(FilePath))
        {
            throw new ArgumentException("Missing --file <path-to-xrk-or-xrz>.");
        }
        if (!File.Exists(FilePath))
        {
            throw new FileNotFoundException($"Telemetry file not found: {FilePath}");
        }
        if (string.IsNullOrWhiteSpace(DllPath) || !File.Exists(DllPath))
        {
            throw new FileNotFoundException($"DLL not found: {DllPath}");
        }
        foreach (var dir in DependencyDirs)
        {
            if (!Directory.Exists(dir))
            {
                throw new DirectoryNotFoundException($"Dependency directory not found: {dir}");
            }
        }
        if (MaxSamplesPerChannel < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(MaxSamplesPerChannel), "Max samples must be at least 1.");
        }
    }

    private static string ReadValue(string[] args, ref int index, string option)
    {
        if (index + 1 >= args.Length)
        {
            throw new ArgumentException($"{option} requires a value.");
        }
        index++;
        return args[index];
    }

    public const string HelpText = """
    Usage:
      dotnet run --project scripts/aim-xrk-reader -- --file <file.xrk|file.xrz> [options]

    Options:
      --dll <path>            Path to MatLabXRK-2022-64-ReleaseU.dll.
                              Defaults to work/aim/MatLabXRK-2022-64-ReleaseU.dll.
      --deps <dir>            Directory containing native dependency DLLs.
                              Can be repeated. Defaults to AiM example's 64 folder when present.
      --include-samples       Include a capped sample list per channel.
      --include-open-files    Include AiM's verbose open-files diagnostic text.
      --max-samples <count>   Max samples to include per channel when --include-samples is used.
      -h, --help              Show help.
    """;
}

enum ChannelGroup
{
    Session,
    Gps,
    GpsRaw,
}

[StructLayout(LayoutKind.Sequential)]
struct Tm
{
    public int Second;
    public int Minute;
    public int Hour;
    public int MonthDay;
    public int Month;
    public int Year;
    public int WeekDay;
    public int YearDay;
    public int IsDaylightSavings;
}

sealed class XrkFileSummary
{
    public string FilePath { get; set; } = "";
    public LibrarySummary Library { get; set; } = new();
    public SessionMetadata Metadata { get; set; } = new();
    public DerivedSessionValues Derived { get; set; } = new();
    public List<LapSummary> Laps { get; set; } = new();
    public List<ChannelSummary> Channels { get; set; } = new();
    public List<ChannelSummary> GpsChannels { get; set; } = new();
    public List<ChannelSummary> GpsRawChannels { get; set; } = new();
    public string? OpenFiles { get; set; }
}

sealed class LibrarySummary
{
    public string? DllPath { get; set; }
    public string? Date { get; set; }
    public string? Time { get; set; }
}

sealed class SessionMetadata
{
    public uint LoggerId { get; set; }
    public List<uint> DeviceIds { get; set; } = new();
    public string? Vehicle { get; set; }
    public string? Track { get; set; }
    public string? Racer { get; set; }
    public string? Championship { get; set; }
    public string? SessionType { get; set; }
    public string? DateTime { get; set; }
    public double? DurationSeconds { get; set; }
}

sealed class DerivedSessionValues
{
    public double? ShortestLapSeconds { get; set; }
    public double? BestCompleteLapSeconds { get; set; }
    public int TotalLaps { get; set; }
    public int CompleteLapCount { get; set; }
    public double? AverageRpm { get; set; }
    public double? MaxRpm { get; set; }
}

sealed class LapSummary
{
    public int Index { get; set; }
    public double StartSeconds { get; set; }
    public double DurationSeconds { get; set; }
}

sealed class ChannelSummary
{
    public int Index { get; set; }
    public string Group { get; set; } = "";
    public string? Name { get; set; }
    public string? NameNoSpaces { get; set; }
    public string? Units { get; set; }
    public int SampleCount { get; set; }
    public ChannelSample? First { get; set; }
    public ChannelSample? Last { get; set; }
    public double? Min { get; set; }
    public double? Max { get; set; }
    public double? Average { get; set; }
    public List<ChannelSample>? Samples { get; set; }
}

sealed class SampleRead
{
    public static readonly SampleRead Empty = new();

    public ChannelSample? First { get; init; }
    public ChannelSample? Last { get; init; }
    public double? Min { get; init; }
    public double? Max { get; init; }
    public double? Average { get; init; }
    public List<ChannelSample>? Samples { get; init; }
}

sealed record ChannelSample(double Time, double Value);
