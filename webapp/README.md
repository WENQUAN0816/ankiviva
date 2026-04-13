# AnkiViva Web

简化版博士答辩训练网页。

## 当前功能

- 登录 / 注册
- 按章节顺序或按问题组乱序
- `随机分支` / `手动分支` / `全分支`
- 问题使用固定 MP3 播放
- MP3 播放完成后开始计时
- 你手动点击一次开始录音，再点一次结束录音
- 录音本地保存，同时在服务器模式下上传到 `uploads/`
- 不显示问题文字
- 不显示系统参考答案
- 提供“我的备答”并支持保存

## 启动

```powershell
cd /d E:\github论文本地部署\ankiviva\webapp
python server.py
```

或双击 `start.bat`

默认地址：

```text
http://127.0.0.1:8780
```

## 题目音频

题目音频由 Google TTS 批量生成：

```powershell
python tools\generate_google_audio.py
```

生成后会写入：

- `audio/prompts/`
- `data/prompt_audio_manifest.json`

## 注意

如果作为纯静态网页部署，例如 GitHub Pages，则上传接口不可用，此时录音只保存在浏览器本地。  
如果通过 `server.py` 或其他后端服务器运行，则录音会上传并保存到服务器端 `uploads/` 目录。
