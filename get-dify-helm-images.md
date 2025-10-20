# Dify Helm Chart 镜像提取工具使用指南

## 📋 简介

`get-dify-helm-images.sh` 是一个高级工具，用于从 Dify 的 Helm Chart 仓库中提取特定版本的所有容器镜像信息，包括镜像名称、标签和完整的镜像地址。

**适用场景：**
- 🔍 查看 Dify 各版本使用的所有容器镜像
- 📦 准备离线部署所需的镜像列表
- 🔄 对比不同版本之间的镜像变化
- 📝 生成镜像清单文档
- 🚀 自动化镜像同步和管理

**特性：**
- ✅ 支持多种输出格式（Text、JSON、CSV）
- ✅ 优先使用 yq 进行准确解析，自动降级到 awk
- ✅ 结构化的镜像信息输出
- ✅ 自动化友好的数据格式

## 🚀 快速开始

### 查看可用版本

```bash
./get-dify-helm-images.sh
```

输出示例：
```
[INFO] Available versions:
NAME         CHART VERSION    APP VERSION    DESCRIPTION
dify/dify    3.5.3           1.8.2          Release https://langgenius.github.io/dify-helm/
dify/dify    3.5.2           1.8.2          Release https://langgenius.github.io/dify-helm/
dify/dify    3.5.1           1.8.2          Release https://langgenius.github.io/dify-helm/
...
```

### 基本使用

```bash
# 文本格式（默认）
./get-dify-helm-images.sh 3.5.3

# JSON 格式
./get-dify-helm-images.sh 3.5.3 json

# CSV 格式
./get-dify-helm-images.sh 3.5.3 csv
```

## 📖 使用方法

### 基本语法

```bash
./get-dify-helm-images.sh [版本号] [输出格式]
```

**参数说明：**
- `版本号`：Helm Chart 的版本号（例如：3.5.3）
- `输出格式`：可选，支持 `text`（默认）、`json`、`csv`

### 输出格式详解

#### 1. 文本格式（text，默认）

最直观易读的格式，适合人工查看。

```bash
./get-dify-helm-images.sh 3.5.3
# 或
./get-dify-helm-images.sh 3.5.3 text
```

**输出示例：**
```
======================================
Container Images by Service
======================================

Component: api
Image:     langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0
  Repository: langgenius/dify-api
  Tag:        6106207039da1d6d14470273bf5522de9c39d1b0

Component: worker
Image:     langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0
  Repository: langgenius/dify-api
  Tag:        6106207039da1d6d14470273bf5522de9c39d1b0

Component: web
Image:     busybox:1.36.1
  Repository: busybox
  Tag:        1.36.1

Component: sandbox
Image:     langgenius/dify-sandbox:0.2.12
  Repository: langgenius/dify-sandbox
  Tag:        0.2.12
...
```

#### 2. JSON 格式

结构化数据，适合程序处理和 API 集成。

```bash
./get-dify-helm-images.sh 3.5.3 json
```

**输出示例：**
```json
[
  {
    "component": "api",
    "repository": "langgenius/dify-api",
    "tag": "6106207039da1d6d14470273bf5522de9c39d1b0",
    "full_image": "langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0"
  },
  {
    "component": "worker",
    "repository": "langgenius/dify-api",
    "tag": "6106207039da1d6d14470273bf5522de9c39d1b0",
    "full_image": "langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0"
  },
  {
    "component": "sandbox",
    "repository": "langgenius/dify-sandbox",
    "tag": "0.2.12",
    "full_image": "langgenius/dify-sandbox:0.2.12"
  }
]
```

#### 3. CSV 格式

表格数据，适合 Excel 导入或数据分析。

```bash
./get-dify-helm-images.sh 3.5.3 csv
```

**输出示例：**
```csv
Component,Repository,Tag,Full Image
api,langgenius/dify-api,6106207039da1d6d14470273bf5522de9c39d1b0,langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0
worker,langgenius/dify-api,6106207039da1d6d14470273bf5522de9c39d1b0,langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0
sandbox,langgenius/dify-sandbox,0.2.12,langgenius/dify-sandbox:0.2.12
```

## 💡 实际应用场景

### 场景 1：生成镜像列表文件

**用途：** 保存到文件供后续使用

```bash
# 保存为文本文件
./get-dify-helm-images.sh 3.5.3 > dify-3.5.3-images.txt

# 保存为 JSON 文件
./get-dify-helm-images.sh 3.5.3 json > dify-3.5.3-images.json

# 保存为 CSV 文件
./get-dify-helm-images.sh 3.5.3 csv > dify-3.5.3-images.csv
```

