<#
.SYNOPSIS
    สร้างทีม IT Helpdesk และบัญชีของสมาชิกที่ยังไม่มี โดยถามรหัสผ่านทีละคน

.DESCRIPTION
    ห่อ src/db/seed/support-team-cli.ts ไว้อีกชั้น เพื่อให้รหัสผ่านตั้งต้น
    ไม่ต้องถูกพิมพ์ลงไฟล์ .env ไม่ต้องอยู่ในประวัติคำสั่งของ PowerShell
    และไม่ต้องใช้รหัสเดียวกันทั้งทีม (ระบบนี้ยังไม่มีหน้าให้ผู้ใช้เปลี่ยนรหัสผ่านเอง
    รหัสร่วมกันจึงเท่ากับทุกคนเข้าบัญชีของกันและกันได้ตลอดไป)

    รหัสผ่านถูกอ่านเป็น SecureString แล้วแปลงเป็นข้อความธรรมดาเฉพาะตอนใส่ลง
    ตัวแปรสภาพแวดล้อมของโปรเซสนี้เท่านั้น และถูกลบทิ้งใน finally เสมอ
    แม้สคริปต์จะล้มกลางทางหรือถูกกด Ctrl+C

    บัญชีที่มีอยู่แล้วจะไม่ถูกเปลี่ยนรหัสผ่าน — กด Enter ผ่านไปได้เลย

.PARAMETER DatabaseUrlPrompt
    ถาม connection string ของฐานข้อมูลปลายทางด้วย (แบบซ่อนตัวอักษร)
    แล้วใช้เฉพาะการรันครั้งนี้ ไม่ถูกเขียนลงไฟล์ใด — ใช้ตอนรันกับ production
    ถ้าไม่ระบุสวิตช์นี้ จะใช้ค่าจาก backend/.env ตามปกติ

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\create-it-team.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\create-it-team.ps1 -DatabaseUrlPrompt

.NOTES
    บรรทัดแรกที่ CLI พิมพ์ออกมาคือ host ของฐานข้อมูลปลายทาง — ดูให้แน่ใจก่อนว่าถูกตัว
#>

[CmdletBinding()]
param(
    [switch]$DatabaseUrlPrompt,

    # ถามรหัสผ่านครั้งเดียวแล้วใช้กับทุกบัญชีที่ต้องสร้างใหม่ (ผ่าน SEED_TEAM_PASSWORD)
    # เจ้าของระบบเลือกแบบนี้เอง — ข้อเสียคือระบบยังไม่มีหน้าให้ผู้ใช้เปลี่ยนรหัสผ่านเอง
    # ทุกคนในทีมจึงรู้รหัสของกันและกัน จนกว่าผู้ดูแลจะรีเซ็ตรายคนจากหน้าจัดการผู้ใช้
    [switch]$SamePassword
)

$ErrorActionPreference = 'Stop'

# ── รายชื่อผู้ใช้ ────────────────────────────────────────────────────────
# ต้องตรงกับ src/db/seed/data/support-teams.ts — เพิ่ม/ลบคนที่นั่นแล้วแก้ที่นี่ด้วย
# (สคริปต์นี้แค่ถามรหัสผ่าน ส่วนชื่อจริง บทบาท และหัวหน้าทีมอยู่ในไฟล์ข้อมูลนั้น)
$users = 'it.golf', 'support_lead', 'it.anon', 'it.park', 'it.alex', 'it.boss'

