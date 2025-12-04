# API 文档

Dify Helm Watchdog 提供了一套 RESTful API，用于编程式访问 Helm Chart 版本信息、镜像列表和验证数据。

## 基础信息

- **Base URL**: `https://your-domain.com/api/v1`
- **认证**: 无需认证（公开 API，cron 端点除外）
- **响应格式**: JSON（部分端点支持 YAML）
- **缓存策略**: 
  - 版本列表: `s-maxage=3600, stale-while-revalidate=86400`
  - 最新版本: `s-maxage=1800, stale-while-revalidate=3600`
  - 镜像/验证数据: `s-maxage=3600, stale-while-revalidate=86400`

---

## 快速开始

```bash
# 获取所有版本列表
curl https://your-domain.com/api/v1/versions

# 获取最新版本信息
curl https://your-domain.com/api/v1/versions/latest

# 获取指定版本的镜像列表（JSON）
curl https://your-domain.com/api/v1/versions/1.0.0/images

# 获取指定版本的镜像列表（YAML）
curl https://your-domain.com/api/v1/versions/1.0.0/images?format=yaml

# 下载 values.yaml
curl https://your-domain.com/api/v1/versions/1.0.0/values -o values.yaml

# 获取镜像验证结果
curl https://your-domain.com/api/v1/versions/1.0.0/validation

# 检查缓存状态
curl https://your-domain.com/api/v1/cache

# 触发同步任务（需要认证）
curl -X POST https://your-domain.com/api/v1/cron \
  -H "secret: your-cron-secret"
```

---

## API 端点

### 1. 列出所有版本

获取所有可用的 Helm Chart 版本列表。

```http
GET /api/v1/versions
```

#### Query Parameters

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `includeValidation` | boolean | 否 | `false` | 是否包含镜像验证统计（兼容 `include_validation`） |

#### 响应示例

```json
{
  "updateTime": "2024-01-15T10:30:00.000Z",
  "total": 50,
  "versions": [
    {
      "version": "1.0.0",
      "appVersion": "0.7.0",
      "createTime": "2024-01-15T08:00:00.000Z",
      "digest": "sha256:abc123..."
    }
  ]
}
```

#### 包含验证统计的响应

```bash
curl 'https://your-domain.com/api/v1/versions?includeValidation=true'
```

```json
{
  "updateTime": "2024-01-15T10:30:00.000Z",
  "total": 50,
  "versions": [
    {
      "version": "1.0.0",
      "appVersion": "0.7.0",
      "createTime": "2024-01-15T08:00:00.000Z",
      "digest": "sha256:abc123...",
      "imageValidation": {
        "total": 10,
        "allFound": 8,
        "partial": 1,
        "missing": 0,
        "error": 1
      }
    }
  ]
}
```

---

### 2. 获取最新版本

快速获取最新版本的详细信息和相关链接。

```http
GET /api/v1/versions/latest
```

#### 响应示例

```json
{
  "version": "1.0.0",
  "appVersion": "0.7.0",
  "createTime": "2024-01-15T08:00:00.000Z",
  "digest": "sha256:abc123...",
  "urls": {
    "self": "/api/v1/versions/1.0.0",
    "images": "/api/v1/versions/1.0.0/images",
    "values": "/api/v1/versions/1.0.0/values",
    "validation": "/api/v1/versions/1.0.0/validation"
  }
}
```

---

### 3. 获取指定版本详情

获取特定版本的详细信息（元数据，不包含完整内容）。

```http
GET /api/v1/versions/{version}
```

#### Path Parameters

| 参数 | 类型 | 说明 |
|------|------|------|
| `version` | string | 版本号（例如 `1.0.0`） |

#### 响应示例

