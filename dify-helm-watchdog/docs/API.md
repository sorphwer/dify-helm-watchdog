# API 文档

Dify Helm Watchdog 提供了一套 RESTful API，用于编程式访问 Helm Chart 版本信息、镜像列表和验证数据。

## 基础信息

- **Base URL**: `https://your-domain.com/api`
- **认证**: 无需认证（公开 API）
- **响应格式**: JSON（部分端点支持 YAML）
- **缓存**: 所有响应启用 HTTP 缓存（3600s）

---

## 快速开始

```bash
# 获取所有版本列表
curl https://your-domain.com/api/versions

# 获取最新版本信息
curl https://your-domain.com/api/versions/latest

# 获取指定版本的镜像列表（JSON）
curl https://your-domain.com/api/versions/1.0.0/images

# 获取指定版本的镜像列表（YAML）
curl https://your-domain.com/api/versions/1.0.0/images?format=yaml

# 下载 values.yaml
curl https://your-domain.com/api/versions/1.0.0/values -o values.yaml

# 获取镜像验证结果
curl https://your-domain.com/api/versions/1.0.0/validation
```

---

## API 端点

### 1. 列出所有版本

获取所有可用的 Helm Chart 版本列表。

```http
GET /api/versions
```

#### Query Parameters

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `include_validation` | boolean | 否 | `false` | 是否包含镜像验证统计 |

#### 响应示例

```json
{
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "total": 50,
  "versions": [
    {
      "version": "1.0.0",
      "appVersion": "0.7.0",
      "createdAt": "2024-01-15T08:00:00.000Z",
      "digest": "sha256:abc123..."
    }
  ]
}
```

#### 包含验证统计的响应

```bash
curl 'https://your-domain.com/api/versions?include_validation=true'
```

```json
{
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "total": 50,
  "versions": [
    {
      "version": "1.0.0",
      "appVersion": "0.7.0",
      "createdAt": "2024-01-15T08:00:00.000Z",
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
GET /api/versions/latest
```

#### 响应示例

```json
{
  "version": "1.0.0",
  "appVersion": "0.7.0",
  "createdAt": "2024-01-15T08:00:00.000Z",
  "digest": "sha256:abc123...",
  "urls": {
    "self": "/api/versions/1.0.0",
    "images": "/api/versions/1.0.0/images",
    "values": "/api/versions/1.0.0/values",
    "validation": "/api/versions/1.0.0/validation"
  }
}
```

---

### 3. 获取指定版本详情

获取特定版本的详细信息（元数据，不包含完整内容）。

```http
GET /api/versions/{version}
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
  "createdAt": "2024-01-15T08:00:00.000Z",
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
    "images": "/api/versions/1.0.0/images",
    "values": "/api/versions/1.0.0/values",
    "validation": "/api/versions/1.0.0/validation"
  }
}
```

---

### 4. 获取镜像列表 ⭐

**这是最常用的端点**，用于获取指定版本中所有镜像及其标签。

```http
GET /api/versions/{version}/images
```

#### Path Parameters

| 参数 | 类型 | 说明 |
|------|------|------|
| `version` | string | 版本号（例如 `1.0.0`） |

