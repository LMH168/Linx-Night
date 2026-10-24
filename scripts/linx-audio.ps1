param([string]$OutputDirectory = (Join-Path $env:LOCALAPPDATA 'LinxNight/audio'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-CN' } | Select-Object -First 1
    if (-not $voice) { throw '未安装中文桌面语音，请在 Windows 语言设置中安装中文语音。' }
    $synth.SelectVoice($voice.VoiceInfo.Name)
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $phrases = @{
        turn = '请先查询游戏公开状态和自己的私密状态。只执行当前允许的一次行动，使用私密状态中的当前回合编号作为 turn_id。狼人跟随已有目标提案；猎人使用当前窗口编号。工具成功后立即结束，不要说出私密身份。'
        query = '请查询当前游戏状态和你自己的身份。'
        speech = '先查询当前状态，轮到你时调用工具提交一段公开发言。'
        vote = '先查询当前状态，然后调用投票工具投给三号玩家。'
    }
    foreach ($name in $phrases.Keys) {
        $file = Join-Path $OutputDirectory ($name + '.wav')
        $synth.SetOutputToWaveFile($file, $format)
        $synth.Speak($phrases[$name])
        $synth.SetOutputToNull()
        Write-Output $file
    }
} finally { $synth.Dispose() }
