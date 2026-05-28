$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
npm run build
npm run start
