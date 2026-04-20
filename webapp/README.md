# AnkiViva Web

博士答辩训练网页。

## 当前功能

- 登录 / 注册
- 按章节顺序或按问题组乱序
- `随机分支` / `手动分支` / `全分支`
- 每次只处理当前这一题
- 默认先播放英文评委提问音频
- 录音开始后才显示英文字幕和中文对照
- 主问题提供 `Purpose / Conclusion / Logic / Evidence / Boundary` 的 40 秒英文参考答案
- 每一道题自动进入 `英文提问音频 -> 3 秒准备 -> 45 秒录音`
- 45 秒后自动结束录音，也可手动提前结束
- 录音本地保存，同时在服务器模式下上传到 `uploads/`
- 主问题显示系统结构化参考答案
- 提供“我的备答”并支持保存
- 可导出练习结果 ZIP，按答题顺序同时打包题目文本和对应录音
- 题库在原 25 题基础上补充了方法细节追问题组，当前总题组为 `31`

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

## 题库文件

- `data/questions.json`
- `data/questions_extra.json`
- `data/prompt_translations.json`
- `data/reference_answers_main.json`

网页启动时会自动合并两份题库。

## Azure Speech

- 本地配置文件：`local_settings.json`
- 示例文件：`local_settings.example.json`

网页会通过本地服务器调用 Azure Speech Services，把英文问题实时合成为缓存音频。

## 注意

如果作为纯静态网页部署，例如 GitHub Pages，则上传接口不可用，此时录音只保存在浏览器本地。  
如果通过 `server.py` 或其他后端服务器运行，则录音会上传并保存到服务器端 `uploads/` 目录。

## GitHub Pages

仓库已经包含 GitHub Pages 工作流：

- `.github/workflows/deploy-pages.yml`

部署后，预期访问地址为：

```text
https://wenquan0816.github.io/ankiviva/
```

说明：

- GitHub Pages 作为纯静态托管时，录音上传接口不可用
- 在线版录音将退回为“浏览器本地保存”
- 在线版仍可导出 ZIP，包含按顺序排列的题目文本与录音文件
- 如果需要真正在线保存录音，仍然需要额外后端或对象存储
