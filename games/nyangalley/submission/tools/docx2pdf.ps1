# Convert submission/out/*.docx to PDF with Word and print page counts (plan must be <= 2 A4 pages).
#   usage: powershell -NoProfile -File submission/tools/docx2pdf.ps1
$out = Join-Path $PSScriptRoot "..\out"
$w = New-Object -ComObject Word.Application
$w.Visible = $false
try {
  foreach ($f in Get-ChildItem $out -Filter *.docx) {
    $pdf = [string](Join-Path $f.DirectoryName ($f.BaseName + ".pdf"))
    $doc = $w.Documents.Open($f.FullName, $false, $true)
    $pages = $doc.ComputeStatistics(2)
    $doc.ExportAsFixedFormat($pdf, 17)
    $doc.Close($false)
    "{0}: {1} pages" -f $f.Name, $pages
  }
} finally { $w.Quit() }
