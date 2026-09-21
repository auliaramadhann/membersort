# Manual Packaging

Native packages are built separately for each platform. Do not combine
Windows, macOS, and Linux binaries in one archive.

The package root must be a folder named `member-credits` with the following
structure for Linux and modern Windows installs:

```text
member-credits/
├── bin/64bit/member-credits.so
└── data/locale/en-US.ini
```

Windows uses the same structure with `member-credits.dll`. macOS uses a
`member-credits.plugin` bundle containing the equivalent binary and data
resources.
