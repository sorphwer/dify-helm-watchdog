# Dify Helm Chart Values 提取工具使用指南

## 📋 简介

`get-dify-values.sh` 是一个用于从 Dify 的 Helm Chart 仓库中提取特定版本的默认 `values.yaml` 配置文件的工具。

**适用场景：**
- 📖 查看 Dify 各版本的默认配置
- 🔧 基于官方配置创建自定义 values.yaml
- 🔄 对比不同版本之间的配置变化
- 📊 分析配置文件结构
- 📝 生成配置文档

## 🚀 快速开始

### 查看可用版本

```bash
./get-dify-values.sh
```

输出示例：
```
[INFO] Available Dify Helm Chart versions:

NAME         CHART VERSION    APP VERSION    DESCRIPTION
dify/dify    3.5.3           1.8.2          Release https://langgenius.github.io/dify-helm/
dify/dify    3.5.2           1.8.2          Release https://langgenius.github.io/dify-helm/
dify/dify    3.5.1           1.8.2          Release https://langgenius.github.io/dify-helm/
...
```

### 基本使用

```bash
# 显示特定版本的 values.yaml 内容
./get-dify-values.sh 3.5.3

# 保存 values.yaml 到文件
./get-dify-values.sh 3.5.3 file

# 与上一版本对比
./get-dify-values.sh 3.5.3 compare
```

## 📖 使用方法

### 基本语法

```bash
./get-dify-values.sh [版本号] [模式]
./get-dify-values.sh [命令] [参数]
```

### 模式说明

#### 1. display（显示模式，默认）

直接在终端显示 values.yaml 的内容。

```bash
./get-dify-values.sh 3.5.3
# 或
./get-dify-values.sh 3.5.3 display
```

**输出示例：**
```yaml
# =============================================
# Dify Helm Chart v3.5.3 - values.yaml
# =============================================

global:
  host: ""
  enableTLS: false
  
api:
  image:
    repository: langgenius/dify-api
    tag: 6106207039da1d6d14470273bf5522de9c39d1b0
...
```

#### 2. file（文件模式）

将 values.yaml 保存到文件 `dify-values-<version>.yaml`。

```bash
./get-dify-values.sh 3.5.3 file
```

生成的文件包含：
- 版本信息头部
- 生成时间
- Chart 仓库地址
- 使用说明
- 完整的 values.yaml 内容

**输出信息：**
```
[SUCCESS] Values saved to: dify-values-3.5.3.yaml
[INFO] File size: 25432 bytes, 978 lines
```

#### 3. compare（对比模式）

保存当前版本并与前一个版本进行对比。

```bash
./get-dify-values.sh 3.5.3 compare
```

**功能：**
- 自动查找前一个版本
- 下载前一版本的 values.yaml（如果不存在）
- 显示两个版本的差异（使用 diff）
- 保存两个版本的文件供后续查看

### 命令说明

#### 1. all（批量下载）

下载所有可用版本的 values.yaml。

```bash
./get-dify-values.sh all
```

**输出：**
```
[INFO] Downloading values.yaml for all available versions...
[INFO] Processing version 3.5.3 (1/10)...
[SUCCESS] ✓ 3.5.3
[INFO] Processing version 3.5.2 (2/10)...
[SUCCESS] ✓ 3.5.2
...
[SUCCESS] All versions processed
[INFO] Files created: dify-values-*.yaml
```

#### 2. structure（结构分析）

分析 values.yaml 的配置结构。

```bash
./get-dify-values.sh structure 3.5.3
# 或
./get-dify-values.sh struct 3.5.3
```

**输出示例：**
```
# =============================================
# Dify v3.5.3 - values.yaml Structure
# =============================================

[INFO] Top-level configuration sections:
  - global
  - api
  - worker
  - web
  - sandbox
  - postgresql
  - redis
  - minio
  ...

[INFO] File statistics:
  Total lines: 978
  Comment lines: 256
  Configuration lines: 722
  File size: 25432 bytes

[INFO] Container images referenced:
  repository: langgenius/dify-api
  repository: langgenius/dify-sandbox
  repository: postgres
  repository: redis
  ...
```

#### 3. help（帮助信息）

显示完整的帮助文档。

```bash
./get-dify-values.sh help
# 或
./get-dify-values.sh --help
./get-dify-values.sh -h
```

## 💡 实际应用场景

### 场景 1：创建自定义配置文件

