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
    && pacman -Scc --noconfirm

RUN rustup default stable

RUN rustup component add rust-analyzer

RUN cargo install cargo-nextest

# ----------------------------------
# Cargo/Rust environment
# ----------------------------------
ENV CARGO_HOME=/root/.cargo
ENV RUSTUP_HOME=/root/.rustup
ENV PATH="${CARGO_HOME}/bin:${PATH}"

RUN mkdir -p ${CARGO_HOME} ${RUSTUP_HOME}

# ----------------------------------
# Install rustup + nightly + components + cargo-nextest
# ----------------------------------
# RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --no-modify-path \
#     && ${CARGO_HOME}/bin/rustup toolchain install nightly \
#     && ${CARGO_HOME}/bin/rustup default nightly \
#     && ${CARGO_HOME}/bin/rustup component add rustfmt clippy rust-analyzer \
#     && ${CARGO_HOME}/bin/cargo install cargo-nextest --locked

# ----------------------------------
# Set working directory
# ----------------------------------
WORKDIR /workspace

# ----------------------------------
# Default command
# ----------------------------------
CMD ["nvim"]