### 场景 2：提取纯镜像地址列表

**用途：** 用于批量拉取镜像

```bash
# 方法1：从文本输出提取
./get-dify-helm-images.sh 3.5.3 | grep "Image:" | awk '{print $2}' > image-list.txt

# 方法2：从 JSON 提取（需要安装 jq）
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' > image-list.txt

# 方法3：从 CSV 提取
./get-dify-helm-images.sh 3.5.3 csv | tail -n +2 | cut -d',' -f4 > image-list.txt
```

**生成的 image-list.txt 内容示例：**
```
langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0
langgenius/dify-sandbox:0.2.12
busybox:1.36.1
postgres:15.3
redis:6.2.16
...
```

### 场景 3：批量拉取镜像到本地

**用途：** 离线部署前准备

```bash
# 先生成镜像列表
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' > image-list.txt

# 批量拉取镜像
cat image-list.txt | while read image; do
    echo "Pulling $image..."
    docker pull $image
done

# 或使用 xargs 并行拉取（更快）
cat image-list.txt | xargs -P 4 -I {} docker pull {}
```

### 场景 4：推送镜像到私有仓库

**用途：** 同步镜像到内网私有仓库

```bash
#!/bin/bash
# sync-to-private-registry.sh

# 私有仓库地址
PRIVATE_REGISTRY="registry.mycompany.com"

# 提取镜像列表
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' | while read image; do
    echo "Processing $image..."
    
    # 拉取原始镜像
    docker pull $image
    
    # 重新打标签
    new_image="$PRIVATE_REGISTRY/$image"
    docker tag $image $new_image
    
    # 推送到私有仓库
    docker push $new_image
    
    echo "✓ Pushed $new_image"
done
```

### 场景 5：对比不同版本的镜像差异

**用途：** 了解版本升级时镜像的变化

```bash
# 提取两个版本的镜像信息
./get-dify-helm-images.sh 3.5.2 csv > v3.5.2.csv
./get-dify-helm-images.sh 3.5.3 csv > v3.5.3.csv

# 比较差异
diff v3.5.2.csv v3.5.3.csv

# 或使用更友好的对比工具
diff -u v3.5.2.csv v3.5.3.csv | colordiff
```

### 场景 6：检查镜像是否已存在本地

**用途：** 验证镜像下载完整性

```bash
#!/bin/bash
# check-local-images.sh

echo "Checking local images..."
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' | while read image; do
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^$image$"; then
        echo "✓ $image - EXISTS"
    else
        echo "✗ $image - MISSING"
    fi
done
```

### 场景 7：生成 Docker Compose 配置片段

**用途：** 快速生成 Docker Compose 服务配置

```bash
# 使用 jq 格式化输出
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[] | "  \(.component):\n    image: \(.full_image)\n    container_name: dify-\(.component)\n"'
```

**输出示例：**
```yaml
  api:
    image: langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0
    container_name: dify-api

  worker:
    image: langgenius/dify-api:6106207039da1d6d14470273bf5522de9c39d1b0
    container_name: dify-worker
```

### 场景 8：检查镜像大小和层信息

**用途：** 分析镜像存储空间需求

```bash
#!/bin/bash
# analyze-image-sizes.sh

echo "Analyzing image sizes..."
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' | while read image; do
    if docker image inspect $image &>/dev/null; then
        size=$(docker image inspect $image --format='{{.Size}}' | awk '{printf "%.2f MB", $1/1024/1024}')
        echo "$image - $size"
    fi
done
```

### 场景 9：导出镜像为 tar 文件

**用途：** 完全离线环境的镜像传输

```bash
#!/bin/bash
# export-images-to-tar.sh

OUTPUT_DIR="./dify-images-3.5.3"
mkdir -p "$OUTPUT_DIR"

./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' | while read image; do
    # 将 / 和 : 替换为 _ 作为文件名
    filename=$(echo $image | sed 's/[\/:]/_/g')
    
    echo "Exporting $image to ${filename}.tar..."
    docker save $image -o "${OUTPUT_DIR}/${filename}.tar"
done

# 打包所有 tar 文件
echo "Creating archive..."
tar -czf dify-images-3.5.3.tar.gz "$OUTPUT_DIR"
echo "✓ All images exported to dify-images-3.5.3.tar.gz"
```

### 场景 10：生成镜像清单 Markdown 文档

**用途：** 创建项目文档