**用途：** 基于官方默认配置创建自己的 values.yaml

```bash
# 1. 获取默认配置
./get-dify-values.sh 3.5.3 file

# 2. 复制为自定义配置
cp dify-values-3.5.3.yaml my-custom-values.yaml

# 3. 编辑自定义配置
vim my-custom-values.yaml

# 4. 使用自定义配置安装
helm install dify dify/dify --version 3.5.3 -f my-custom-values.yaml
```

### 场景 2：版本升级配置迁移

**用途：** 了解版本升级时配置的变化

```bash
# 获取当前版本配置
./get-dify-values.sh 3.5.2 file

# 获取新版本配置并对比
./get-dify-values.sh 3.5.3 compare

# 查看差异，更新自定义配置
# 根据 diff 输出调整 my-custom-values.yaml
```

### 场景 3：配置文档生成

**用途：** 为团队生成配置说明文档

```bash
#!/bin/bash
# generate-config-docs.sh

VERSION="3.5.3"

# 获取配置文件
./get-dify-values.sh ${VERSION} file

# 分析结构
./get-dify-values.sh structure ${VERSION} > config-structure.txt

# 生成文档
cat > config-docs.md <<EOF
# Dify ${VERSION} 配置文档

## 配置文件

完整配置文件: [dify-values-${VERSION}.yaml](./dify-values-${VERSION}.yaml)

## 配置结构

\`\`\`
$(cat config-structure.txt)
\`\`\`

## 主要配置项

### Global 全局配置
- host: 域名配置
- enableTLS: 是否启用 TLS

### API 服务配置
- image: 容器镜像配置
- replicas: 副本数
- resources: 资源限制

### Database 数据库配置
- postgresql: PostgreSQL 配置
- redis: Redis 配置

...（根据实际配置补充）

EOF

echo "✓ 配置文档已生成: config-docs.md"
```

### 场景 4：多版本配置归档

**用途：** 保存所有版本的配置供查阅

```bash
#!/bin/bash
# archive-all-configs.sh

ARCHIVE_DIR="dify-configs-archive"
mkdir -p "${ARCHIVE_DIR}"

echo "Archiving all Dify Helm Chart configurations..."

# 下载所有版本
./get-dify-values.sh all

# 移动到归档目录
mv dify-values-*.yaml "${ARCHIVE_DIR}/"

# 创建索引
cat > "${ARCHIVE_DIR}/INDEX.md" <<EOF
# Dify Helm Chart 配置归档

归档时间: $(date)

## 版本列表

EOF

ls "${ARCHIVE_DIR}"/dify-values-*.yaml | while read file; do
    filename=$(basename "$file")
    version=$(echo "$filename" | sed 's/dify-values-\(.*\)\.yaml/\1/')
    size=$(wc -l < "$file" | tr -d ' ')
    echo "- [${version}](./${filename}) - ${size} lines" >> "${ARCHIVE_DIR}/INDEX.md"
done

# 打包
tar -czf "dify-configs-archive-$(date +%Y%m%d).tar.gz" "${ARCHIVE_DIR}"

echo "✓ 归档完成: dify-configs-archive-$(date +%Y%m%d).tar.gz"
```

### 场景 5：配置变更追踪

**用途：** 追踪特定配置项在不同版本中的变化

```bash
#!/bin/bash
# track-config-changes.sh

CONFIG_KEY="api.image.tag"
VERSIONS=("3.5.1" "3.5.2" "3.5.3")

echo "Tracking changes for: ${CONFIG_KEY}"
echo "=================================="

for version in "${VERSIONS[@]}"; do
    ./get-dify-values.sh ${version} file > /dev/null 2>&1
    
    if command -v yq &> /dev/null; then
        value=$(yq eval ".${CONFIG_KEY}" "dify-values-${version}.yaml")
        echo "v${version}: ${value}"
    else
        echo "v${version}: (需要安装 yq 来解析)"
    fi
done
```

### 场景 6：配置验证

**用途：** 验证自定义配置的有效性

