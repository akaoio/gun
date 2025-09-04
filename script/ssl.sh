#!/bin/bash

# SSL Certificate Management Script using acme.sh
# This script sets up SSL certificates using Let's Encrypt via acme.sh
# Usage: ./ssl.sh [OPTIONS]

set -e

# Default values
DOMAIN=""
EMAIL=""
WEBROOT=""
KEY_FILE="$HOME/key.pem"
CERT_FILE="$HOME/cert.pem"
ACME_DIR="$HOME/.acme.sh"
FORCE_INSTALL=false
DRY_RUN=false
STAGING=false
RELOAD_CMD=""
AUTO_UPGRADE=true

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Help function
show_help() {
    cat << EOF
SSL Certificate Management Script

USAGE:
    $0 [OPTIONS]

REQUIRED OPTIONS:
    -d, --domain DOMAIN        Domain name for the certificate
    -e, --email EMAIL          Email address for Let's Encrypt notifications

OPTIONAL:
    -w, --webroot PATH         Webroot path for domain validation (default: current dir)
    -k, --key-file PATH        Output path for private key (default: ~/key.pem)
    -c, --cert-file PATH       Output path for certificate (default: ~/cert.pem)
    --acme-dir PATH            ACME installation directory (default: ~/.acme.sh)
    --reload-cmd COMMAND       Command to run after certificate installation
    --force                    Force reinstallation of acme.sh
    --staging                  Use Let's Encrypt staging environment (for testing)
    --no-auto-upgrade          Disable automatic acme.sh upgrades
    --dry-run                  Show what would be done without executing
    -h, --help                 Show this help message

ENVIRONMENT VARIABLES:
    DOMAIN, EMAIL, WEBROOT, KEY_FILE, CERT_FILE, RELOAD_CMD

EXAMPLES:
    # Basic certificate for a domain
    $0 --domain example.com --email admin@example.com

    # Certificate with custom webroot and reload command
    $0 -d example.com -e admin@example.com -w /var/www/html --reload-cmd "systemctl reload nginx"

    # Staging certificate for testing
    $0 --domain test.example.com --email admin@example.com --staging

    # Custom certificate paths
    $0 -d example.com -e admin@example.com --key-file /etc/ssl/private/example.key --cert-file /etc/ssl/certs/example.crt

EOF
}

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -w|--webroot)
            WEBROOT="$2"
            shift 2
            ;;
        -k|--key-file)
            KEY_FILE="$2"
            shift 2
            ;;
        -c|--cert-file)
            CERT_FILE="$2"
            shift 2
            ;;
        --acme-dir)
            ACME_DIR="$2"
            shift 2
            ;;
        --reload-cmd)
            RELOAD_CMD="$2"
            shift 2
            ;;
        --force)
            FORCE_INSTALL=true
            shift
            ;;
        --staging)
            STAGING=true
            shift
            ;;
        --no-auto-upgrade)
            AUTO_UPGRADE=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Use environment variables if not set by flags
DOMAIN="${DOMAIN:-$DOMAIN}"
EMAIL="${EMAIL:-$EMAIL}"
WEBROOT="${WEBROOT:-$WEBROOT}"
KEY_FILE="${KEY_FILE:-$KEY_FILE}"
CERT_FILE="${CERT_FILE:-$CERT_FILE}"
RELOAD_CMD="${RELOAD_CMD:-$RELOAD_CMD}"

# Validate required parameters
if [[ -z "$DOMAIN" ]]; then
    log_error "Domain is required. Use --domain or set DOMAIN environment variable."
    show_help
    exit 1
fi

if [[ -z "$EMAIL" ]]; then
    log_error "Email is required. Use --email or set EMAIL environment variable."
    show_help
    exit 1
fi

# Set default webroot if not specified
if [[ -z "$WEBROOT" ]]; then
    WEBROOT="$(pwd)"
    log_info "Using current directory as webroot: $WEBROOT"
fi

# Dry run function
execute() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: $*"
    else
        "$@"
    fi
}

# Check if acme.sh is installed
check_acme_installation() {
    if [[ -d "$ACME_DIR" && -f "$ACME_DIR/acme.sh" && "$FORCE_INSTALL" != "true" ]]; then
        log_info "acme.sh is already installed at $ACME_DIR"
        return 0
    else
        return 1
    fi
}