```bash
#!/bin/bash
# generate-image-manifest.sh

cat > dify-images-manifest.md <<EOF
# Dify v3.5.3 镜像清单

生成时间: $(date)

## 镜像列表

| 组件 | 镜像仓库 | 标签 | 完整镜像地址 |
|------|----------|------|--------------|
EOF

./get-dify-helm-images.sh 3.5.3 csv | tail -n +2 | while IFS=',' read -r component repository tag full_image; do
    echo "| $component | $repository | $tag | \`$full_image\` |" >> dify-images-manifest.md
done

echo "" >> dify-images-manifest.md
echo "---" >> dify-images-manifest.md
echo "总计: $(./get-dify-helm-images.sh 3.5.3 json | jq '. | length') 个镜像" >> dify-images-manifest.md

echo "✓ Markdown manifest generated: dify-images-manifest.md"
```

## 📊 完整使用示例

### 示例 1：完整的离线部署准备流程

```bash
#!/bin/bash
# prepare-offline-deployment.sh

VERSION="3.5.3"
OUTPUT_DIR="dify-offline-${VERSION}"

echo "Preparing Dify ${VERSION} for offline deployment..."

# 1. 创建输出目录
mkdir -p "${OUTPUT_DIR}/images"
mkdir -p "${OUTPUT_DIR}/manifests"

# 2. 提取镜像列表（多种格式）
./get-dify-helm-images.sh ${VERSION} text > "${OUTPUT_DIR}/manifests/images.txt"
./get-dify-helm-images.sh ${VERSION} json > "${OUTPUT_DIR}/manifests/images.json"
./get-dify-helm-images.sh ${VERSION} csv > "${OUTPUT_DIR}/manifests/images.csv"

# 3. 提取纯镜像地址列表
./get-dify-helm-images.sh ${VERSION} json | jq -r '.[].full_image' > "${OUTPUT_DIR}/image-list.txt"

# 4. 拉取所有镜像
echo "Pulling images..."
cat "${OUTPUT_DIR}/image-list.txt" | while read image; do
    echo "  Pulling $image..."
    docker pull $image
done

# 5. 导出镜像为 tar 文件
echo "Exporting images..."
docker save $(cat "${OUTPUT_DIR}/image-list.txt") -o "${OUTPUT_DIR}/dify-images-${VERSION}.tar"

# 6. 下载 Helm Chart
echo "Downloading Helm Chart..."
helm pull dify/dify --version ${VERSION} --destination "${OUTPUT_DIR}"

# 7. 创建部署说明
cat > "${OUTPUT_DIR}/DEPLOYMENT.md" <<EOF
# Dify ${VERSION} 离线部署包

## 包含内容

1. \`dify-images-${VERSION}.tar\` - 所有容器镜像
2. \`dify-${VERSION}.tgz\` - Helm Chart
3. \`manifests/\` - 镜像清单文件
4. \`image-list.txt\` - 镜像列表

## 部署步骤

### 1. 导入镜像

\`\`\`bash
docker load -i dify-images-${VERSION}.tar
\`\`\`

### 2. 安装 Helm Chart

\`\`\`bash
helm install dify dify-${VERSION}.tgz
\`\`\`

## 镜像数量

总计: $(wc -l < "${OUTPUT_DIR}/image-list.txt") 个镜像

生成时间: $(date)
EOF

# 8. 打包
echo "Creating final archive..."
tar -czf "${OUTPUT_DIR}.tar.gz" "${OUTPUT_DIR}"

echo "✓ Offline deployment package ready: ${OUTPUT_DIR}.tar.gz"
ls -lh "${OUTPUT_DIR}.tar.gz"
```

### 示例 2：监控镜像更新

```bash
#!/bin/bash
# check-image-updates.sh

CURRENT_VERSION="3.5.3"
PREVIOUS_VERSION="3.5.2"

echo "Checking image updates between ${PREVIOUS_VERSION} and ${CURRENT_VERSION}..."

# 提取两个版本的镜像
./get-dify-helm-images.sh ${PREVIOUS_VERSION} json > prev.json
./get-dify-helm-images.sh ${CURRENT_VERSION} json > curr.json

echo ""
echo "=== New Images ==="
jq -r '.[].full_image' curr.json | while read image; do
    if ! grep -q "$image" prev.json; then
        echo "  + $image"
    fi
done

echo ""
echo "=== Removed Images ==="
jq -r '.[].full_image' prev.json | while read image; do
    if ! grep -q "$image" curr.json; then
        echo "  - $image"
    fi
done

echo ""
echo "=== Updated Tags ==="
jq -r '.[] | "\(.component)|\(.repository)"' curr.json | while IFS='|' read component repo; do
    prev_tag=$(jq -r ".[] | select(.component==\"$component\" and .repository==\"$repo\") | .tag" prev.json 2>/dev/null)
    curr_tag=$(jq -r ".[] | select(.component==\"$component\" and .repository==\"$repo\") | .tag" curr.json 2>/dev/null)
    
    if [ ! -z "$prev_tag" ] && [ ! -z "$curr_tag" ] && [ "$prev_tag" != "$curr_tag" ]; then
        echo "  $component: $prev_tag -> $curr_tag"
    fi
done

# 清理
rm -f prev.json curr.json
```

