#!/bin/bash

# Script to extract default values.yaml from Dify Helm Chart versions
# Usage: ./get-dify-values.sh [version] [output-format]
# Example: ./get-dify-values.sh 3.5.3 file
# Format options: display (default), file, compare

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
OUTPUT_MODE="${2:-display}"

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
    if ! command -v helm &> /dev/null; then
        print_error "Helm is not installed. Please install Helm first."
        print_error "  macOS: brew install helm"
        print_error "  Linux: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
        exit 1
    fi
    
    print_success "Helm is available: $(helm version --short)"
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
    print_info "Available Dify Helm Chart versions:" >&2
    echo "" >&2
    helm search repo ${REPO_NAME}/${CHART_NAME} --versions >&2
    echo "" >&2
    print_info "Usage: $0 <version> [mode]" >&2
    print_info "Modes:" >&2
    print_info "  display  - Show values.yaml content (default)" >&2
    print_info "  file     - Save to dify-values-<version>.yaml" >&2
    print_info "  compare  - Save and show diff with previous version" >&2
    print_info "Examples:" >&2
    print_info "  $0 3.5.3" >&2
    print_info "  $0 3.5.3 file" >&2
    print_info "  $0 3.5.3 compare" >&2
}

# Get values.yaml for a specific version
get_values() {
    local version=$1
    local mode=$2
    
    print_info "Fetching values.yaml for Dify Chart version: ${version}"
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf ${TEMP_DIR}" EXIT
    
    VALUES_FILE="${TEMP_DIR}/values.yaml"
    
    # Get values using helm show values (more reliable than helm pull)
    print_info "Downloading values.yaml..."
    if ! helm show values ${REPO_NAME}/${CHART_NAME} --version ${version} > "${VALUES_FILE}" 2>/dev/null; then
        print_error "Failed to get values.yaml for version ${version}"
        print_error "Please check if the version exists: helm search repo ${REPO_NAME}/${CHART_NAME} --versions"
        exit 1
    fi
    
    if [ ! -s "${VALUES_FILE}" ]; then
        print_error "values.yaml is empty or not found"
        exit 1
    fi
    
    print_success "Values.yaml downloaded successfully"
    
    case "${mode}" in
        "file")
            save_to_file "${VALUES_FILE}" "${version}"
            ;;
        "compare")
            compare_versions "${VALUES_FILE}" "${version}"
            ;;
        *)
            display_values "${VALUES_FILE}" "${version}"
            ;;
    esac
}

# Display values.yaml content
display_values() {
    local values_file=$1
    local version=$2
    
    print_info "Displaying values.yaml for version ${version}:" >&2
    echo "" >&2
    echo "# =============================================" >&2
    echo "# Dify Helm Chart v${version} - values.yaml" >&2
    echo "# =============================================" >&2
    echo "" >&2
    
    # Output the values.yaml content
    cat "${values_file}"
}

# Save values.yaml to file
save_to_file() {
    local values_file=$1
    local version=$2
    local output_file="dify-values-${version}.yaml"
    
    # Add header to the output file
    cat > "${output_file}" <<EOF
# =============================================
# Dify Helm Chart v${version} - Default Values
# =============================================
# Generated on: $(date)
# Chart Repository: ${REPO_URL}
# 
# This file contains the default values for Dify Helm Chart v${version}
# You can use this as a reference or base for your custom values.yaml
# 
# Usage:
#   helm install dify dify/dify --version ${version} -f custom-values.yaml
# =============================================

EOF
    
    # Append the actual values.yaml content
    cat "${values_file}" >> "${output_file}"
    
    print_success "Values saved to: ${output_file}"
    
    # Show file info
    local file_size=$(wc -c < "${output_file}" | tr -d ' ')
    local line_count=$(wc -l < "${output_file}" | tr -d ' ')
    print_info "File size: ${file_size} bytes, ${line_count} lines"
}

# Compare with previous version
compare_versions() {
    local values_file=$1
    local version=$2
    
    # Save current version
    save_to_file "${values_file}" "${version}"
    
    # Try to find previous version
    local prev_version=$(helm search repo ${REPO_NAME}/${CHART_NAME} --versions -o json | \
        jq -r '.[].version' | \
        sort -V | \
        awk -v current="${version}" '$0 < current {prev=$0} END {print prev}')
    
    if [ -z "$prev_version" ] || [ "$prev_version" = "null" ]; then
        print_warning "No previous version found for comparison"
        return
    fi
    
    local prev_file="dify-values-${prev_version}.yaml"
    
    # Download previous version if not exists
    if [ ! -f "$prev_file" ]; then
        print_info "Downloading previous version ${prev_version} for comparison..."
        
        TEMP_DIR2=$(mktemp -d)
        PREV_VALUES_FILE="${TEMP_DIR2}/values.yaml"
        
        if helm show values ${REPO_NAME}/${CHART_NAME} --version ${prev_version} > "${PREV_VALUES_FILE}" 2>/dev/null; then
            save_to_file "${PREV_VALUES_FILE}" "${prev_version}"
        else
            print_warning "Could not download previous version ${prev_version}"
            rm -rf ${TEMP_DIR2}
            return
        fi
        
        rm -rf ${TEMP_DIR2}
    fi
    
    print_info "Comparing ${version} with ${prev_version}..."
    echo "" >&2
    
    # Show diff
    if command -v colordiff &> /dev/null; then
        diff -u "$prev_file" "dify-values-${version}.yaml" | colordiff || true
    else
        diff -u "$prev_file" "dify-values-${version}.yaml" || true
    fi
    
    echo "" >&2
    print_success "Comparison completed"
    print_info "Files available:"
    print_info "  Current:  dify-values-${version}.yaml"
    print_info "  Previous: ${prev_file}"
}