#### Query Parameters

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `format` | string | 否 | `json` | 返回格式：`json` 或 `yaml` |
| `include_validation` | boolean | 否 | `false` | 是否包含镜像验证信息 |

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
curl 'https://your-domain.com/api/versions/1.0.0/images?format=yaml'
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
curl 'https://your-domain.com/api/versions/1.0.0/images?include_validation=true'
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
        "status": "all_found",
        "variants": [
          {
            "name": "original",
            "tag": "0.7.0",
            "image": "registry.example.com/namespace/dify-api:0.7.0",
            "status": "found",
            "checkedAt": "2024-01-15T10:30:00.000Z",
            "httpStatus": 200
          },
          {
            "name": "amd64",
            "tag": "0.7.0-amd64",
            "image": "registry.example.com/namespace/dify-api:0.7.0-amd64",
            "status": "found",
            "checkedAt": "2024-01-15T10:30:00.000Z",
            "httpStatus": 200
          },
          {
            "name": "arm64",
            "tag": "0.7.0-arm64",
            "image": "registry.example.com/namespace/dify-api:0.7.0-arm64",
            "status": "missing",
            "checkedAt": "2024-01-15T10:30:00.000Z",
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
GET /api/versions/{version}/values
```

#### 响应类型

- **Content-Type**: `application/x-yaml; charset=utf-8`
- **格式**: 原始 YAML 文本

#### 使用示例

```bash
# 下载 values.yaml
curl https://your-domain.com/api/versions/1.0.0/values -o values.yaml

# 使用 yq 解析特定字段
curl https://your-domain.com/api/versions/1.0.0/values | yq '.api.image.tag'
```

---

### 6. 获取镜像验证结果

获取指定版本的镜像验证数据（镜像可用性检查结果）。

```http
GET /api/versions/{version}/validation
```

#### 响应示例

```json
{
  "version": "1.0.0",
  "checkedAt": "2024-01-15T10:30:00.000Z",
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
          "name": "original",
          "tag": "0.7.0",
          "image": "registry.example.com/namespace/dify-api:0.7.0",
          "status": "found",
          "checkedAt": "2024-01-15T10:30:00.000Z",
          "httpStatus": 200
        },
        {
          "name": "amd64",
          "tag": "0.7.0-amd64",
          "image": "registry.example.com/namespace/dify-api:0.7.0-amd64",
          "status": "found",
          "checkedAt": "2024-01-15T10:30:00.000Z",
          "httpStatus": 200
        },
        {
          "name": "arm64",
          "tag": "0.7.0-arm64",
          "image": "registry.example.com/namespace/dify-api:0.7.0-arm64",
          "status": "missing",
          "checkedAt": "2024-01-15T10:30:00.000Z",
          "httpStatus": 404
        }
      ],
      "status": "partial"
    }
  ]
}
```

#### 验证状态说明

| 状态 | 说明 |
|------|------|
| `all_found` | 所有架构的镜像都可用 |
| `partial` | 部分架构的镜像可用 |
| `missing` | 镜像不存在 |
| `error` | 验证过程中发生错误 |

---

## 实际应用场景

### 场景 1: Terraform 集成

```hcl
# 获取最新版本的镜像列表
data "http" "dify_latest" {
  url = "https://your-domain.com/api/versions/latest/images"
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

API_BASE="https://your-domain.com/api"

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
MISSING=$(echo "$VALIDATION" | jq '[.images[] | select(.status != "all_found")] | length')

if [ "$MISSING" -gt 0 ]; then
  echo "⚠️  Warning: $MISSING images have availability issues"
  echo "$VALIDATION" | jq '.images[] | select(.status != "all_found") | .targetImageName'
else
  echo "✅ All images are available"
fi
```

### 场景 3: Python 自动化脚本

```python
#!/usr/bin/env python3
import requests
import yaml

BASE_URL = "https://your-domain.com/api"

def get_latest_version():
    """获取最新版本信息"""
    resp = requests.get(f"{BASE_URL}/versions/latest")
    resp.raise_for_status()
    return resp.json()

def get_version_images(version, include_validation=False):
    """获取指定版本的镜像列表"""
    params = {}
    if include_validation:
        params['include_validation'] = 'true'
    
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
curl -s "https://your-domain.com/api/versions/$VERSION/images?format=yaml" > /tmp/latest-images.yaml

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
- **URL**: `https://your-domain.com/api/versions/latest`
- **输出变量**: `latest_version`

#### 节点 2: 获取镜像列表
- **类型**: HTTP Request
- **方法**: GET
- **URL**: `https://your-domain.com/api/versions/{{latest_version.version}}/images`
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
    api_base: "https://your-domain.com/api"
  
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

## 错误处理

### 错误响应格式

所有 API 在发生错误时返回标准格式：

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| `200 OK` | 请求成功 |
| `404 Not Found` | 资源不存在（版本不存在或缓存未初始化） |
| `500 Internal Server Error` | 服务器内部错误 |

### 常见错误

#### 1. 缓存未初始化

```json
{
  "error": "Cache not available",
  "message": "No cached data found. Please trigger the cron job first."
}
```

**解决方法**: 访问 `/api/cron` 端点触发数据同步

#### 2. 版本不存在

```json
{
  "error": "Version not found",
  "message": "Version 1.0.0 does not exist in the cache.",
  "availableVersions": ["0.9.0", "0.8.5", "0.8.4"]
}
```

**解决方法**: 使用 `availableVersions` 中的版本号

#### 3. 验证数据不可用

```json
{
  "error": "Validation not available",
  "message": "Image validation data is not available for version 1.0.0."
}
```

**解决方法**: 该版本可能在镜像验证功能添加之前就已缓存

---

## 缓存策略

所有 API 响应都包含 HTTP 缓存头：

```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

### 缓存参数说明

- `public`: 响应可被任何缓存（浏览器、CDN）缓存
- `s-maxage=3600`: CDN 缓存 1 小时
- `stale-while-revalidate=86400`: 过期后 24 小时内可返回旧数据，同时后台更新

### 缓存建议

1. **生产环境**: 利用 HTTP 缓存减少请求
2. **实时性要求高**: 使用 `Cache-Control: no-cache` 请求头
3. **批量操作**: 一次性获取所需数据，避免重复请求

---

## 性能优化建议

### 1. 减少 API 调用

```bash
# ❌ 不推荐：多次调用
curl /api/versions/1.0.0
curl /api/versions/1.0.0/images
curl /api/versions/1.0.0/validation

# ✅ 推荐：一次性获取需要的数据
curl '/api/versions/1.0.0/images?include_validation=true'
```

### 2. 使用合适的格式

```bash
# JSON 格式适合程序处理
curl /api/versions/1.0.0/images

# YAML 格式适合人类阅读和 yq 处理
curl '/api/versions/1.0.0/images?format=yaml' | yq '.api.tag'
```

### 3. 利用 HTTP 缓存

```python
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

# 配置重试和缓存
session = requests.Session()
retry = Retry(total=3, backoff_factor=0.3)
adapter = HTTPAdapter(max_retries=retry)
session.mount('https://', adapter)

# 复用 session
response = session.get("https://your-domain.com/api/versions")
```

---

## 版本兼容性

### API 版本

当前 API 版本: **v1**

API 遵循语义化版本控制：
- **主版本**: 不兼容的 API 变更
- **次版本**: 向后兼容的功能性新增
- **修订版本**: 向后兼容的问题修正

### 变更日志

#### v1.0.0 (2024-01-15)

- ✅ `GET /api/versions` - 列出所有版本
- ✅ `GET /api/versions/latest` - 获取最新版本
- ✅ `GET /api/versions/{version}` - 获取版本详情
- ✅ `GET /api/versions/{version}/images` - 获取镜像列表
- ✅ `GET /api/versions/{version}/values` - 获取 values.yaml
- ✅ `GET /api/versions/{version}/validation` - 获取验证结果

---

## 支持与反馈

如有问题或建议：

1. 提交 Issue 到 GitHub 仓库
2. 查看项目 README 了解更多信息
3. 参考现有的 API 使用示例

---

## 相关资源

- [Dify 官方文档](https://docs.dify.ai/)
- [Dify Helm Chart 仓库](https://github.com/langgenius/dify-helm)
- [项目 README](../README.md)

