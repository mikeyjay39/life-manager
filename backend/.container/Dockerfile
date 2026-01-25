FROM archlinux:base

# ----------------------------------
# System dependencies (without rustup!)
# ----------------------------------
RUN pacman -Sy --noconfirm \
    git \
    curl \
    unzip \
    fzf \
    ripgrep \
    fd \
    base-devel \
    xclip \
    wl-clipboard \
    lldb \
    python \
    neovim \
    rustup \
    postgresql-libs \
    docker \
    docker-compose \
    && pacman -Scc --noconfirm

# Initialize rustup properly
RUN rustup toolchain install stable
RUN rustup default stable

RUN rustup component add rust-analyzer

RUN cargo install cargo-nextest --locked

# ----------------------------------
# Cargo/Rust environment
# ----------------------------------
ENV CARGO_HOME=/root/.cargo
ENV RUSTUP_HOME=/root/.rustup
ENV PATH="/root/.cargo/bin:${PATH}:/usr/lib/rustup:/usr/lib/rustup/bin"

# auto-load rustup env
RUN echo 'source $HOME/.cargo/env' >> /root/.bashrc

RUN mkdir -p ${CARGO_HOME} ${RUSTUP_HOME}

# ----------------------------------
# Set working directory
# ----------------------------------
WORKDIR /workspace

# ----------------------------------
# Default command
# ----------------------------------
CMD ["nvim"]
