# AiM XRK Reader

Small Windows-only probe for AiM MyChron `XRK`/`XRZ` telemetry files. It calls AiM's
`MatLabXRK-2022-64-ReleaseU.dll` through C# P/Invoke and prints a JSON summary.

The native DLL and telemetry samples live under `work/aim`, which is intentionally
ignored by git.

## Run

```powershell
.\scripts\aim-xrk-reader\Read-AimXrk.ps1 -File "work\aim\Rory_Animal_AAA_Generic testing_a_0872.xrk"
```

The default DLL path is:

```text
work\aim\MatLabXRK-2022-64-ReleaseU.dll
```

The tool also uses AiM's native dependency DLLs from the official example archive
when this directory exists:

```text
work\aim\TestMatLabXRK\TestMatLabXRK\64
```

Use `-Deps <dir>` to point at another dependency directory. Use
`-IncludeSamples -MaxSamples 100` when you need a capped list of raw samples
inside each channel instead of only summary stats.

`derived.shortestLapSeconds` reports the shortest lap row exactly as returned by
the DLL. `derived.bestCompleteLapSeconds` ignores the first and last lap when
there are at least three laps, which avoids treating startup/shutdown partial
laps as the best lap.

There is also a `net6.0` C# project in this folder for environments with the
.NET SDK installed:

```powershell
dotnet run --project scripts\aim-xrk-reader -- --file "work\aim\Rory_Animal_AAA_Generic testing_a_0872.xrk"
```