```json
{
  "version": "1.0.0",
  "appVersion": "0.7.0",
  "createTime": "2024-01-15T08:00:00.000Z",
  "chartUrl": "https://langgenius.github.io/dify-helm/dify-1.0.0.tgz",
  "digest": "sha256:abc123...",
  "assets": {
    "values": {
      "path": "helm-watchdog/values/1.0.0.yaml",
      "url": "https://...",
      "hash": "abc123"
    },
    "images": {
      "path": "helm-watchdog/images/1.0.0.yaml",
      "url": "https://...",
      "hash": "def456"
    },
    "validation": {
      "path": "helm-watchdog/image-validation/1.0.0.json",
      "url": "https://...",
      "hash": "ghi789"
    }
  },
  "urls": {
    "self": "/api/v1/versions/1.0.0",
    "images": "/api/v1/versions/1.0.0/images",
    "values": "/api/v1/versions/1.0.0/values",
    "validation": "/api/v1/versions/1.0.0/validation"
  }
}
```

---

### 4. 获取镜像列表 ⭐

**这是最常用的端点**，用于获取指定版本中所有镜像及其标签。

```http
GET /api/v1/versions/{version}/images
```

#### Path Parameters

| 参数 | 类型 | 说明 |
|------|------|------|
| `version` | string | 版本号（例如 `1.0.0`） |

#### Query Parameters

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `format` | string | 否 | `json` | 返回格式：`json` 或 `yaml` |
| `includeValidation` | boolean | 否 | `false` | 是否包含镜像验证信息（兼容 `include_validation`） |

#### 响应示例（JSON 格式）

```json
{
  "version": "1.0.0",
  "appVersion": "0.7.0",
  "total": 10,
  "images": [
    {
      "path": "api",
      "repository": "langgenius/dify-api",
      "tag": "0.7.0"
    },
    {
      "path": "worker",
      "repository": "langgenius/dify-worker",
      "tag": "0.7.0"
    }
  ]
}
```

#### 响应示例（YAML 格式）

```bash
curl 'https://your-domain.com/api/v1/versions/1.0.0/images?format=yaml'
```

```yaml
api:
  repository: langgenius/dify-api
  tag: "0.7.0"
worker:
  repository: langgenius/dify-worker
  tag: "0.7.0"
```

#### 包含验证信息的响应

```bash
curl 'https://your-domain.com/api/v1/versions/1.0.0/images?includeValidation=true'
```

```json
{
  "version": "1.0.0",
  "appVersion": "0.7.0",
  "total": 10,
  "images": [
    {
      "path": "api",
      "repository": "langgenius/dify-api",
      "tag": "0.7.0",
      "targetImageName": "dify-api",
      "validation": {
        "status": "ALL_FOUND",
        "variants": [
          {
            "name": "ORIGINAL",
            "tag": "0.7.0",
            "image": "registry.example.com/namespace/dify-api:0.7.0",
            "status": "FOUND",
            "checkTime": "2024-01-15T10:30:00.000Z",
            "httpStatus": 200
          },
          {
            "name": "AMD64",
            "tag": "0.7.0-amd64",
            "image": "registry.example.com/namespace/dify-api:0.7.0-amd64",
            "status": "FOUND",
            "checkTime": "2024-01-15T10:30:00.000Z",
            "httpStatus": 200
          },
          {
            "name": "ARM64",
            "tag": "0.7.0-arm64",
            "image": "registry.example.com/namespace/dify-api:0.7.0-arm64",
            "status": "MISSING",
            "checkTime": "2024-01-15T10:30:00.000Z",
            "httpStatus": 404
          }
        ]
      }
    }
  ]
}
```

---

### 5. 获取 values.yaml

获取指定版本的完整 `values.yaml` 文件内容。

```http
GET /api/v1/versions/{version}/values
```

#### 响应类型

- **Content-Type**: `application/x-yaml; charset=utf-8`
- **格式**: 原始 YAML 文本

#### 使用示例

```bash
# 下载 values.yaml
curl https://your-domain.com/api/v1/versions/1.0.0/values -o values.yaml

# 使用 yq 解析特定字段
curl https://your-domain.com/api/v1/versions/1.0.0/values | yq '.api.image.tag'
```

---

### 6. 获取镜像验证结果

获取指定版本的镜像验证数据（镜像可用性检查结果）。

```http
GET /api/v1/versions/{version}/validation
```

#### 响应示例

