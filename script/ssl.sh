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
STANDALONE=false
DNS_MODE=false
DNS_PROVIDER=""
DNS_API_KEY=""
DNS_API_SECRET=""
DNS_EMAIL=""

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
    --standalone               Use standalone mode (temporary web server on port 80)
    --dns [PROVIDER]          Use DNS validation. Options: manual, cloudflare, route53, digitalocean
    --dns-api-key KEY         DNS provider API key (required for automatic DNS)
    --dns-api-secret SECRET   DNS provider API secret (for some providers)
    --dns-email EMAIL         DNS provider email (for Cloudflare)
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

    # Standalone mode (no web server needed)
    $0 --domain example.com --email admin@example.com --standalone

    # DNS validation with Cloudflare (automatic)
    $0 --domain example.com --email admin@example.com --dns cloudflare --dns-api-key YOUR_CF_API_KEY --dns-email admin@example.com

    # DNS validation with Route53 (automatic)
    $0 --domain example.com --email admin@example.com --dns route53 --dns-api-key AWS_KEY --dns-api-secret AWS_SECRET

    # Manual DNS validation (IPv6-only servers)
    $0 --domain example.com --email admin@example.com --dns

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
        --standalone)
            STANDALONE=true
            shift
            ;;
        --dns)
            DNS_MODE=true
            DNS_PROVIDER="${2:-manual}"
            if [[ "$2" && "$2" != --* ]]; then
                shift 2
            else
                shift
            fi
            ;;
        --dns-api-key)
            DNS_API_KEY="$2"
            shift 2
            ;;
        --dns-api-secret)
            DNS_API_SECRET="$2"
            shift 2
            ;;
        --dns-email)
            DNS_EMAIL="$2"
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

