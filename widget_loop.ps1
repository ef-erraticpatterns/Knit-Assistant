# Knit Assistant Widget Loop
# Polls for pending feedback tasks every minute and calls Claude to execute them.

$API = "http://127.0.0.1:5001"
$DIR = $PSScriptRoot

function Get-PendingTasks {
    try {
        $r = Invoke-RestMethod -Uri "$API/api/claude-tasks" -Method GET
        return @($r.tasks | Where-Object { $_.status -eq "pending" })
    } catch {
        return @()
    }
}

function Set-TaskStatus {
    param($id, $status, $note)
    $body = '{"status":"' + $status + '","claude_note":"' + $note + '"}'
    try {
        Invoke-RestMethod -Uri "$API/api/claude-tasks/$id" -Method PATCH -ContentType "application/json" -Body $body | Out-Null
    } catch {}
}

function Invoke-Claude {
    param($prompt)
    $tmp = [System.IO.Path]::GetTempFileName() + ".txt"
    [System.IO.File]::WriteAllText($tmp, $prompt, [System.Text.Encoding]::UTF8)
    $result = & claude --dangerously-skip-permissions --print (Get-Content $tmp -Raw)
    Remove-Item $tmp -ErrorAction SilentlyContinue
    return $result
}

Write-Host ""
Write-Host "Knit Assistant Widget Loop started. Checking every 1 minute." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

while ($true) {
    $pending = Get-PendingTasks

    if ($pending.Count -gt 0) {
        $newest = ($pending | Sort-Object created_at -Descending | Select-Object -First 1).created_at
        $age = (Get-Date).ToUniversalTime() - [datetime]::Parse($newest)

        if ($age.TotalSeconds -lt 180) {
            Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] $($pending.Count) task(s) pending — waiting for batch to settle..." -ForegroundColor Yellow
            Start-Sleep -Seconds 60
            continue
        }

        Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Executing $($pending.Count) task(s)..." -ForegroundColor Cyan

        foreach ($t in $pending) {
            Set-TaskStatus $t.id "in_progress" "Working on it..."
        }

        $lines = @()
        foreach ($t in $pending) {
            $line = "Task #$($t.id): $($t.feedback)"
            if ($t.element_context) { $line += " [context: $($t.element_context)]" }
            $lines += $line
        }
        $taskList = $lines -join "`n"

        $patchLines = @()
        foreach ($t in $pending) {
            $patchLines += "  PATCH $API/api/claude-tasks/$($t.id)"
        }
        $patchList = $patchLines -join "`n"

        $loopPrompt = [System.IO.File]::ReadAllText("$DIR\claude_loop_prompt.md", [System.Text.Encoding]::UTF8)

        $prompt = $loopPrompt + "`n`n## Tasks to execute now`n`n" + $taskList + "`n`nAfter completing ALL tasks, PATCH each one done with a claude_note summarising what you changed.`nPATCH URLs:`n" + $patchList + "`n`nWork from C:\Users\Liz\Desktop\KnitAssistant. Focus only on these tasks."

        $output = Invoke-Claude $prompt
        Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Done." -ForegroundColor Green
        Write-Host $output
    } else {
        Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] No pending tasks." -ForegroundColor DarkGray
    }

    Start-Sleep -Seconds 60
}