```json
{
  "version": "1.0.0",
  "checkTime": "2024-01-15T10:30:00.000Z",
  "host": "registry.example.com",
  "namespace": "namespace/dify",
  "images": [
    {
      "sourceRepository": "langgenius/dify-api",
      "sourceTag": "0.7.0",
      "targetImageName": "dify-api",
      "paths": ["api"],
      "variants": [
        {
          "name": "ORIGINAL",
          "tag": "0.7.0",
          "image": "registry.example.com/namespace/dify-api:0.7.0",
          "status": "FOUND",
          "checkTime": "2024-01-15T10:30:00.000Z",
          "httpStatus": 200
        },
        {
          "name": "AMD64",
          "tag": "0.7.0-amd64",
          "image": "registry.example.com/namespace/dify-api:0.7.0-amd64",
          "status": "FOUND",
          "checkTime": "2024-01-15T10:30:00.000Z",
          "httpStatus": 200
        },
        {
          "name": "ARM64",
          "tag": "0.7.0-arm64",
          "image": "registry.example.com/namespace/dify-api:0.7.0-arm64",
          "status": "MISSING",
          "checkTime": "2024-01-15T10:30:00.000Z",
          "httpStatus": 404
        }
      ],
      "status": "PARTIAL"
    }
  ]
}
```

#### 验证状态说明

| 状态 | 说明 |
|------|------|
| `ALL_FOUND` | 所有架构的镜像都可用 |
| `PARTIAL` | 部分架构的镜像可用 |
| `MISSING` | 镜像不存在 |
| `ERROR` | 验证过程中发生错误 |

---

## 实际应用场景

### 场景 1: Terraform 集成

```hcl
# 获取最新版本的镜像列表
data "http" "dify_latest" {
  url = "https://your-domain.com/api/v1/versions/latest/images"
}

locals {
  images = jsondecode(data.http.dify_latest.body).images
  api_image = [for img in local.images : img if img.path == "api"][0]
  worker_image = [for img in local.images : img if img.path == "worker"][0]
}

resource "helm_release" "dify" {
  name       = "dify"
  repository = "https://langgenius.github.io/dify-helm"
  chart      = "dify"
  version    = jsondecode(data.http.dify_latest.body).version
  
  set {
    name  = "api.image.tag"
    value = local.api_image.tag
  }
  
  set {
    name  = "worker.image.tag"
    value = local.worker_image.tag
  }
}
```

### 场景 2: CI/CD Pipeline

```bash
#!/bin/bash
# get-latest-dify.sh

API_BASE="https://your-domain.com/api/v1"

# 获取最新版本号
LATEST=$(curl -s "$API_BASE/versions/latest" | jq -r '.version')
echo "Latest Dify Helm version: $LATEST"

# 获取该版本的镜像列表
curl -s "$API_BASE/versions/$LATEST/images" | \
  jq -r '.images[] | "\(.path):\(.tag)"' | \
  while IFS=':' read -r path tag; do
    echo "  - $path = $tag"
  done

# 下载 values.yaml
curl -s "$API_BASE/versions/$LATEST/values" -o "values-$LATEST.yaml"
echo "Downloaded values-$LATEST.yaml"

# 检查镜像可用性
VALIDATION=$(curl -s "$API_BASE/versions/$LATEST/validation")
MISSING=$(echo "$VALIDATION" | jq '[.images[] | select(.status != "ALL_FOUND")] | length')

if [ "$MISSING" -gt 0 ]; then
  echo "⚠️  Warning: $MISSING images have availability issues"
  echo "$VALIDATION" | jq '.images[] | select(.status != "ALL_FOUND") | .targetImageName'
else
  echo "✅ All images are available"
fi
```

### 场景 3: Python 自动化脚本