# Input validation functions
validate_domain() {
    local domain="$1"
    # Basic domain validation - RFC compliant
    if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        log_error "Invalid domain format: $domain"
        exit 1
    fi
    if [[ ${#domain} -gt 253 ]]; then
        log_error "Domain too long: $domain (max 253 chars)"
        exit 1
    fi
}

validate_email() {
    local email="$1"
    # Basic email validation
    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        log_error "Invalid email format: $email"
        exit 1
    fi
}

validate_path() {
    local path="$1"
    # Prevent path traversal attacks
    if [[ "$path" =~ \.\./ ]]; then
        log_error "Path traversal detected: $path"
        exit 1
    fi
    # Ensure absolute paths for key files
    if [[ "$path" =~ \.(pem|key|crt|cert)$ && ! "$path" =~ ^/ ]]; then
        log_error "Key/cert files must use absolute paths: $path"
        exit 1
    fi
}

sanitize_command() {
    local cmd="$1"
    # Remove potentially dangerous characters
    echo "$cmd" | sed 's/[;&|`$(){}\[\]\\]//g'
}

# Use environment variables if not set by flags (with defaults)
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
WEBROOT="${WEBROOT:-}"
KEY_FILE="${KEY_FILE:-$HOME/key.pem}"
CERT_FILE="${CERT_FILE:-$HOME/cert.pem}"
RELOAD_CMD="${RELOAD_CMD:-}"

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

# Validate inputs
validate_domain "$DOMAIN"
validate_email "$EMAIL"
[[ -n "$WEBROOT" ]] && validate_path "$WEBROOT"
validate_path "$KEY_FILE"
validate_path "$CERT_FILE"
[[ -n "$RELOAD_CMD" ]] && RELOAD_CMD="$(sanitize_command "$RELOAD_CMD")"

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
    if [[ "$STANDALONE" == "true" ]]; then
        ACME_CMD="$ACME_DIR/acme.sh --server letsencrypt --issue -d $DOMAIN --standalone"
        log_info "Using standalone mode (temporary web server on port 80)"
    elif [[ "$DNS_MODE" == "true" ]]; then
        # Setup DNS provider environment variables
        if [[ "$DNS_PROVIDER" == "cloudflare" ]]; then
            [[ -n "$DNS_API_KEY" ]] && export CF_Key="$DNS_API_KEY"
            [[ -n "$DNS_EMAIL" ]] && export CF_Email="$DNS_EMAIL"
            ACME_CMD="$ACME_DIR/acme.sh --server letsencrypt --issue -d $DOMAIN --dns dns_cf"
            log_info "Using Cloudflare automatic DNS validation"
        elif [[ "$DNS_PROVIDER" == "route53" ]]; then
            [[ -n "$DNS_API_KEY" ]] && export AWS_ACCESS_KEY_ID="$DNS_API_KEY"
            [[ -n "$DNS_API_SECRET" ]] && export AWS_SECRET_ACCESS_KEY="$DNS_API_SECRET"
            ACME_CMD="$ACME_DIR/acme.sh --server letsencrypt --issue -d $DOMAIN --dns dns_aws"
            log_info "Using Route53 automatic DNS validation"
        elif [[ "$DNS_PROVIDER" == "digitalocean" ]]; then
            [[ -n "$DNS_API_KEY" ]] && export DO_API_KEY="$DNS_API_KEY"
            ACME_CMD="$ACME_DIR/acme.sh --server letsencrypt --issue -d $DOMAIN --dns dns_dgon"
            log_info "Using DigitalOcean automatic DNS validation"
        else
            ACME_CMD="$ACME_DIR/acme.sh --server letsencrypt --issue -d $DOMAIN --dns --yes-I-know-dns-manual-mode-enough-go-ahead-please"
            log_info "Using DNS validation mode (manual TXT record)"
        fi
    else
        ACME_CMD="$ACME_DIR/acme.sh --server letsencrypt --issue -d $DOMAIN -w $WEBROOT"
        log_info "Using webroot mode with path: $WEBROOT"
    fi
    
    if [[ "$STAGING" == "true" ]]; then
        ACME_CMD="$ACME_CMD --staging"
        log_warn "Using Let's Encrypt staging environment (test certificates)"
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would issue certificate with: $ACME_CMD"
        return 0
    fi
    
    # Execute certificate issuance with proper error handling
    log_debug "Executing: $ACME_CMD"
    
    if execute bash -c "$ACME_CMD"; then
        log_info "Certificate issued successfully"
        
        # Verify certificate was actually created
        if [[ ! -f "$ACME_DIR/$DOMAIN/fullchain.cer" ]]; then
            log_error "Certificate issuance reported success but files not found"
            exit 1
        fi
    else
        local exit_code=$?
        log_error "Certificate issuance failed with exit code $exit_code"
        
        # Show debug information
        log_info "For troubleshooting, run with --debug:"
        log_info "$ACME_DIR/acme.sh --issue -d $DOMAIN --debug"
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

# Cleanup function for failed SSL operations
cleanup_ssl() {
    log_warn "SSL setup failed, cleaning up..."
    
    # Remove failed certificate attempt
    if [[ -d "$ACME_DIR/$DOMAIN" ]]; then
        rm -rf "$ACME_DIR/$DOMAIN"
        log_info "Removed failed certificate directory"
    fi
    
    # Remove incomplete certificate files
    [[ -f "$KEY_FILE" && ! -s "$KEY_FILE" ]] && rm -f "$KEY_FILE"
    [[ -f "$CERT_FILE" && ! -s "$CERT_FILE" ]] && rm -f "$CERT_FILE"
    
    log_error "SSL setup failed and cleaned up"
    exit 1
}

# Set up error trap
trap cleanup_ssl ERR

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
    
    # Pre-flight checks
    if [[ "$STANDALONE" == "true" ]]; then
        # Check if port 80 is available for standalone mode
        if ss -tlnp | grep -q ':80 '; then
            log_error "Port 80 is already in use. Stop other services or use webroot mode"
            exit 1
        fi
    fi
    
    if [[ "$DNS_MODE" == "true" && "$DNS_PROVIDER" != "manual" ]]; then
        # Validate DNS API credentials are provided
        case "$DNS_PROVIDER" in
            cloudflare)
                if [[ -z "$DNS_API_KEY" || -z "$DNS_EMAIL" ]]; then
                    log_error "Cloudflare requires --dns-api-key and --dns-email"
                    exit 1
                fi
                ;;
            route53)
                if [[ -z "$DNS_API_KEY" || -z "$DNS_API_SECRET" ]]; then
                    log_error "Route53 requires --dns-api-key and --dns-api-secret"
                    exit 1
                fi
                ;;
            digitalocean)
                if [[ -z "$DNS_API_KEY" ]]; then
                    log_error "DigitalOcean requires --dns-api-key"
                    exit 1
                fi
                ;;
        esac
    fi
    
    install_acme
    issue_certificate
    install_certificate
    verify_certificate
    show_renewal_info
    
    # Disable error trap on success
    trap - ERR
    
    log_info "SSL certificate setup completed successfully!"
}

# Run main function
main "$@"