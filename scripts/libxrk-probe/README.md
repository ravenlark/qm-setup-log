# libxrk Probe

Small validation spike for reading AiM MyChron `XRK`/`XRZ` files with
[`m3rlin45/libxrk`](https://github.com/m3rlin45/libxrk) instead of AiM's
Windows DLL.

The goal is to compare `libxrk` output against the DLL-backed reader in
`scripts/aim-xrk-reader` and decide whether `libxrk` can become the online
parser implementation.

## Install

Use a virtual environment. On this Codex desktop workspace, the bundled Python
runtime is available at:

```powershell
$python = "C:\Users\raven\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $python -m venv .venv-libxrk
.\.venv-libxrk\Scripts\python.exe -m pip install -r scripts\libxrk-probe\requirements.txt
```

## Run

```powershell
.\.venv-libxrk\Scripts\python.exe scripts\libxrk-probe\probe_libxrk.py `
  --file "work\aim\Rory_Animal_AAA_Generic testing_a_0872.xrk"
```

Validate the known sample headline values:

```powershell
.\.venv-libxrk\Scripts\python.exe scripts\libxrk-probe\validate_sample.py
```

After starting a local Vercel dev server, post the sample file to the API route:

```powershell
.\.venv-libxrk\Scripts\python.exe scripts\libxrk-probe\post_sample_to_endpoint.py `
  http://localhost:3000/api/telemetry/parse
```

If Vercel Dev is not registering Python functions locally, serve the same
handler through the local shim:

```powershell
.\.venv-libxrk\Scripts\python.exe scripts\libxrk-probe\serve_local_parser.py --port 3015
```

Then post the sample:

```powershell
.\.venv-libxrk\Scripts\python.exe scripts\libxrk-probe\post_sample_to_endpoint.py `
  http://127.0.0.1:3015/api/telemetry/parse
```

To compare with the DLL probe:

```powershell
.\scripts\aim-xrk-reader\Read-AimXrk.ps1 `
  -File "work\aim\Rory_Animal_AAA_Generic testing_a_0872.xrk"
```

## Decision Criteria

Prefer `libxrk` for the online parser if it matches the DLL output closely on:

- metadata
- lap count and lap timing
- channel names and units
- sample counts
- RPM min/max/average
- GPS speed, latitude, and longitude channels

Keep the DLL parser as a reference/oracle until `libxrk` has been validated on
more real files.