```bash
#!/bin/bash
# validate-custom-config.sh

CUSTOM_CONFIG="my-custom-values.yaml"
OFFICIAL_VERSION="3.5.3"

echo "Validating custom configuration against official v${OFFICIAL_VERSION}..."

# 获取官方配置
./get-dify-values.sh ${OFFICIAL_VERSION} file

# 使用 helm 验证
helm lint dify/dify --version ${OFFICIAL_VERSION} -f ${CUSTOM_CONFIG}

if [ $? -eq 0 ]; then
    echo "✓ Configuration is valid"
else
    echo "✗ Configuration has errors"
fi

# 对比差异
if command -v yq &> /dev/null; then
    echo ""
    echo "Top-level keys in official config:"
    yq eval 'keys' "dify-values-${OFFICIAL_VERSION}.yaml"
    
    echo ""
    echo "Top-level keys in custom config:"
    yq eval 'keys' "${CUSTOM_CONFIG}"
fi
```

## 🔧 依赖工具安装

### 必需工具

#### Helm

```bash
# macOS
brew install helm

# Linux (脚本安装)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# 验证安装
helm version
```

### 推荐工具（可选）

#### yq - YAML 处理工具

用于更好的 YAML 解析和处理。

```bash
# macOS
brew install yq

# Linux (Debian/Ubuntu)
sudo apt-get update
sudo apt-get install yq

# Linux (通用方法)
VERSION=v4.35.1
BINARY=yq_linux_amd64
wget https://github.com/mikefarah/yq/releases/download/${VERSION}/${BINARY} -O /usr/local/bin/yq
chmod +x /usr/local/bin/yq

# 验证安装
yq --version
```

#### jq - JSON 处理工具

用于处理 Helm 输出的 JSON 格式数据。

```bash
# macOS
brew install jq

# Linux (Debian/Ubuntu)
sudo apt-get install jq

# Linux (CentOS/RHEL)
sudo yum install jq

# 验证安装
jq --version
```

#### colordiff - 彩色 diff 工具

让版本对比更清晰。

```bash
# macOS
brew install colordiff

# Linux (Debian/Ubuntu)
sudo apt-get install colordiff

# Linux (CentOS/RHEL)
sudo yum install colordiff
```

## 📊 完整使用示例

### 示例 1：版本升级配置迁移流程

```bash
#!/bin/bash
# upgrade-config-migration.sh

CURRENT_VERSION="3.5.2"
TARGET_VERSION="3.5.3"
CUSTOM_CONFIG="production-values.yaml"
NEW_CONFIG="production-values-${TARGET_VERSION}.yaml"

echo "Migrating configuration from ${CURRENT_VERSION} to ${TARGET_VERSION}..."

# 1. 获取两个版本的官方配置
./get-dify-values.sh ${CURRENT_VERSION} file
./get-dify-values.sh ${TARGET_VERSION} file

# 2. 对比差异
echo ""
echo "=== Configuration Changes ==="
./get-dify-values.sh ${TARGET_VERSION} compare

# 3. 备份当前配置
cp ${CUSTOM_CONFIG} "${CUSTOM_CONFIG}.backup-$(date +%Y%m%d)"
echo "✓ Backup created: ${CUSTOM_CONFIG}.backup-$(date +%Y%m%d)"

# 4. 创建新配置（基于目标版本）
cp "dify-values-${TARGET_VERSION}.yaml" ${NEW_CONFIG}
echo "✓ New config template created: ${NEW_CONFIG}"

echo ""
echo "Next steps:"
echo "1. Review the diff output above"
echo "2. Manually merge your custom settings from ${CUSTOM_CONFIG} to ${NEW_CONFIG}"
echo "3. Validate the new configuration"
echo "4. Test in a staging environment"
```

### 示例 2：配置审计报告

