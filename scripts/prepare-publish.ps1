$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publishFiles = @(
    '.gitignore', '.env.example', 'package.json', 'package-lock.json',
    'vite.config.js', 'playwright.config.js', 'index.html', 'firebase.json',
    'firestore.rules', 'README.md', 'HASZNALATI_UTMUTATO.txt', 'TELEPITES_TELEFONRA.txt'
)
foreach ($directory in @('src', 'public', 'scripts', 'tests', '.github')) {
    Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse -Force | ForEach-Object {
        if (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Symbolic link cannot be published.' }
        $publishFiles += $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
    }
}
$publishFiles = @($publishFiles | Sort-Object -Unique)
foreach ($relative in $publishFiles) {
    if ($relative -ne '.env.example' -and $relative -match '(^|/)(\.env[^/]*|\.git|\.cache|node_modules|dist|artifacts|test-results)(/|$)|\.(log|pem|key)$|service.?account|firebase-adminsdk') {
        throw "Private or generated path rejected: $relative"
    }
    $resolved = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $resolved.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'File outside project root rejected.'
    }
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Missing publication file: $relative" }
}
Add-Type -AssemblyName System.IO.Compression
$archivePath = Join-Path $projectRoot 'PUBLISH_READY.zip'
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
try {
    $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($relative in $publishFiles) {
            $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
            $output = $entry.Open()
            $inputFile = [System.IO.File]::OpenRead((Join-Path $projectRoot $relative))
            try { $inputFile.CopyTo($output) } finally { $inputFile.Dispose(); $output.Dispose() }
        }
    } finally { $archive.Dispose() }
} finally { $stream.Dispose() }
Write-Output "Prepared $($publishFiles.Count) source files: $archivePath"
Write-Output 'Excluded local configuration, user data, logs, dependencies and test artifacts.'
