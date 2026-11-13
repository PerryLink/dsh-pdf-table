# 故障排查 — dsh-pdf-table

每条按「症状 / 原因 / 动作」写。报错原文都是 `<一句人话>（E_XXX）｜下一步：<动作>`，
把 `E_XXX` 和这句话一起发到 issue 即可定位。不要把真实 PDF 或客户表格贴进 issue。

## 1. 扫描件没有文本层（E_PDF_NO_TEXT_LAYER）

- **症状**：`这份 PDF 没有文本层；这是扫描件，请先 OCR（E_PDF_NO_TEXT_LAYER）｜下一步：先用 OCR 工具生成带文本层的 PDF，再运行 pdf_inspect 或 pdf_tables`
- **原因**：PDF 只有页面图片，没有可选中的文字；本包不做 OCR，也不下载 OCR 模型。
- **动作**：先用 OCR 工具（本地或你信任的服务）生成带文本层的 PDF，再用 `pdf_inspect` 确认 `total_chars > 0`；确认后再跑 `pdf_tables` / `pdf_to_csv`。

## 2. 文件打不开（E_PDF_CORRUPT）

- **症状**：`这个 PDF 打不开，文件可能损坏或被截断（E_PDF_CORRUPT）｜下一步：先用 PDF 阅读器确认文件能正常打开，再重新导出一次`
- **原因**：文件被截断、下载不完整、扩展名是 `.pdf` 但内容不是 PDF，或 PDF 结构非法。
- **动作**：用系统 PDF 阅读器打开一次；能打开就从阅读器“另存为”一份新 PDF，再重试。仍失败请附上文件大小和 `pdf_inspect` 的完整报错行。

## 3. 空文件（E_PDF_EMPTY）

- **症状**：`这个 PDF 是空文件，没有可读内容（E_PDF_EMPTY）｜下一步：换一个非空、未损坏的 PDF；扫描件请先 OCR`
- **原因**：文件 0 字节，或 PDF 页数为 0。
- **动作**：确认路径指向真实文件且大小大于 0；重新导出后重试。

## 4. 页码不对（E_PDF_PAGE_RANGE）

- **症状**：`pages 里的页码超出范围或不是正整数（E_PDF_PAGE_RANGE）｜下一步：页码从 1 开始，按 pdf_inspect 返回的 pages 传入`
- **原因**：传了 `0`、负数、小数、超过页数的值，或传了空数组。
- **动作**：先跑 `pdf_inspect` 拿到 `pages`，再传 `[1]`、`[2,3]` 这样的 1-based 正整数；不传 `pages` 表示全部页。

## 5. 导出文件名不安全（E_PDF_PATH_INVALID / E_PDF_PATH_NOT_ALLOWED）

- **症状**：`导出路径越过了导出目录（E_PDF_PATH_NOT_ALLOWED）｜下一步：只传一个文件名，不要带 ../、目录分隔符或符号链接`
- **原因**：`filename` 里带了 `../`、`/`、反斜杠、空格、中文或超长路径；或解析后的路径跳出了 `exports/`。
- **动作**：只传一个 `[A-Za-z0-9._-]` 组成的文件名，例如 `report.csv`；不要传绝对路径。目录固定为 `$DSH_HOME/dsh-pdf-table/exports/`。

## 6. CSV 写不出去（E_PDF_EXPORT_FAILED）

- **症状**：`CSV 没写出去（E_PDF_EXPORT_FAILED）｜下一步：确认 $DSH_HOME/dsh-pdf-table 指向可写目录后重试`
- **原因**：`$DSH_HOME` 不存在、只读、磁盘满，或当前进程没有写权限。
- **动作**：确认 `$DSH_HOME` 指向可写目录（或测试时设 `DSH_PDF_TABLE_HOME` 到临时目录），再重试；不要用删除用户数据的方式“修复”。

## 7. 有密码（E_PDF_ENCRYPTED）

- **症状**：`这个 PDF 有密码保护，读不到文本层（E_PDF_ENCRYPTED）｜下一步：先用拥有者密码导出无密码副本，再重新运行`
- **原因**：PDF 加密，文本层无法直接读取。
- **动作**：用有权限的阅读器导出无密码副本，再运行。本包不猜测密码。

## 还不行

```sh
node samples/quickstart/run.mjs --check   # 自带样例必须通过
node --test test/*.test.mjs               # 32 项测试
node scripts/gate.mjs                     # 元数据 + 验收门
```

仍失败时请在 <https://github.com/PerryLink/dsh-pdf-table/issues> 附上：包版本、最小合成 PDF（或生成脚本）、
`pdf_inspect` / `pdf_tables` 的完整报错行、Node 与 DSH 版本。**不要附真实客户 PDF。**