```bash
#!/bin/bash
# config-audit-report.sh

VERSION="3.5.3"
OUTPUT_DIR="audit-report-$(date +%Y%m%d)"

mkdir -p "${OUTPUT_DIR}"

echo "Generating configuration audit report for Dify v${VERSION}..."

# 1. 获取配置文件
./get-dify-values.sh ${VERSION} file
cp "dify-values-${VERSION}.yaml" "${OUTPUT_DIR}/"

# 2. 分析结构
./get-dify-values.sh structure ${VERSION} > "${OUTPUT_DIR}/structure.txt"

# 3. 提取关键配置项
if command -v yq &> /dev/null; then
    cat > "${OUTPUT_DIR}/key-configs.txt" <<EOF
=== Security Settings ===
$(yq eval '.global.enableTLS' "dify-values-${VERSION}.yaml" 2>/dev/null || echo "Not found")

=== Resource Limits ===
API:
$(yq eval '.api.resources' "dify-values-${VERSION}.yaml" 2>/dev/null || echo "Not found")

Worker:
$(yq eval '.worker.resources' "dify-values-${VERSION}.yaml" 2>/dev/null || echo "Not found")

=== Database Settings ===
PostgreSQL enabled: $(yq eval '.postgresql.enabled' "dify-values-${VERSION}.yaml" 2>/dev/null || echo "Not found")
Redis enabled: $(yq eval '.redis.enabled' "dify-values-${VERSION}.yaml" 2>/dev/null || echo "Not found")

=== Storage Settings ===
MinIO enabled: $(yq eval '.minio.enabled' "dify-values-${VERSION}.yaml" 2>/dev/null || echo "Not found")
EOF
fi

# 4. 生成报告
cat > "${OUTPUT_DIR}/REPORT.md" <<EOF
# Dify v${VERSION} 配置审计报告

生成时间: $(date)

## 1. 配置文件信息

- 文件: dify-values-${VERSION}.yaml
- 大小: $(wc -c < "dify-values-${VERSION}.yaml" | tr -d ' ') bytes
- 行数: $(wc -l < "dify-values-${VERSION}.yaml" | tr -d ' ') lines

## 2. 配置结构

\`\`\`
$(cat "${OUTPUT_DIR}/structure.txt")
\`\`\`

## 3. 关键配置项

\`\`\`
$(cat "${OUTPUT_DIR}/key-configs.txt" 2>/dev/null || echo "需要安装 yq 来提取关键配置")
\`\`\`

## 4. 建议

- 检查 TLS 配置是否符合安全要求
- 审查资源限制是否满足生产环境需求
- 确认数据库和存储配置正确
- 验证镜像版本和标签

EOF

echo "✓ Audit report generated in: ${OUTPUT_DIR}/"
ls -lh "${OUTPUT_DIR}/"
```

## ❓ 常见问题

### Q1: 脚本提示 "helm: command not found"

**原因：** 系统未安装 Helm

**解决：**
```bash
# macOS
brew install helm

# Linux
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Q2: 为什么要安装 yq？

**原因：** yq 提供更准确的 YAML 解析和处理能力。

**影响：** 
- 不安装 yq 时，`structure` 命令会使用基础的 grep 解析，功能有限
- 某些高级场景（如提取特定配置项）需要 yq

**建议：** 对于生产环境建议安装 yq。

### Q3: compare 模式找不到前一版本怎么办？

**原因：** 
1. 当前版本是最旧的版本
2. jq 未安装，无法解析版本列表

**解决：**
```bash
# 安装 jq
brew install jq  # macOS
sudo apt install jq  # Linux

# 手动指定要对比的版本
./get-dify-values.sh 3.5.2 file
./get-dify-values.sh 3.5.3 file
diff -u dify-values-3.5.2.yaml dify-values-3.5.3.yaml
```

### Q4: 如何只查看某个配置节的内容？

**方法 1：使用 yq**
```bash
# 获取配置文件
./get-dify-values.sh 3.5.3 file

# 查看特定节
yq eval '.api' dify-values-3.5.3.yaml
yq eval '.postgresql' dify-values-3.5.3.yaml
```

**方法 2：使用 grep**
```bash
# 显示并通过管道传递给 grep
./get-dify-values.sh 3.5.3 | grep -A 20 "^api:"
```

### Q5: 下载的 values.yaml 文件很大，如何快速查看？

```bash
# 只查看前 50 行
./get-dify-values.sh 3.5.3 | head -50

# 使用 less 分页查看
./get-dify-values.sh 3.5.3 | less

# 搜索特定内容
./get-dify-values.sh 3.5.3 | grep -i "postgres"
```

### Q6: 如何验证下载的配置文件是否完整？

```bash
# 检查文件大小和行数
./get-dify-values.sh 3.5.3 file

# 输出会显示：
# [INFO] File size: 25432 bytes, 978 lines

# 使用 helm 验证语法
helm lint dify/dify --version 3.5.3 -f dify-values-3.5.3.yaml
```

### Q7: 批量下载所有版本时失败怎么办？

```bash
# 方法 1：逐个下载
helm search repo dify/dify --versions -o json | jq -r '.[].version' | while read version; do
    echo "Downloading ${version}..."
    ./get-dify-values.sh ${version} file || echo "Failed: ${version}"
done

# 方法 2：只下载最近的几个版本
helm search repo dify/dify --versions -o json | jq -r '.[].version' | head -5 | while read version; do
    ./get-dify-values.sh ${version} file
