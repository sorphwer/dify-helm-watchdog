#!/bin/bash

# Advanced script to extract all container images from Dify Helm Chart
# This version provides better parsing and organization of images
# Usage: ./get-dify-helm-images.sh [version] [output-format]
# Example: ./get-dify-helm-images.sh 0.1.0 json
# Format options: text, json, csv

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values
REPO_NAME="dify"
REPO_URL="https://langgenius.github.io/dify-helm"
CHART_NAME="dify"
OUTPUT_FORMAT="${2:-text}"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check dependencies
check_dependencies() {
    local deps=("helm")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi
    done
    
    if [ ${#missing[@]} -ne 0 ]; then
        print_error "Missing dependencies: ${missing[*]}"
        print_error "Please install them first."
        exit 1
    fi
    
    if ! command -v yq &> /dev/null; then
        print_warning "yq is not installed. Install it for better YAML parsing:"
        print_warning "  brew install yq  (macOS)"
        print_warning "  sudo apt install yq  (Debian/Ubuntu)"
        print_warning ""
        print_warning "Falling back to basic parsing..."
    fi
}

# Add helm repo
add_helm_repo() {
    print_info "Setting up Helm repository..."
    
    if helm repo list 2>/dev/null | grep -q "^${REPO_NAME}"; then
        helm repo update ${REPO_NAME} &>/dev/null
    else
        helm repo add ${REPO_NAME} ${REPO_URL} &>/dev/null
        helm repo update ${REPO_NAME} &>/dev/null
    fi
    
    print_success "Repository ready"
}

# List available versions
list_versions() {
    print_info "Available versions:" >&2
    helm search repo ${REPO_NAME}/${CHART_NAME} --versions >&2
}

# Extract images using yq (preferred method)
extract_with_yq() {
    local values_file=$1
    local output_file=$2
    
    # Extract all image references with their paths
    yq eval '.. | select(has("repository") and has("tag")) | 
        {"service": path | join("."), 
         "repository": .repository, 
         "tag": .tag, 
         "pullPolicy": .pullPolicy // "IfNotPresent",
         "full_image": .repository + ":" + (.tag | tostring)}' \
        "${values_file}" > "${output_file}" 2>/dev/null || true
}

# Extract images using grep/awk (fallback method)
extract_with_grep() {
    local values_file=$1
    local chart_dir=$2
    
    # Parse the values.yaml to find image patterns
    awk '
    BEGIN { 
        component = ""
        repository = ""
        tag = ""
        in_image_block = 0
    }
    
    # Detect component sections
    /^[a-zA-Z][a-zA-Z0-9_-]*:/ && !/repository:|tag:|image:|pullPolicy:/ {
        if (repository != "" && tag != "") {
            print component "|" repository "|" tag "|" repository ":" tag
        }
        component = $1
        gsub(/:/, "", component)
        repository = ""
        tag = ""
        in_image_block = 0
    }
    
    # Detect image subsections
    /^  image:/ {
        in_image_block = 1
    }
    
    # Extract repository
    /repository:/ {
        repository = $2
        gsub(/"/, "", repository)
        gsub(/'\''/, "", repository)
    }
    
    # Extract tag
    /tag:/ {
        tag = $2
        gsub(/"/, "", tag)
        gsub(/'\''/, "", tag)
    }
    
    END {
        if (repository != "" && tag != "") {
            print component "|" repository "|" tag "|" repository ":" tag
        }
    }
    ' "${values_file}"
}

# Parse and extract images
extract_images() {
    local version=$1
    
    print_info "Fetching chart version: ${version}"
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf ${TEMP_DIR}" EXIT
    
    # Pull the chart
    helm pull ${REPO_NAME}/${CHART_NAME} --version ${version} --untar --untardir ${TEMP_DIR} 2>&1 | grep -v "Pulled" || true
    
    CHART_DIR="${TEMP_DIR}/${CHART_NAME}"
    VALUES_FILE="${CHART_DIR}/values.yaml"
    
    if [ ! -f "${VALUES_FILE}" ]; then
        print_error "values.yaml not found"
        exit 1
    fi
    
    print_success "Chart downloaded successfully"
    print_info "Extracting images..."
    
    # Try yq first, fall back to grep
    if command -v yq &> /dev/null; then
        TEMP_OUTPUT="${TEMP_DIR}/images.txt"
        extract_with_yq "${VALUES_FILE}" "${TEMP_OUTPUT}"
        
        if [ -s "${TEMP_OUTPUT}" ]; then
            format_output_yq "${TEMP_OUTPUT}"
        else
            print_warning "yq extraction failed, using fallback method"
            format_output_grep "${VALUES_FILE}" "${CHART_DIR}"
        fi
    else
        format_output_grep "${VALUES_FILE}" "${CHART_DIR}"
    fi
}

# Format output from yq results
format_output_yq() {
    local input_file=$1
    
    case "${OUTPUT_FORMAT}" in
        json)
            echo "["
            first=1
            while IFS= read -r line; do
                if [ $first -eq 0 ]; then
                    echo ","
                fi
                echo "$line" | sed 's/^/  /'
                first=0
            done < "${input_file}"
            echo ""
            echo "]"
            ;;
        csv)
            echo "Component,Repository,Tag,Full Image,Pull Policy"
            yq eval '.service + "," + .repository + "," + .tag + "," + .full_image + "," + .pullPolicy' "${input_file}" 2>/dev/null || true
            ;;
        *)
            echo "======================================"
            echo "Container Images by Service"
            echo "======================================"
            echo ""
            
            while IFS= read -r line; do
                service=$(echo "$line" | yq eval '.service' - 2>/dev/null)
                full_image=$(echo "$line" | yq eval '.full_image' - 2>/dev/null)
                
                if [ ! -z "$service" ] && [ ! -z "$full_image" ] && [ "$full_image" != "null" ]; then
                    echo "Service: ${service}"
                    echo "Image:   ${full_image}"
                    echo ""
                fi
            done < "${input_file}"
            ;;
    esac
}

# Format output from grep results
format_output_grep() {
    local values_file=$1
    local chart_dir=$2
    
    case "${OUTPUT_FORMAT}" in
        json)
            echo "["
            first=1
            extract_with_grep "${values_file}" "${chart_dir}" | while IFS='|' read -r component repository tag full_image; do
                if [ ! -z "$repository" ]; then
                    if [ $first -eq 0 ]; then
                        echo ","
                    fi
                    cat <<EOF
  {
    "component": "${component}",
    "repository": "${repository}",
    "tag": "${tag}",
    "full_image": "${full_image}"
  }
EOF
                    first=0
                fi
            done
            echo ""
            echo "]"
            ;;
        csv)
            echo "Component,Repository,Tag,Full Image"
            extract_with_grep "${values_file}" "${chart_dir}" | while IFS='|' read -r component repository tag full_image; do
                if [ ! -z "$repository" ]; then
                    echo "${component},${repository},${tag},${full_image}"
                fi
            done
            ;;
        *)
            echo "======================================"
            echo "Container Images by Service"
            echo "======================================"
            echo ""
            extract_with_grep "${values_file}" "${chart_dir}" | while IFS='|' read -r component repository tag full_image; do
                if [ ! -z "$repository" ]; then
                    echo "Component: ${component}"
                    echo "Image:     ${full_image}"
                    echo "  Repository: ${repository}"
                    echo "  Tag:        ${tag}"
                    echo ""
                fi
            done
            ;;
    esac
}

# Main
main() {
    check_dependencies
    add_helm_repo
    
    if [ -z "$1" ]; then
        print_warning "No version specified"
        echo "" >&2
        list_versions
        echo "" >&2
        print_info "Usage: $0 <version> [format]" >&2
        print_info "Formats: text (default), json, csv" >&2
        print_info "Example: $0 0.1.0 json" >&2
        exit 0
    fi
    
    extract_images "$1"
    print_success "Extraction completed!" >&2
}

main "$@"