function ConvertTo-PlainText {
    param([Parameter(Mandatory = $true)][System.Security.SecureString]$Secure)

    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        # คืนหน่วยความจำที่เก็บรหัสผ่านไว้ทันที ไม่รอ garbage collector
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

# backend/ คือโฟลเดอร์แม่ของ scripts/ — CLI ต้องรันจากที่นั่นเพราะอ่าน .env และ src/
$backend = Split-Path -Parent $PSScriptRoot

# ชื่อตัวแปรทุกตัวที่สคริปต์นี้ตั้ง เพื่อลบทิ้งให้ครบใน finally
$touched = New-Object System.Collections.Generic.List[string]
$exitCode = 1

try {
    if ($DatabaseUrlPrompt) {
        Write-Host ''
        Write-Host 'ใส่ connection string ของฐานข้อมูลปลายทาง (ตัวอักษรจะไม่แสดง)' -ForegroundColor Yellow
        $secureUrl = Read-Host -AsSecureString 'DATABASE_URL'
        $plainUrl = ConvertTo-PlainText $secureUrl
        if ([string]::IsNullOrWhiteSpace($plainUrl)) {
            throw 'ไม่ได้ใส่ connection string — ยกเลิก'
        }
        Set-Item -Path 'Env:DATABASE_URL' -Value $plainUrl
        Set-Item -Path 'Env:MIGRATE_URL' -Value $plainUrl
        $touched.Add('DATABASE_URL')
        $touched.Add('MIGRATE_URL')
        $plainUrl = $null
    }

    Write-Host ''
    Write-Host 'ใส่รหัสผ่านตั้งต้นของแต่ละบัญชี (ตัวอักษรจะไม่แสดง)' -ForegroundColor Cyan
    Write-Host 'นโยบาย 3.2: ยาว 12 ตัวขึ้นไป มีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และสัญลักษณ์'
    Write-Host 'บัญชีที่มีอยู่แล้วไม่ถูกเปลี่ยนรหัสผ่าน — กด Enter ผ่านไปได้'
    Write-Host ''

    if ($SamePassword) {
        # CLI ตกลงมาใช้ SEED_TEAM_PASSWORD เองเมื่อไม่มีตัวแปรรายคน
        $secure = Read-Host -AsSecureString ('รหัสผ่านร่วมของทั้งทีม (' + ($users -join ', ') + ')')
        $plain = ConvertTo-PlainText $secure
        if (-not [string]::IsNullOrEmpty($plain)) {
            Set-Item -Path 'Env:SEED_TEAM_PASSWORD' -Value $plain
            $touched.Add('SEED_TEAM_PASSWORD')
        }
        $plain = $null
        $secure = $null
    }
    else {
        foreach ($u in $users) {
            # ต้องตรงกับ passwordEnvName() ใน data/support-teams.ts: ไม่ใช่ A-Z0-9 กลายเป็น _
            $varName = 'SEED_TEAM_PASSWORD_' + ($u.ToUpperInvariant() -replace '[^A-Z0-9]', '_')

            $secure = Read-Host -AsSecureString ('รหัสผ่านของ ' + $u)
            $plain = ConvertTo-PlainText $secure

            # ค่าว่าง = ข้าม (บัญชีมีอยู่แล้ว) — ตั้งตัวแปรเป็นค่าว่างไม่ได้บน Windows
            if (-not [string]::IsNullOrEmpty($plain)) {
                Set-Item -Path ('Env:' + $varName) -Value $plain
                $touched.Add($varName)
            }
            $plain = $null
            $secure = $null
        }
    }

    Write-Host ''
    Push-Location $backend
    try {
        & npx tsx src/db/seed/support-team-cli.ts
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($exitCode -ne 0) {
        Write-Host ''
        Write-Host 'CLI จบด้วยข้อผิดพลาด — อ่านข้อความด้านบน' -ForegroundColor Red
    }
}
finally {
    # ⚠️ ต้องลบทุกครั้ง ทั้งตอนสำเร็จ ตอนล้ม และตอนถูกขัดจังหวะ
    #    ถ้าปล่อยค้าง คำสั่งอื่นที่รันในหน้าต่างเดียวกันจะเห็นรหัสผ่านทั้งชุด
    foreach ($name in $touched) {
        $path = 'Env:' + $name
        if (Test-Path -Path $path) {
            Remove-Item -Path $path
        }
    }
    $touched.Clear()
    [System.GC]::Collect()
}

exit $exitCode