### 示例 3：镜像安全扫描

**用途：** 使用 Trivy 扫描所有镜像的安全漏洞

```bash
#!/bin/bash
# security-scan-images.sh

VERSION="3.5.3"
OUTPUT_DIR="security-reports-${VERSION}"

mkdir -p "${OUTPUT_DIR}"

echo "Scanning images for vulnerabilities..."

./get-dify-helm-images.sh ${VERSION} json | jq -r '.[].full_image' | while read image; do
    echo "Scanning $image..."
    
    # 生成安全报告
    component=$(echo "$image" | sed 's/[\/:]/_/g')
    trivy image --severity HIGH,CRITICAL "$image" > "${OUTPUT_DIR}/${component}.txt"
    
    echo "✓ Report saved to ${OUTPUT_DIR}/${component}.txt"
done

echo ""
echo "✓ All scans completed. Reports in: ${OUTPUT_DIR}/"
```

### 示例 4：构建私有镜像仓库同步脚本

```bash
#!/bin/bash
# sync-to-harbor.sh

VERSION="3.5.3"
HARBOR_REGISTRY="harbor.company.com"
HARBOR_PROJECT="dify"
HARBOR_USERNAME="admin"

echo "Syncing Dify ${VERSION} images to Harbor..."

# 登录 Harbor
echo "Logging in to Harbor..."
docker login ${HARBOR_REGISTRY} -u ${HARBOR_USERNAME}

# 处理每个镜像
./get-dify-helm-images.sh ${VERSION} json | jq -r '.[] | "\(.component)|\(.full_image)"' | while IFS='|' read component image; do
    echo ""
    echo "Processing: $component - $image"
    
    # 拉取原始镜像
    echo "  [1/3] Pulling original image..."
    docker pull $image
    
    # 生成新标签
    image_name=$(echo $image | cut -d'/' -f2- | tr '/' '-')
    new_tag="${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${image_name}"
    
    # 重新打标签
    echo "  [2/3] Retagging as $new_tag..."
    docker tag $image $new_tag
    
    # 推送到 Harbor
    echo "  [3/3] Pushing to Harbor..."
    docker push $new_tag
    
    echo "  ✓ Completed: $component"
done

echo ""
echo "✓ All images synced to Harbor!"
echo "✓ Project: ${HARBOR_REGISTRY}/${HARBOR_PROJECT}"
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

### 推荐工具（可选但建议安装）

#### yq - YAML 处理工具

提供更准确的 YAML 解析。

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

处理 JSON 输出必备。

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

### Q2: 为什么建议安装 yq？

**原因：** yq 提供更准确的 YAML 解析，能够正确处理复杂的嵌套结构和特殊字符。

**影响：** 不安装 yq 时，脚本会使用 grep/awk 等工具进行文本解析，在大多数情况下也能正常工作，但可能遗漏某些特殊情况。

### Q3: 提取镜像列表后如何验证完整性？

```bash
# 方法1：统计镜像数量
./get-dify-helm-images.sh 3.5.3 json | jq '. | length'

# 方法2：检查每个镜像是否可访问（需要联网）
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' | while read image; do
    docker manifest inspect $image &>/dev/null && echo "✓ $image" || echo "✗ $image"
done
```

### Q4: 脚本执行时报 "Error: failed to download chart"

**可能原因：**
1. 网络连接问题
2. 版本号不正确
3. Helm 仓库未正确添加

**解决：**
```bash
# 1. 检查网络连接
ping langgenius.github.io

# 2. 确认版本号正确
helm search repo dify/dify --versions

# 3. 更新仓库
helm repo update dify

# 4. 重试
./get-dify-helm-images.sh <correct-version>
```

### Q5: JSON 输出为空或不完整

**原因：** 可能是因为没有安装 yq，且 awk 解析遇到了特殊格式。

**解决：**
```bash
# 安装 yq
brew install yq  # macOS
sudo apt install yq  # Linux

# 重新运行
./get-dify-helm-images.sh 3.5.3 json
```

### Q6: 如何只提取某个特定组件的镜像？

```bash
# 使用 jq 过滤
./get-dify-helm-images.sh 3.5.3 json | jq '.[] | select(.component == "api")'

