#!/bin/bash

# GUN Installation Script with APT-based Node.js
# This script installs Node.js via apt, GUN, and sets up a systemd service
# Usage: ./install.sh [OPTIONS]

set -e

# Default values
VERSION="master"
PORT="8765"
PEERS=""
RAD="true"
HTTPS_KEY=""
HTTPS_CERT=""
SERVICE_NAME="relay"
INSTALL_DIR="$HOME/gun"
SKIP_DEPS=false
SKIP_SERVICE=false
DRY_RUN=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Help function
show_help() {
    cat << EOF
GUN Installation Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -v, --version VERSION       Git branch/tag to checkout (default: master)
    -p, --port PORT            Port number for the server (default: 8765)
    -P, --peers PEERS          Comma-separated list of peer URLs
    -d, --dir DIRECTORY        Installation directory (default: ~/gun)
    -s, --service NAME         Systemd service name (default: relay)
    --rad BOOL                 Enable/disable RAD storage (default: true)
    --https-key PATH           Path to HTTPS key file
    --https-cert PATH          Path to HTTPS certificate file
    --skip-deps                Skip dependency installation
    --skip-service             Skip systemd service setup
    --dry-run                  Show what would be done without executing
    -h, --help                 Show this help message

ENVIRONMENT VARIABLES:
    VERSION, PORT, PEERS, RAD, HTTPS_KEY, HTTPS_CERT, SERVICE_NAME, INSTALL_DIR

EXAMPLES:
    # Basic installation
    $0

    # Install specific version with custom port
    $0 --version v0.2020.1241 --port 3000

    # Install with HTTPS and peers
    $0 --https-key /path/to/key.pem --https-cert /path/to/cert.pem --peers "http://peer1.com/gun,http://peer2.com/gun"

    # Install without systemd service
    $0 --skip-service

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

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -P|--peers)
            PEERS="$2"
            shift 2
            ;;
        -d|--dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        -s|--service)
            SERVICE_NAME="$2"
            shift 2
            ;;
        --rad)
            RAD="$2"
            shift 2
            ;;
        --https-key)
            HTTPS_KEY="$2"
            shift 2
            ;;
        --https-cert)
            HTTPS_CERT="$2"
            shift 2
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --skip-service)
            SKIP_SERVICE=true
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
validate_port() {
    local port="$1"
    if [[ ! "$port" =~ ^[0-9]+$ ]] || [[ "$port" -lt 1 ]] || [[ "$port" -gt 65535 ]]; then
        log_error "Invalid port: $port. Must be between 1-65535"
        exit 1
    fi
}