# Get all versions values
get_all_versions() {
    print_info "Downloading values.yaml for all available versions..."
    
    local versions=$(helm search repo ${REPO_NAME}/${CHART_NAME} --versions -o json | jq -r '.[].version')
    local total=$(echo "$versions" | wc -l | tr -d ' ')
    local current=0
    
    echo "$versions" | while read -r version; do
        current=$((current + 1))
        print_info "Processing version ${version} (${current}/${total})..."
        
        if get_values "$version" "file" 2>/dev/null; then
            print_success "✓ ${version}"
        else
            print_error "✗ ${version}"
        fi
    done
    
    print_success "All versions processed"
    print_info "Files created: dify-values-*.yaml"
}

# Show values.yaml structure/summary
show_structure() {
    local version=$1
    
    print_info "Analyzing structure of values.yaml for version ${version}..."
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf ${TEMP_DIR}" EXIT
    
    VALUES_FILE="${TEMP_DIR}/values.yaml"
    
    # Get values using helm show values
    if ! helm show values ${REPO_NAME}/${CHART_NAME} --version ${version} > "${VALUES_FILE}" 2>/dev/null; then
        print_error "Failed to get values.yaml for version ${version}"
        exit 1
    fi
    
    echo "" >&2
    echo "# =============================================" >&2
    echo "# Dify v${version} - values.yaml Structure" >&2
    echo "# =============================================" >&2
    echo "" >&2
    
    # Show top-level keys
    print_info "Top-level configuration sections:" >&2
    if command -v yq &> /dev/null; then
        yq eval 'keys' "${VALUES_FILE}" 2>/dev/null | sed 's/^/  /' >&2
    else
        grep '^[a-zA-Z]' "${VALUES_FILE}" | grep ':' | cut -d':' -f1 | sort -u | sed 's/^/  /' >&2
    fi
    
    echo "" >&2
    
    # Show file stats
    local file_size=$(wc -c < "${VALUES_FILE}" | tr -d ' ')
    local line_count=$(wc -l < "${VALUES_FILE}" | tr -d ' ')
    local comment_lines=$(grep -c '^#' "${VALUES_FILE}" || echo "0")
    local config_lines=$((line_count - comment_lines))
    
    print_info "File statistics:" >&2
    echo "  Total lines: ${line_count}" >&2
    echo "  Comment lines: ${comment_lines}" >&2
    echo "  Configuration lines: ${config_lines}" >&2
    echo "  File size: ${file_size} bytes" >&2
    
    echo "" >&2
    
    # Show image references
    print_info "Container images referenced:" >&2
    grep -E "repository:|image:" "${VALUES_FILE}" | grep -v '^#' | sed 's/^/  /' >&2 || echo "  No image references found" >&2
}

# Main function
main() {
    check_dependencies
    add_helm_repo
    
    # Handle special commands
    case "$1" in
        "all")
            get_all_versions
            return
            ;;
        "structure"|"struct")
            if [ -z "$2" ]; then
                print_error "Version required for structure analysis"
                print_info "Usage: $0 structure <version>"
                exit 1
            fi
            show_structure "$2"
            return
            ;;
        "")
            list_versions
            return
            ;;
    esac
    
    # Regular version processing
    local version=$1
    local mode=${2:-display}
    
    get_values "$version" "$mode"
}

# Show help
show_help() {
    cat << EOF
Dify Helm Chart Values Extractor

USAGE:
    $0 [version] [mode]
    $0 [command] [args]

MODES:
    display     Show values.yaml content (default)
    file        Save to dify-values-<version>.yaml
    compare     Save and compare with previous version

COMMANDS:
    all         Download values.yaml for all versions
    structure   Show values.yaml structure analysis
    help        Show this help message

EXAMPLES:
    $0                          # List available versions
    $0 3.5.3                    # Display values.yaml for v3.5.3
    $0 3.5.3 file              # Save values.yaml to file
    $0 3.5.3 compare           # Compare with previous version
    $0 all                      # Download all versions
    $0 structure 3.5.3         # Analyze structure of v3.5.3

FILES CREATED:
    dify-values-<version>.yaml  # Default values for specific version

DEPENDENCIES:
    - helm (required)
    - jq (optional, for better JSON processing)
    - yq (optional, for better YAML processing)
    - colordiff (optional, for colored diff output)

EOF
}

# Handle help
if [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
    exit 0
fi

# Run main function
main "$@"