# Install acme.sh
install_acme() {
    if check_acme_installation; then
        return 0
    fi

    log_info "Installing acme.sh..."
    
    # Remove existing installation if force install
    if [[ "$FORCE_INSTALL" == "true" && -d "$ACME_DIR" ]]; then
        log_info "Force install: removing existing acme.sh installation"
        execute rm -rf "$ACME_DIR"
    fi
    
    # Create temporary directory for download
    TEMP_DIR=$(mktemp -d)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would download and install acme.sh"
        return 0
    fi
    
    # Download and install acme.sh
    cd "$TEMP_DIR"
    execute git clone https://github.com/acmesh-official/acme.sh.git
    cd acme.sh
    
    # Build install command
    INSTALL_CMD="./acme.sh --install --home $ACME_DIR --accountemail $EMAIL"
    if [[ "$AUTO_UPGRADE" == "false" ]]; then
        INSTALL_CMD="$INSTALL_CMD --noupgrade"
    fi
    
    execute $INSTALL_CMD
    
    # Cleanup
    cd ~
    execute rm -rf "$TEMP_DIR"
    
    log_info "acme.sh installed successfully"
}

# Issue certificate
issue_certificate() {
    log_info "Issuing certificate for domain: $DOMAIN"
    
    # Build acme.sh command
    ACME_CMD="$ACME_DIR/acme.sh --issue -d $DOMAIN -w $WEBROOT"
    
    if [[ "$STAGING" == "true" ]]; then
        ACME_CMD="$ACME_CMD --staging"
        log_warn "Using Let's Encrypt staging environment (test certificates)"
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would issue certificate with: $ACME_CMD"
        return 0
    fi
    
    # Execute certificate issuance
    if execute $ACME_CMD; then
        log_info "Certificate issued successfully"
    else
        log_error "Certificate issuance failed"
        exit 1
    fi
}

# Install certificate
install_certificate() {
    log_info "Installing certificate to:"
    log_info "  Key file: $KEY_FILE"
    log_info "  Cert file: $CERT_FILE"
    
    # Create directories if they don't exist
    execute mkdir -p "$(dirname "$KEY_FILE")"
    execute mkdir -p "$(dirname "$CERT_FILE")"
    
    # Build install command
    INSTALL_CMD="$ACME_DIR/acme.sh --install-cert -d $DOMAIN --key-file $KEY_FILE --fullchain-file $CERT_FILE"
    
    if [[ -n "$RELOAD_CMD" ]]; then
        INSTALL_CMD="$INSTALL_CMD --reloadcmd \"$RELOAD_CMD\""
        log_info "  Reload command: $RELOAD_CMD"
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install certificate with: $INSTALL_CMD"
        return 0
    fi
    
    # Execute certificate installation
    if execute bash -c "$INSTALL_CMD"; then
        log_info "Certificate installed successfully"
    else
        log_error "Certificate installation failed"
        exit 1
    fi
}

# Verify certificate
verify_certificate() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would verify certificate files"
        return 0
    fi

    log_info "Verifying certificate installation..."
    
    if [[ -f "$KEY_FILE" && -f "$CERT_FILE" ]]; then
        log_info "Certificate files exist:"
        log_info "  Key: $KEY_FILE ($(stat -c%s "$KEY_FILE") bytes)"
        log_info "  Cert: $CERT_FILE ($(stat -c%s "$CERT_FILE") bytes)"
        
        # Check certificate validity
        if command -v openssl &> /dev/null; then
            CERT_INFO=$(openssl x509 -in "$CERT_FILE" -text -noout 2>/dev/null || echo "")
            if [[ -n "$CERT_INFO" ]]; then
                EXPIRY=$(echo "$CERT_INFO" | grep "Not After" | cut -d: -f2- | xargs)
                log_info "  Certificate expires: $EXPIRY"
            fi
        fi
    else
        log_error "Certificate files not found after installation"
        exit 1
    fi
}

# Show renewal information
show_renewal_info() {
    log_info "Certificate renewal information:"
    log_info "  Certificates are automatically renewed by acme.sh"
    log_info "  Check renewal status: $ACME_DIR/acme.sh --list"
    log_info "  Manual renewal: $ACME_DIR/acme.sh --renew -d $DOMAIN"
    if [[ -n "$RELOAD_CMD" ]]; then
        log_info "  Service will be reloaded automatically: $RELOAD_CMD"
    fi
}

# Main process
main() {
    log_info "Starting SSL certificate setup..."
    log_info "Domain: $DOMAIN"
    log_info "Email: $EMAIL"
    log_info "Webroot: $WEBROOT"
    log_info "Key file: $KEY_FILE"
    log_info "Cert file: $CERT_FILE"
    [[ "$STAGING" == "true" ]] && log_warn "Using staging environment"
    [[ "$DRY_RUN" == "true" ]] && log_warn "DRY RUN MODE - No changes will be made"
    
    install_acme
    issue_certificate
    install_certificate
    verify_certificate
    show_renewal_info
    
    log_info "SSL certificate setup completed successfully!"
}

# Run main function
main "$@"