validate_path() {
    local path="$1"
    # Prevent path traversal
    if [[ "$path" =~ \.\./ ]] || [[ "$path" =~ ^/ && "$path" != /home/* && "$path" != /opt/* && "$path" != /usr/local/* ]]; then
        log_error "Invalid path: $path. Potential security risk detected"
        exit 1
    fi
}

validate_service_name() {
    local name="$1"
    if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid service name: $name. Must contain only alphanumeric, underscore, or dash"
        exit 1
    fi
}

# Use environment variables if not set by flags (with validation)
VERSION="${VERSION:-master}"
PORT="${PORT:-8765}"
PEERS="${PEERS:-}"
RAD="${RAD:-true}"
HTTPS_KEY="${HTTPS_KEY:-}"
HTTPS_CERT="${HTTPS_CERT:-}"
SERVICE_NAME="${SERVICE_NAME:-relay}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/gun}"

# Validate inputs
validate_port "$PORT"
validate_path "$INSTALL_DIR"
validate_service_name "$SERVICE_NAME"
[[ -n "$HTTPS_KEY" ]] && validate_path "$HTTPS_KEY"
[[ -n "$HTTPS_CERT" ]] && validate_path "$HTTPS_CERT"

# Enhanced execute function with error handling
execute() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: $*"
        return 0
    fi
    
    local cmd="$1"
    shift
    
    # Log command execution
    log_info "Executing: $cmd $*"
    
    # Execute with timeout and error handling
    if timeout 300 "$cmd" "$@"; then
        return 0
    else
        local exit_code=$?
        log_error "Command failed (exit code $exit_code): $cmd $*"
        return $exit_code
    fi
}

# Check if running as root for system operations
check_sudo() {
    if [[ $EUID -eq 0 ]]; then
        SUDO=""
    else
        SUDO="sudo"
        if ! command -v sudo &> /dev/null; then
            log_error "This script requires sudo privileges for system operations"
            exit 1
        fi
    fi
}

# Install system dependencies
install_dependencies() {
    if [[ "$SKIP_DEPS" == "true" ]]; then
        log_info "Skipping dependency installation"
        return
    fi

    log_info "Installing system dependencies..."
    
    # Detect package manager and install dependencies
    if command -v apt-get &> /dev/null; then
        execute $SUDO apt-get update -y
        # Install Node.js via NodeSource repository to avoid conflicts
        if ! command -v node &> /dev/null; then
            log_info "Installing Node.js via NodeSource repository..."
            
            # Download and verify NodeSource setup script
            local setup_script="/tmp/nodejs_setup_$$.sh"
            if execute curl -fsSL "https://deb.nodesource.com/setup_lts.x" -o "$setup_script"; then
                # Basic validation - check if it looks like a proper setup script
                if grep -q "NODE_SETUP" "$setup_script" && grep -q "apt-get" "$setup_script"; then
                    log_info "NodeSource script downloaded and validated"
                    execute $SUDO bash "$setup_script"
                    execute rm -f "$setup_script"
                else
                    log_error "Downloaded script failed validation"
                    execute rm -f "$setup_script"
                    exit 1
                fi
            else
                log_error "Failed to download NodeSource setup script"
                exit 1
            fi
            
            execute $SUDO apt-get install -y nodejs
        fi
        # Install other dependencies
        execute $SUDO apt-get install -y curl git systemd
    elif command -v yum &> /dev/null; then
        execute $SUDO yum check-update -y || true
        execute $SUDO yum install -y curl git systemd nodejs npm
    elif command -v dnf &> /dev/null; then
        execute $SUDO dnf check-update -y || true
        execute $SUDO dnf install -y curl git systemd nodejs npm
    else
        log_error "Unsupported package manager. Please install nodejs, npm, git, and systemd manually."
        exit 1
    fi

    # Verify Node.js installation
    if ! command -v node &> /dev/null; then
        log_error "Node.js installation failed"
        exit 1
    fi

    log_info "Node.js version: $(node --version)"
    log_info "NPM version: $(npm --version)"
}

# Install GUN
install_gun() {
    log_info "Installing GUN to $INSTALL_DIR..."
    
    # Create installation directory
    execute mkdir -p "$(dirname "$INSTALL_DIR")"
    
    # Clone or update GUN repository
    if [[ -d "$INSTALL_DIR" ]]; then
        log_info "GUN directory exists, updating..."
        execute cd "$INSTALL_DIR"
        execute git fetch
        execute git checkout "$VERSION"
        execute git pull origin "$VERSION" || true
    else
        execute git clone https://github.com/akaoio/gun.git "$INSTALL_DIR"
        execute cd "$INSTALL_DIR"
        execute git checkout "$VERSION"
    fi
    
    # Install npm dependencies
    log_info "Installing GUN dependencies..."
    execute npm install
    
    log_info "GUN installed successfully"
}

# Create systemd service
create_service() {
    if [[ "$SKIP_SERVICE" == "true" ]]; then
        log_info "Skipping systemd service creation"
        return
    fi

    log_info "Creating systemd service: $SERVICE_NAME"
    
    # Create service file content
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    
    # Build environment variables
    ENV_VARS=""
    [[ -n "$PORT" ]] && ENV_VARS="${ENV_VARS}Environment=PORT=$PORT\n"
    [[ -n "$PEERS" ]] && ENV_VARS="${ENV_VARS}Environment=PEERS=$PEERS\n"
    [[ -n "$RAD" ]] && ENV_VARS="${ENV_VARS}Environment=RAD=$RAD\n"
    [[ -n "$HTTPS_KEY" ]] && ENV_VARS="${ENV_VARS}Environment=HTTPS_KEY=$HTTPS_KEY\n"
    [[ -n "$HTTPS_CERT" ]] && ENV_VARS="${ENV_VARS}Environment=HTTPS_CERT=$HTTPS_CERT\n"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create service file: $SERVICE_FILE"
        log_info "[DRY RUN] Service content would be:"
        echo "---"
        cat << EOF
[Unit]
Description=GUN Graph Database Relay Peer
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=1
User=$(whoami)
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/script/server.js
$(echo -e "$ENV_VARS")

[Install]
WantedBy=multi-user.target
EOF
        echo "---"
    else
        execute $SUDO tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=GUN Graph Database Relay Peer
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=1
User=$(whoami)
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/script/server.js
$(echo -e "$ENV_VARS")

[Install]
WantedBy=multi-user.target
EOF
    fi
    
    # Reload systemd and enable service
    execute $SUDO systemctl daemon-reload
    execute $SUDO systemctl enable "$SERVICE_NAME"
    
    log_info "Systemd service created and enabled"
}

# Configure system limits
configure_limits() {
    log_info "Configuring system limits for high performance..."
    
    # Increase file descriptor limits
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would add 'fs.file-max = 999999' to /etc/sysctl.conf"
    else
        if ! grep -q "fs.file-max = 999999" /etc/sysctl.conf 2>/dev/null; then
            execute $SUDO sh -c 'echo "fs.file-max = 999999" >> /etc/sysctl.conf'
        fi
        execute $SUDO sysctl -p /etc/sysctl.conf
    fi
    
    execute ulimit -n 65536
    log_info "System limits configured"
}

# Start service
start_service() {
    if [[ "$SKIP_SERVICE" == "true" ]]; then
        log_info "Skipping service start"
        return
    fi

    log_info "Starting $SERVICE_NAME service..."
    execute $SUDO systemctl restart "$SERVICE_NAME"
    
    # Check service status
    if [[ "$DRY_RUN" != "true" ]]; then
        sleep 2
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            log_info "Service started successfully"
        else
            log_warn "Service may have failed to start. Check: systemctl status $SERVICE_NAME"
        fi
    fi
}

# Rollback function for failed installations
rollback() {
    log_warn "Installation failed, rolling back changes..."
    
    # Stop and remove service if it was created
    if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
        $SUDO systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        $SUDO systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        $SUDO rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
        $SUDO systemctl daemon-reload
        log_info "Removed service: $SERVICE_NAME"
    fi
    
    # Remove installation directory if we created it
    if [[ -d "$INSTALL_DIR" && "$INSTALL_DIR" != "$HOME" && "$INSTALL_DIR" != "/" ]]; then
        if confirm "Remove incomplete installation at $INSTALL_DIR?"; then
            rm -rf "$INSTALL_DIR"
            log_info "Removed directory: $INSTALL_DIR"
        fi
    fi
    
    log_error "Installation rolled back due to errors"
    exit 1
}

# Set up error trap
trap rollback ERR

# Main installation process
main() {
    log_info "Starting GUN installation..."
    log_info "Version: $VERSION"
    log_info "Port: $PORT"
    log_info "Install Directory: $INSTALL_DIR"
    log_info "Service Name: $SERVICE_NAME"
    [[ -n "$PEERS" ]] && log_info "Peers: $PEERS"
    [[ -n "$HTTPS_KEY" ]] && log_info "HTTPS Key: $HTTPS_KEY"
    [[ -n "$HTTPS_CERT" ]] && log_info "HTTPS Cert: $HTTPS_CERT"
    
    # Pre-flight checks
    if [[ -d "$INSTALL_DIR" ]] && [[ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
        if ! confirm "Directory $INSTALL_DIR is not empty. Continue?"; then
            log_info "Installation cancelled"
            exit 0
        fi
    fi
    
    # Check disk space (need at least 500MB)
    local available_space=$(df "$(dirname "$INSTALL_DIR")" | awk 'NR==2 {print $4}')
    if [[ "$available_space" -lt 512000 ]]; then
        log_error "Insufficient disk space. Need at least 500MB, have $((available_space/1024))MB"
        exit 1
    fi
    
    check_sudo
    install_dependencies
    install_gun
    create_service
    configure_limits
    start_service
    
    # Disable error trap on successful completion
    trap - ERR
    
    log_info "GUN installation completed successfully!"
    if [[ "$SKIP_SERVICE" != "true" ]]; then
        log_info "Service: systemctl status $SERVICE_NAME"
        log_info "Logs: journalctl -u $SERVICE_NAME -f"
    fi
    log_info "Directory: $INSTALL_DIR"
}

# Run main function
main "$@"