```python
#!/usr/bin/env python3
import requests
import yaml

BASE_URL = "https://your-domain.com/api/v1"

def get_latest_version():
    """获取最新版本信息"""
    resp = requests.get(f"{BASE_URL}/versions/latest")
    resp.raise_for_status()
    return resp.json()

def get_version_images(version, include_validation=False):
    """获取指定版本的镜像列表"""
    params = {}
    if include_validation:
        params['includeValidation'] = 'true'
    
    resp = requests.get(f"{BASE_URL}/versions/{version}/images", params=params)
    resp.raise_for_status()
    return resp.json()

def download_values(version, output_file):
    """下载 values.yaml"""
    resp = requests.get(f"{BASE_URL}/versions/{version}/values")
    resp.raise_for_status()
    
    with open(output_file, 'w') as f:
        f.write(resp.text)
    
    return output_file

def main():
    # 获取最新版本
    latest = get_latest_version()
    version = latest['version']
    print(f"Latest version: {version} (app: {latest['appVersion']})")
    
    # 获取镜像列表
    images_data = get_version_images(version, include_validation=True)
    print(f"\nTotal images: {images_data['total']}")
    
    # 显示镜像信息
    for img in images_data['images']:
        status = ""
        if 'validation' in img:
            status = f" [{img['validation']['status']}]"
        print(f"  - {img['path']}: {img['repository']}:{img['tag']}{status}")
    
    # 下载 values.yaml
    output = f"values-{version}.yaml"
    download_values(version, output)
    print(f"\n✅ Downloaded {output}")

if __name__ == "__main__":
    main()
```

### 场景 4: 与 yq 配合使用

```bash
#!/bin/bash
# update-helm-values.sh - 批量更新 values.yaml 中的镜像标签

VERSION=${1:-latest}
VALUES_FILE=${2:-values.yaml}

echo "Updating $VALUES_FILE to Dify Helm version $VERSION"

# 获取镜像列表（YAML 格式）
curl -s "https://your-domain.com/api/v1/versions/$VERSION/images?format=yaml" > /tmp/latest-images.yaml

# 批量更新所有镜像标签
for key in $(yq 'keys | .[]' /tmp/latest-images.yaml); do
  repository=$(yq ".$key.repository" /tmp/latest-images.yaml)
  tag=$(yq ".$key.tag" /tmp/latest-images.yaml)
  
  echo "Updating $key: $repository:$tag"
  yq eval ".$key.image.repository = \"$repository\"" -i "$VALUES_FILE"
  yq eval ".$key.image.tag = \"$tag\"" -i "$VALUES_FILE"
done

echo "✅ Updated $VALUES_FILE"
```

### 场景 5: Dify Workflow 集成

在 Dify Workflow 中使用 HTTP 节点实现自动化：

#### 节点 1: 检查新版本
- **类型**: HTTP Request
- **方法**: GET
- **URL**: `https://your-domain.com/api/v1/versions/latest`
- **输出变量**: `latest_version`

#### 节点 2: 获取镜像列表
- **类型**: HTTP Request
- **方法**: GET
- **URL**: `https://your-domain.com/api/v1/versions/{{latest_version.version}}/images`
- **输出变量**: `images`

#### 节点 3: 条件判断
- **条件**: `{{images.total}} > 0`
- **True 分支**: 发送通知
- **False 分支**: 记录错误

#### 节点 4: 发送通知（Email/Webhook）
- **标题**: `New Dify Helm version available: {{latest_version.version}}`
- **内容**: 
  ```
  Version: {{latest_version.version}}
  App Version: {{latest_version.appVersion}}
  Total Images: {{images.total}}
  
  Images:
  {{images.images | json}}
  ```

### 场景 6: Ansible Playbook

```yaml
---
- name: Deploy Dify with latest Helm chart
  hosts: localhost
  vars:
    api_base: "https://your-domain.com/api/v1"
  
  tasks:
    - name: Get latest Dify Helm version
      uri:
        url: "{{ api_base }}/versions/latest"
        return_content: yes
      register: latest_version
    
    - name: Get image list for version {{ latest_version.json.version }}
      uri:
        url: "{{ api_base }}/versions/{{ latest_version.json.version }}/images"
        return_content: yes
      register: images_data
    
    - name: Download values.yaml
      get_url:
        url: "{{ api_base }}/versions/{{ latest_version.json.version }}/values"
        dest: "/tmp/dify-values-{{ latest_version.json.version }}.yaml"
    
    - name: Deploy Dify Helm chart
      kubernetes.core.helm:
        name: dify
        chart_ref: dify/dify
        chart_version: "{{ latest_version.json.version }}"
        values_files:
          - "/tmp/dify-values-{{ latest_version.json.version }}.yaml"
        namespace: dify
        create_namespace: yes
```

---

## 系统管理端点

### 7. 检查缓存状态

用于检查当前缓存的完整状态，包括所有版本的元数据。