done
```

## 🎯 最佳实践

### 1. 配置文件版本控制

```bash
# 创建配置仓库
mkdir dify-configs
cd dify-configs
git init

# 下载配置
../get-dify-values.sh 3.5.3 file
mv dify-values-3.5.3.yaml official/

# 创建自定义配置
cp official/dify-values-3.5.3.yaml custom/production.yaml

# 提交到 Git
git add .
git commit -m "Add Dify 3.5.3 configurations"
```

### 2. 配置模板管理

```bash
# 为不同环境创建配置模板
./get-dify-values.sh 3.5.3 file
cp dify-values-3.5.3.yaml templates/base.yaml
cp dify-values-3.5.3.yaml templates/dev.yaml
cp dify-values-3.5.3.yaml templates/staging.yaml
cp dify-values-3.5.3.yaml templates/production.yaml

# 分别编辑每个环境的配置
```

### 3. 定期同步官方配置

```bash
# 添加到 crontab，每周检查一次
0 9 * * 1 /path/to/sync-official-configs.sh

# sync-official-configs.sh
#!/bin/bash
LATEST_VERSION=$(helm search repo dify/dify -o json | jq -r '.[0].version')
/path/to/get-dify-values.sh ${LATEST_VERSION} file
# 发送通知或提交到 Git
```

### 4. 配置变更通知

```bash
#!/bin/bash
# config-change-notification.sh

CURRENT=$(cat .current-version 2>/dev/null || echo "3.5.2")
LATEST=$(helm search repo dify/dify -o json | jq -r '.[0].version')

if [ "$CURRENT" != "$LATEST" ]; then
    echo "New version detected: ${LATEST}"
    ./get-dify-values.sh ${LATEST} compare
    echo ${LATEST} > .current-version
    # 发送邮件或 Slack 通知
fi
```

## 🔧 工作原理

脚本的工作流程：

1. **检查依赖**：验证 Helm 是否已安装
2. **添加仓库**：自动添加 Dify Helm 仓库（如果未添加）
3. **更新索引**：更新仓库索引以获取最新版本信息
4. **获取配置**：使用 `helm show values` 命令提取指定版本的 values.yaml
5. **处理输出**：根据选择的模式（display/file/compare）处理输出
6. **清理临时文件**：自动清理临时目录

**技术细节：**
- 使用 `helm show values` 而不是 `helm pull` 以提高效率
- 所有进度信息输出到 stderr，实际内容输出到 stdout，便于管道操作
- 临时文件使用 `mktemp` 创建，使用 `trap` 确保清理

## ⚠️ 注意事项

1. **网络要求**：首次运行或更新仓库时需要网络连接
2. **版本格式**：版本号必须精确匹配（如 `3.5.3`，不是 `v3.5.3`）
3. **文件覆盖**：file 模式会覆盖同名文件，请注意备份
4. **权限要求**：需要有当前目录的写权限（file 模式）
5. **Helm 版本**：建议使用 Helm 3.x，Helm 2.x 未测试

## 🐛 故障排查

### 错误：Repository "dify" not found

```bash
# 手动添加仓库
helm repo add dify https://langgenius.github.io/dify-helm
helm repo update dify

# 重新运行脚本
./get-dify-values.sh 3.5.3
```

### 错误：Failed to get values.yaml

- 检查版本号是否正确
- 检查网络连接
- 更新 Helm 仓库：`helm repo update dify`

### 错误：Permission denied

```bash
# 给脚本添加执行权限
chmod +x get-dify-values.sh

# 或使用 bash 运行
bash get-dify-values.sh 3.5.3
```

### diff 命令输出不清晰

```bash
# 安装 colordiff 以获得更好的输出
brew install colordiff  # macOS
sudo apt install colordiff  # Linux

# 或使用其他 diff 工具
./get-dify-values.sh 3.5.2 file
./get-dify-values.sh 3.5.3 file
vimdiff dify-values-3.5.2.yaml dify-values-3.5.3.yaml
```

## 📞 获取帮助

如果遇到问题：

1. 查看内置帮助：`./get-dify-values.sh help`
2. 检查依赖工具：`helm version`
3. 启用调试模式：`bash -x ./get-dify-values.sh 3.5.3`
4. 查看本文档的"常见问题"和"故障排查"部分

## 📄 许可证

MIT License

---

**最后更新：** 2025-10-20

