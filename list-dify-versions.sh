#!/bin/bash

# Simple script to list Dify Helm Chart versions
# Usage: ./list-dify-versions.sh [format]
# Format options: text (default), json

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
OUTPUT_FORMAT="${1:-text}"

# Function to print colored messages (to stderr)
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check if helm is installed
check_helm() {
    if ! command -v helm &> /dev/null; then
        print_error "Helm is not installed. Please install Helm first."
        print_error "  macOS: brew install helm"
        print_error "  Linux: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
        exit 1
    fi
}

# Add/update helm repo
setup_repo() {
    print_info "Setting up Helm repository..." >&2
    
    if helm repo list 2>/dev/null | grep -q "^${REPO_NAME}"; then
        helm repo update ${REPO_NAME} &>/dev/null
    else
        helm repo add ${REPO_NAME} ${REPO_URL} &>/dev/null
        helm repo update ${REPO_NAME} &>/dev/null
    fi
    
    print_success "Repository ready" >&2
}

# List versions in text format
list_text() {
    echo "======================================"
    echo "Dify Helm Chart - Available Versions"
    echo "======================================"
    echo ""
    helm search repo ${REPO_NAME}/${CHART_NAME} --versions
}

# List versions in JSON format
list_json() {
    helm search repo ${REPO_NAME}/${CHART_NAME} --versions -o json
}

# Show help
show_help() {
    cat << EOF
Dify Helm Chart Version Lister

USAGE:
    $0 [format]

FORMATS:
    text    Human-readable table format (default)
    json    JSON format for programmatic use

EXAMPLES:
    $0              # List versions in text format
    $0 text         # List versions in text format
    $0 json         # List versions in JSON format
    
    # Save to file
    $0 json > versions.json
    
    # Get latest version
    $0 json | jq -r '.[0].version'
    
    # Count versions
    $0 json | jq '. | length'

DEPENDENCIES:
    - helm (required)
    - jq (optional, for JSON processing)

EOF
}

# Main function
main() {
    # Handle help
    if [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_help
        exit 0
    fi
    
    check_helm
    setup_repo
    
    case "${OUTPUT_FORMAT}" in
        json)
            list_json
            ;;
        text)
            list_text
            ;;
        *)
            print_error "Unknown format: ${OUTPUT_FORMAT}"
            print_info "Supported formats: text, json"
            exit 1
            ;;
    esac
    
    print_success "Version list retrieved successfully" >&2
}

main "$@"