```http
GET /api/v1/cache
```

#### 响应示例

```json
{
  "updateTime": "2024-01-15T10:30:00.000Z",
  "versions": [
    {
      "version": "1.0.0",
      "appVersion": "0.7.0",
      "createTime": "2024-01-15T08:00:00.000Z",
      "chartUrl": "https://langgenius.github.io/dify-helm/dify-1.0.0.tgz",
      "digest": "sha256:abc123...",
      "values": {
        "path": "helm-watchdog/values/1.0.0.yaml",
        "url": "https://...",
        "hash": "abc123",
        "inline": null
      },
      "images": {
        "path": "helm-watchdog/images/1.0.0.yaml",
        "url": "https://...",
        "hash": "def456",
        "inline": null
      },
      "imageValidation": {
        "path": "helm-watchdog/image-validation/1.0.0.json",
        "url": "https://...",
        "hash": "ghi789",
        "inline": null
      }
    }
  ]
}
```

当缓存为空时：

```json
{
  "updateTime": null,
  "versions": []
}
```

---

### 8. 触发缓存同步 (Cron)

手动触发 Helm 数据同步任务，支持流式输出同步进度。

```http
POST /api/v1/cron
```

#### Headers

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `secret` | string | 条件必填 | 当设置了 `CRON_AUTH_SECRET` 环境变量时必填（Vercel Cron 请求除外） |

#### Query Parameters

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string[] | 否 | 指定要刷新的版本号，可以是逗号分隔的列表或多个参数 |

#### 响应类型

- **Content-Type**: `text/plain; charset=utf-8`
- **格式**: 流式文本输出（实时日志）

#### 使用示例

```bash
# 同步所有版本
curl -X POST https://your-domain.com/api/v1/cron \
  -H "secret: your-secret-here"

# 同步指定版本
curl -X POST "https://your-domain.com/api/v1/cron?version=1.0.0,1.0.1" \
  -H "secret: your-secret-here"

# 使用多个 version 参数
curl -X POST "https://your-domain.com/api/v1/cron?version=1.0.0&version=1.0.1" \
  -H "secret: your-secret-here"
```

#### 响应示例

```
== dify-helm-watchdog cron ==
[input] force_versions=v1.0.0, v1.0.1
[sync] Starting sync process...
[sync] Fetched 50 versions from Helm repository
[sync] Processing version v1.0.0...
[sync] Downloaded values.yaml for v1.0.0
[sync] Extracted images for v1.0.0
[sync] Refreshed v1.0.0
[result] processed=50 created=2 refreshed=2 skipped=48
[result] new_versions=v1.0.2, v1.0.3
[result] refreshed_versions=v1.0.0, v1.0.1
[result] update_time=2024-01-15T10:30:00.000Z
[revalidate] Triggering ISR revalidation for homepage...
[revalidate] Successfully cleared ISR cache for homepage
[revalidate] Warming up cache...
[revalidate] Cache warmed up successfully (status: 200)
[status] ok
```

#### 错误场景

**401 Unauthorized** - 缺少或错误的认证令牌：

```
== dify-helm-watchdog cron ==
[error] Invalid or missing secret header
[status] failed
```

**500 Internal Server Error** - 缺少 Blob 存储令牌：

```
== dify-helm-watchdog cron ==
[error] Missing required environment variable: BLOB_READ_WRITE_TOKEN
[status] failed
```

---

## 错误处理

### 错误响应格式

所有 API 在发生错误时返回标准格式：

```json
{
  "error": "ERROR_TYPE",
  "message": "Human-readable error message",
  "details": [
    {
      "reason": "DETAILED_REASON",
      "additionalInfo": "..."
    }
  ]
}
```

#### 常见错误原因

| Reason | 说明 |
|--------|------|
| `CACHE_NOT_INITIALIZED` | 缓存未初始化，需要先运行 cron 任务 |
| `VERSION_NOT_FOUND` | 请求的版本不存在，`details` 中包含可用版本列表 |
| `VALIDATION_NOT_AVAILABLE` | 该版本没有验证数据 |
| `NO_VERSIONS_AVAILABLE` | 缓存中没有任何版本 |

#### 示例错误响应

