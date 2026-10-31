param([string]$OutputDirectory = (Join-Path $env:LOCALAPPDATA 'LinxNight/audio'), [switch]$IncludeHunterTest, [switch]$ShortTriggers)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-CN' } | Select-Object -First 1
    if (-not $voice) { throw '未安装中文桌面语音，请在 Windows 语言设置中安装中文语音。' }
    $synth.SelectVoice($voice.VoiceInfo.Name)
    $synth.Rate = 3
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $phrases = @{
        turn = '查私密状态，执行当前行动。'
        'vote-turn' = '查私密状态，选存活玩家，调用投票工具。'
        hunter = '你已死亡，查私密状态，开枪或放弃。'
        query = '请查询当前游戏状态和你自己的身份。'
        speech = '先查询当前状态，轮到你时调用工具提交一段公开发言。'
        vote = '先查询当前状态，然后调用投票工具投给三号玩家。'
    }
    if ($ShortTriggers) { $phrases['turn'] = '查状态，执行行动。'; $phrases['speech'] = '查状态，提交发言。'; $phrases['vote-turn'] = '查状态，提交投票。'; $phrases['hunter'] = '查状态，开枪或跳过。'; $synth.Rate = 5 }
    if ($IncludeHunterTest) { $phrases['hunter-shoot'] = '查私密状态，调用开枪工具打三号。' }
    foreach ($name in $phrases.Keys) {
        $file = Join-Path $OutputDirectory ($name + '.wav')
        $synth.SetOutputToWaveFile($file, $format)
        $synth.Speak($phrases[$name])
        $synth.SetOutputToNull()
        Write-Output $file
    }
} finally { $synth.Dispose() }