# 或提取多个组件
./get-dify-helm-images.sh 3.5.3 json | jq '.[] | select(.component | IN("api", "worker", "sandbox"))'
```

### Q7: 镜像拉取失败怎么办？

```bash
# 方法1：使用代理
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080

# 方法2：使用镜像加速器（中国地区）
# 编辑 /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}

# 重启 Docker
sudo systemctl restart docker

# 方法3：逐个拉取失败的镜像
cat failed-images.txt | while read image; do
    echo "Retrying $image..."
    docker pull $image || echo "$image" >> still-failed.txt
done
```

### Q8: 如何去重镜像列表？

```bash
# 某些组件可能使用相同的镜像，去重可以减少下载量

# 使用 jq 去重
./get-dify-helm-images.sh 3.5.3 json | jq '[.[] | .full_image] | unique'

# 或直接输出去重后的列表
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' | sort -u
```

## 🎯 最佳实践

### 1. 定期备份镜像列表

```bash
./get-dify-helm-images.sh 3.5.3 json > backups/dify-3.5.3-$(date +%Y%m%d).json
```

### 2. 使用版本控制

```bash
git add manifests/
git commit -m "Update Dify images to v3.5.3"
```

### 3. 自动化检查更新

```bash
# 添加到 crontab，每天检查一次
0 2 * * * /path/to/check-image-updates.sh | mail -s "Dify Image Updates" admin@example.com
```

### 4. 镜像安全扫描

```bash
./get-dify-helm-images.sh 3.5.3 json | jq -r '.[].full_image' | while read image; do
    trivy image $image
done
```

### 5. 分类存储镜像

```bash
#!/bin/bash
# categorize-images.sh

VERSION="3.5.3"

# 创建分类目录
mkdir -p images/{official,third-party}

./get-dify-helm-images.sh ${VERSION} json | jq -r '.[] | "\(.component)|\(.full_image)"' | while IFS='|' read component image; do
    if [[ $image == langgenius/* ]]; then
        echo "$image" >> images/official/list.txt
    else
        echo "$image" >> images/third-party/list.txt
    fi
done
```

## 🔧 工作原理

脚本的工作流程：

1. **添加 Helm 仓库**：自动添加 Dify 的 Helm 仓库
2. **更新仓库索引**：确保获取最新的版本信息
3. **下载 Chart**：下载指定版本的 Helm Chart 到临时目录
4. **解析镜像信息**：
   - 优先使用 `yq` 解析 `values.yaml` 文件（更准确）
   - 如果 `yq` 不可用，使用 `awk` 进行文本解析（备用方案）
5. **格式化输出**：根据指定的格式输出结果
6. **清理**：自动清理临时文件

**技术细节：**
- 使用 `helm pull` 下载完整的 Chart 包
- 解压后解析 `values.yaml` 文件
- 提取所有包含 `repository` 和 `tag` 的镜像引用
- 组合成完整的镜像地址（`repository:tag`）

## ⚠️ 注意事项

1. 首次运行需要网络连接以添加 Helm 仓库
2. Chart 中某些镜像可能使用变量或模板，脚本会尽量解析默认值
3. 如果使用私有镜像仓库，可能需要额外的认证配置
4. 建议安装 `yq` 以获得最准确的解析结果
5. 某些镜像可能被多个组件使用，导致列表中有重复

## 🐛 故障排查

### 错误：helm: command not found

```bash
# 安装 helm
brew install helm  # macOS
# 或访问 https://helm.sh/docs/intro/install/
```

### 错误：Error: failed to download chart

- 检查网络连接
- 确认版本号是否正确：`helm search repo dify/dify --versions`
- 更新仓库：`helm repo update dify`

### 输出不完整或有误

- 安装 `yq` 工具以提高解析准确性
- 某些复杂的模板可能需要手动查看 `values.yaml`

### 脚本没有执行权限

```bash
chmod +x get-dify-helm-images.sh
```

### 镜像拉取失败

```bash
# 方法1：使用代理
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080

# 方法2：使用镜像加速器（中国地区）
# 编辑 /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}

# 重启 Docker
sudo systemctl restart docker
```

### 临时文件残留

```bash
# 脚本会自动清理临时文件，但如果中断可能残留
# 手动清理
rm -rf /tmp/tmp.* 
```

## 📞 获取帮助

如果遇到问题：

1. 检查依赖工具是否正确安装
2. 查看本文档的"常见问题"和"故障排查"部分
3. 运行脚本时添加 `-x` 查看详细执行过程：
   ```bash
   bash -x ./get-dify-helm-images.sh 3.5.3
   ```

## 📄 许可证

MIT License

---

**最后更新：** 2025-10-20