**404 - 缓存未初始化**

```json
{
  "error": "NOT_FOUND",
  "message": "Cache not available. Trigger the cron job first.",
  "details": [
    {
      "reason": "CACHE_NOT_INITIALIZED"
    }
  ]
}
```

**404 - 版本不存在**

```json
{
  "error": "NOT_FOUND",
  "message": "Version 1.0.0 does not exist in the cache.",
  "details": [
    {
      "reason": "VERSION_NOT_FOUND",
      "availableVersions": ["1.0.1", "1.0.2", "1.0.3"]
    }
  ]
}
```

**404 - 验证数据不可用**

```json
{
  "error": "NOT_FOUND",
  "message": "Image validation data is not available for version 1.0.0.",
  "details": [
    {
      "reason": "VALIDATION_NOT_AVAILABLE"
    }
  ]
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| `200 OK` | 请求成功 |
| `401 Unauthorized` | 认证失败（仅 cron 端点） |
| `404 Not Found` | 资源不存在（版本不存在或缓存未初始化） |
| `500 Internal Server Error` | 服务器内部错误 |

---

## 附加说明

### 环境变量配置

#### Cron 认证

- `CRON_AUTH_SECRET`: 用于保护 `/api/v1/cron` 端点的密钥。如果未设置，则只有带有 `x-vercel-cron: true` 头的请求可以访问（Vercel 平台自动添加）。

#### 缓存预热

- `ENABLE_CACHE_WARMUP`: 设置为 `false` 可禁用 cron 任务完成后的自动缓存预热。默认为 `true`。
- `NEXT_PUBLIC_SITE_URL`: 用于缓存预热的网站 URL。如果未设置，将使用 `VERCEL_URL` 或 `http://localhost:3000`。

#### Blob 存储

- `BLOB_READ_WRITE_TOKEN`: Vercel Blob 存储的读写令牌，cron 任务需要此令牌才能存储数据。

### 版本号格式

API 接受的版本号格式：
- 标准格式: `1.0.0`
- 带 v 前缀: `v1.0.0` (会自动去除前缀)

在 cron 端点中，返回的版本号始终带有 `v` 前缀以提高可读性。

### 缓存机制

1. **Edge 缓存**: 使用 CDN 边缘缓存，`s-maxage` 控制缓存时长
2. **Stale-While-Revalidate**: 允许在后台更新时提供过期内容
3. **ISR (Incremental Static Regeneration)**: 当 cron 任务完成时，会触发首页的 ISR 重新验证
4. **缓存预热**: cron 任务完成后自动访问首页，确保用户访问时内容已经是最新的

### 最佳实践

1. **使用 latest 端点**: 如果总是需要最新版本，使用 `/api/v1/versions/latest` 而不是先获取列表再选择第一个
2. **合理使用缓存**: 利用 HTTP 缓存头，避免频繁请求相同的数据
3. **错误处理**: 始终检查 `details` 字段以获取更多错误上下文
4. **版本验证**: 在使用 `includeValidation=true` 前，先确认该版本有验证数据（查看 `/api/v1/versions/{version}` 的 `assets` 字段）
5. **批量操作**: 如果需要多个版本的数据，考虑使用 `/api/v1/cache` 端点获取所有元数据，然后按需请求具体内容

### API 速率限制

目前 API 没有硬性速率限制，但建议：
- 遵守 HTTP 缓存头，避免不必要的请求
- 不要频繁触发 cron 端点（建议最多每小时一次）
- 对于生产环境，建议实现客户端缓存

### Swagger/OpenAPI

本项目在代码中使用了 JSDoc 风格的 Swagger 注释。你可以访问 `/swagger` 页面查看完整的 API 规范和交互式文档。

---

## 更新日志

### v2.0 (Current)
- ✅ 迁移到 `/api/v1/` 路径
- ✅ 新增 `/api/v1/cache` 端点
- ✅ 改进错误响应格式（添加 `details` 字段）
- ✅ cron 端点支持流式输出
- ✅ 支持按需刷新指定版本
- ✅ 自动缓存预热
- ✅ 改进缓存策略

### v1.0
- 初始版本
- 基本的版本、镜像、values 查询功能
- 镜像验证功能